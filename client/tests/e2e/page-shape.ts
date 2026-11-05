import { expect, test, type Locator, type Page } from '@playwright/test';

// The shape of a page: how wide it is, how tall it is, and what it looks like.
//
// Every other check in this repository reads text. None of them can see that a
// dashboard came out 3,917px tall with most of it empty, which is what T15
// shipped and what three blind reviews passed: a person had to open the page
// and say so. These are the two measurements that person makes at a glance,
// written down so that a test makes them instead.

/**
 * A page wider than its window by more than this many pixels is pushing itself
 * sideways. One pixel of slack, because a layout measured in fractions of a
 * pixel rounds up.
 */
const ALLOWED_SIDEWAYS_PIXELS = 1;

/**
 * Fails when something on the page is wider than the window, which is what
 * makes a phone scroll sideways. The usual culprit is a line of text that may
 * not wrap: `truncate` sets `white-space: nowrap`, and an element that may not
 * wrap is as wide as its text however narrow its column is.
 */
export async function expectNoSidewaysOverflow(page: Page): Promise<void> {
	// How much wider the page is than the window. Anything above zero means
	// something is pushing the page sideways.
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);

	expect(overflow).toBeLessThanOrEqual(ALLOWED_SIDEWAYS_PIXELS);
}

/**
 * Fails when the page is taller than `screens` windows stacked on top of each
 * other. There is no right answer for every page, so each test says what it
 * expects: an article may run long, but a dashboard that needs five screens is
 * a dashboard whose rows are drawn too big to be scanned.
 */
export async function expectPageFitsInScreens(page: Page, screens: number): Promise<void> {
	const measured = await page.evaluate(() => ({
		pageHeight: document.documentElement.scrollHeight,
		windowHeight: window.innerHeight
	}));

	const screensUsed = (measured.pageHeight / measured.windowHeight).toFixed(1);
	const message = `The page is ${measured.pageHeight}px tall on a ${measured.windowHeight}px window, which is ${screensUsed} screens.`;

	expect(measured.pageHeight, message).toBeLessThanOrEqual(measured.windowHeight * screens);
}

/**
 * Fails when `locator` is not drawn wholly inside the first screen, so that a
 * visitor has to scroll to see it. What a page puts on its first screen is its
 * promise of what matters most, such as the speaker and the clock of a room.
 */
export async function expectOnFirstScreen(page: Page, locator: Locator): Promise<void> {
	const box = await locator.boundingBox();
	const windowHeight = await page.evaluate(() => window.innerHeight);

	expect(box, 'The element is not drawn at all.').not.toBeNull();
	// `box` is not null past the line above; `?? 0` only satisfies the type check.
	const bottom = (box?.y ?? 0) + (box?.height ?? 0);
	expect(bottom, `It ends at ${bottom}px on a ${windowHeight}px window.`).toBeLessThanOrEqual(
		windowHeight
	);
}

/**
 * Writes a picture of the whole page into `test-results/page-shape/` and hangs
 * it on the test report, so that a failed measurement above can be looked at
 * rather than guessed at. The project name is in the file name because the same
 * test runs at 1280px and at 390px.
 */
export async function saveFullPageScreenshot(page: Page, name: string): Promise<void> {
	const fileName = `${name}-${test.info().project.name}.png`;
	const path = `test-results/page-shape/${fileName}`;

	await page.screenshot({ path, fullPage: true });
	await test.info().attach(fileName, { path, contentType: 'image/png' });
}

/**
 * The most a page may move about on its own while it loads. Chrome's Web
 * Vitals call a cumulative layout shift of 0.1 or less "good": 0.1 is, roughly,
 * a tenth of the screen moving by its own height.
 */
const MAX_LAYOUT_SHIFT = 0.1;

/**
 * How long to keep watching once the page has loaded, for anything that turns
 * up late and pushes the rest down: a font, a picture, a banner.
 */
const LAYOUT_SETTLE_MS = 1_000;

/**
 * Fails when the page moved about by itself while it loaded, which is what
 * makes a visitor press the wrong thing as it jumps from under their finger.
 *
 * Chrome writes down every such movement as a `layout-shift` performance entry,
 * with how much of the screen moved and how far. `buffered: true` hands over
 * the ones from before this function was called as well, so this adds up every
 * movement since the page began loading.
 *
 * Call it straight after opening the page, before pressing anything. Chrome
 * marks a movement just after a press as asked for (`hadRecentInput`), but it
 * cannot be relied on to leave those out: Playwright's phone emulation counts
 * as a press about a tenth of a second into every page, which would hide the
 * very movements this is looking for. So every entry is counted.
 */
export async function expectLittleLayoutShift(page: Page): Promise<void> {
	await page.waitForLoadState('load');

	const shifts = await page.evaluate(
		(settleMs) =>
			new Promise<{ value: number; movedElements: string[] }[]>((resolve) => {
				// TypeScript's own list of browser types has no `layout-shift` entry
				// yet, so the two fields read here are described by hand.
				type LayoutShiftEntry = PerformanceEntry & {
					value: number;
					sources?: { node?: Node | null }[];
				};

				const found: { value: number; movedElements: string[] }[] = [];

				function recordShifts(entries: PerformanceEntry[]): void {
					for (const entry of entries as LayoutShiftEntry[]) {
						// Which elements moved, so a failure says where to look.
						const movedElements = (entry.sources ?? []).map(
							(source) => source.node?.nodeName.toLowerCase() ?? 'something no longer on the page'
						);

						found.push({ value: entry.value, movedElements });
					}
				}

				const observer = new PerformanceObserver((list) => recordShifts(list.getEntries()));

				observer.observe({ type: 'layout-shift', buffered: true });
				setTimeout(() => {
					// The browser hands entries over a little later than they happen,
					// and `disconnect` would throw away any still on their way, so
					// those are taken first.
					recordShifts(observer.takeRecords());
					observer.disconnect();
					resolve(found);
				}, settleMs);
			}),
		LAYOUT_SETTLE_MS
	);

	const total = shifts.reduce((sum, shift) => sum + shift.value, 0);
	const described = shifts.map(
		(shift) => `${shift.value.toFixed(3)} (${shift.movedElements.join(', ')})`
	);
	const message = `The page moved by itself ${shifts.length} times while loading, ${total.toFixed(3)} in all: ${described.join('; ')}.`;

	expect(total, message).toBeLessThanOrEqual(MAX_LAYOUT_SHIFT);
}

/**
 * How many pixels one rem is in this window: the font size `html` sets. It is
 * 16px on a phone and a tablet, and from `lg` up it grows with the window, 14px
 * at 1280px (Trello WMcXfry0), all times `--page-scale` (1.1), so a size the
 * spec gives at 16px is checked as rem times this.
 */
export async function remInPixels(page: Page): Promise<number> {
	return page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
}

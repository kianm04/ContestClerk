import { expect, test, type Locator, type Page } from '@playwright/test';

// The product owner's screen, which every step of creating a conference has to
// fit without scrolling (Trello fe3reN7Y). They work on a 1920 by 1080 screen
// at 150%, so their browser shows 1265 by 634 CSS pixels: much shorter than the
// 1280 by 800 window the other tests use. A step that fits there fits on any
// laptop. Each `create-*.spec.ts` sets this window, measures and keeps a
// picture of the step to hold beside the owner's mockup.

/** The window the product owner sees, in CSS pixels. */
export const OWNER_VIEWPORT = { width: 1265, height: 634 };

/**
 * Fails when the page is taller than the window, so that the owner would have
 * to scroll to reach the end of the step. One pixel of slack, because a layout
 * measured in fractions of a pixel rounds up.
 */
export async function expectFitsOwnerScreen(page: Page): Promise<void> {
	const measured = await page.evaluate(() => ({
		pageHeight: document.scrollingElement?.scrollHeight ?? document.body.scrollHeight,
		windowHeight: window.innerHeight
	}));

	expect(
		measured.pageHeight,
		`The step is ${measured.pageHeight}px tall on a ${measured.windowHeight}px window.`
	).toBeLessThanOrEqual(measured.windowHeight + 1);
}

/**
 * Fails when the page runs more than `allowance` pixels past the window. For
 * the steps that may scroll a little rather than shrink: Setup, which the
 * owner asked to be roomier, and Launch, whose last facts the design cut off
 * at the foot of the board. The measured height goes on the report.
 */
export async function expectScrollsAtMost(
	page: Page,
	allowance: number,
	name = 'page'
): Promise<void> {
	const measured = await page.evaluate(() => ({
		pageHeight: document.scrollingElement?.scrollHeight ?? document.body.scrollHeight,
		windowHeight: window.innerHeight
	}));
	test.info().annotations.push({
		type: 'measured',
		description: `${name}: ${measured.pageHeight}px tall on a ${measured.windowHeight}px window`
	});

	expect(
		measured.pageHeight,
		`The step is ${measured.pageHeight}px tall on a ${measured.windowHeight}px window.`
	).toBeLessThanOrEqual(measured.windowHeight + allowance);
}

/**
 * Fails when `target` cannot be brought wholly into view above the footer,
 * however far the page is scrolled. The footer sticks to the bottom of the
 * window, so a step that runs past the window must still end above it, not
 * under it, once scrolled to its end.
 */
export async function expectReachableAboveFooter(page: Page, target: Locator): Promise<void> {
	await page.evaluate(() => window.scrollTo(0, document.scrollingElement?.scrollHeight ?? 0));
	const targetBox = await target.boundingBox();
	const footerBox = await page.locator('.creation-footer').boundingBox();
	expect(targetBox, 'The target is drawn.').not.toBeNull();
	expect(footerBox, 'The footer is drawn.').not.toBeNull();

	expect(targetBox!.y, 'The target starts inside the window.').toBeGreaterThanOrEqual(0);
	expect(
		targetBox!.y + targetBox!.height,
		`The target ends at ${targetBox!.y + targetBox!.height}px, the footer starts at ${footerBox!.y}px.`
	).toBeLessThanOrEqual(footerBox!.y + 1);
}

/**
 * Fails when the title row (the back link, the title, its line and the step
 * indicator) takes more than `maximum` pixels between the bottom of the top
 * bar and the top of the first panel.
 */
export async function expectStepTitleRowWithin(page: Page, maximum: number): Promise<void> {
	const height = await page.evaluate(() => {
		const topBar = document.querySelector('header');
		const firstPanel = document.querySelector('main section');
		if (!topBar || !firstPanel) {
			return Number.POSITIVE_INFINITY;
		}
		return firstPanel.getBoundingClientRect().top - topBar.getBoundingClientRect().bottom;
	});

	expect(height, `The title row is ${height}px tall.`).toBeLessThanOrEqual(maximum);
}

/**
 * Writes what the window shows, and only that, to
 * `test-results/page-shape/<name>-owner.png` and hangs it on the report, so the
 * step can be looked at beside its mockup.
 */
export async function saveOwnerScreenshot(page: Page, name: string): Promise<void> {
	const fileName = `${name}-owner.png`;
	const path = `test-results/page-shape/${fileName}`;

	// `animations: 'disabled'` finishes any colour change still under way, such
	// as the step indicator's circle turning blue just after a step loads, so
	// the picture shows the screen as it settles.
	await page.screenshot({ path, animations: 'disabled' });
	await test.info().attach(fileName, { path, contentType: 'image/png' });
}

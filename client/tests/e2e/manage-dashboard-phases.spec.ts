import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoSidewaysOverflow } from './page-shape';
import { signIn } from './signed-in-user';
import { ELEANOR } from './walkthrough-seed';

// T173: the conference dashboard across the conference's phases
// (`specs/05-pages/organiser/dashboard.md`, "Layout", "States" and the
// "Streamlining" acceptance criteria), as the manage redesign draws it. Each
// test reads the dashboard of one of the walkthrough seed's conferences as
// Eleanor, who organises all five, so the page is the one T163's walk by hand
// finds:
//
// * Setup: a draft has no dashboard, so its address sends Eleanor on to the
//   setup step to continue;
// * Applications: "Needs you" first, then "Waiting for a decision" beside the
//   committees, each with the way into its chair room;
// * Allocation: four days out with seats given out, so the committees table
//   sits beside "Before the first day" and there is no quiet action left to
//   offer;
// * Conference days: day 2 of 3, with the panel and its one filled button,
//   then "Rooms", then "Today" beside "Needs you".
//
// After is read in `manage-dashboard.spec.ts`, on a conference of its own that
// ran in 2020, because the seed has no conference that is over.
//
// Nothing here changes a row, so every test runs on all three projects, which
// covers both widths and a page with no JavaScript. Other test files start and
// end sessions and take roll calls in the running conference's rooms while
// these run, so the counts are matched by their shape rather than their value.

/** The seed's walkthrough conferences, by the phase each is in on any day. */
const DRAFT_PATH = '/manage/northbridge-draft';
const APPLICATIONS_OPEN_PATH = '/manage/northbridge-applications-open';
const ABOUT_TO_START_PATH = '/manage/northbridge-about-to-start';
const RUNNING_TODAY_PATH = '/manage/northbridge-running-today';

/**
 * How long an assertion that waits on a page reading the database may take,
 * for the reason `manage-dashboard.spec.ts` gives.
 */
const DATABASE_TIMEOUT_MS = 15_000;

/**
 * Every filled (primary) button or button-styled link the reader can see, of
 * which P1 allows one at most. `bg-primary` is the primary variant's fill in
 * `$lib/button-classes.ts`.
 * `bg-brand-900` is the old name the chair room's own buttons still use.
 */
function filledControls(page: Page): Locator {
	return page
		.getByRole('main')
		.locator(
			'a:is(.bg-primary, .bg-brand-900):visible, button:is(.bg-primary, .bg-brand-900):visible'
		);
}

/** One of the page's blocks, which `ManageSection` names after its own title. */
function block(page: Page, title: string): Locator {
	return page.getByRole('main').getByRole('region', { name: title, exact: true });
}

/** Sign Eleanor in and open one of her dashboards, waiting until its title is drawn. */
async function openDashboard(page: Page, path: string): Promise<void> {
	await signIn(page, ELEANOR);
	await page.goto(path);
	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
}

/** The titles of the page's blocks, top to bottom. */
async function blockTitlesInOrder(page: Page): Promise<string[]> {
	const regions = page.getByRole('main').locator('section[aria-label]');

	return regions.evaluateAll((sections) =>
		sections.map((section) => section.getAttribute('aria-label') ?? '')
	);
}

/** The sentence under the dashboard's title, which says where the conference is. */
function summary(page: Page): Locator {
	return page.getByRole('main').locator('header p');
}

/** 1 when the first "Needs you" line carries a filled button, otherwise 0. */
async function filledControlsOfFirstLine(page: Page): Promise<number> {
	const lines = block(page, 'Needs you').getByRole('listitem');

	if ((await lines.count()) === 0) {
		return 0;
	}

	return lines.first().locator(':is(.bg-primary, .bg-brand-900)').count();
}

test('Setup: a draft has no dashboard, so its address sends the organiser on to a creation step', async ({
	page
}) => {
	await signIn(page, ELEANOR);
	await page.goto(DRAFT_PATH);

	// A draft is finished in the creation flow (Trello fe3reN7Y), at the step
	// its `creation_step` names. Which one is the seed's business, so any of
	// the four a draft can stand on will do.
	await expect(page).toHaveURL(/\/create\/northbridge-draft\/(basics|when|setup|launch)$/, {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(block(page, 'Needs you')).toHaveCount(0);
	await expect(page.getByRole('main').getByRole('button', { name: 'Archive' })).toHaveCount(0);

	await expectNoSidewaysOverflow(page);
});

test('Applications: "Needs you" leads, above the waiting list and the committees', async ({
	page
}) => {
	await openDashboard(page, APPLICATIONS_OPEN_PATH);

	await expect(summary(page)).toHaveText(
		/^Applications are open\. They close on \w+ \d{1,2} \w+, (in \d+ days|tomorrow|later today)\.$/
	);

	const titles = await blockTitlesInOrder(page);

	expect(titles.indexOf('Needs you')).toBe(0);
	expect(titles).toContain('Waiting for a decision');
	expect(titles).toContain('Committees');
	await expect(block(page, 'Rooms')).toHaveCount(0);
	await expect(block(page, 'Before the first day')).toHaveCount(0);

	// Each committee, with its chair room one press away and the reminder that
	// a practice session there does not count.
	const committees = block(page, 'Committees');

	await expect(committees).toContainText('Economic and Social Council');
	await expect(committees.getByRole('link', { name: 'Open chair room' })).toBeVisible();
	await expect(committees).toContainText(
		'Try the room before the day: a practice session does not count as Session 1.'
	);

	// One filled button at most, and it is the first "Needs you" line's.
	await expect(filledControls(page)).toHaveCount(await filledControlsOfFirstLine(page));
	await expect(page.getByRole('main').getByRole('button', { name: 'Archive' })).toHaveCount(0);

	await expectNoSidewaysOverflow(page);
});

test('Allocation: the sentence counts down to the first day, and a seated conference has no quiet action', async ({
	page
}) => {
	await openDashboard(page, ABOUT_TO_START_PATH);

	await expect(summary(page)).toHaveText(
		/^Applications closed on \d{1,2} \w+\. The conference starts on \w+ \d{1,2} \w+, (in \d+ days|tomorrow)\.$/
	);
	await expect(block(page, 'Needs you')).toBeVisible();
	await expect(block(page, 'Before the first day')).toBeVisible();
	await expect(block(page, 'Waiting for a decision')).toHaveCount(0);

	// The committees with their seats, each with the way into its chair room:
	// a table on a computer and a list on a phone. `getByRole` finds only the
	// one the window shows.
	const committees = block(page, 'Committees');

	await expect(committees).toContainText('HRC');
	await expect(committees.getByRole('link', { name: 'Open chair room' })).toHaveCount(2);

	// Maya holds a seat here, so "Unpublish" would only ever be refused, and
	// "Archive" waits until the conference is over.
	await expect(block(page, 'If plans change')).toHaveCount(0);
	await expect(block(page, 'When everything is done')).toHaveCount(0);
	await expect(filledControls(page)).toHaveCount(await filledControlsOfFirstLine(page));

	await expectNoSidewaysOverflow(page);
});

test('Conference days: the panel, then Rooms, then Today beside "Needs you", with one filled button', async ({
	page
}) => {
	await openDashboard(page, RUNNING_TODAY_PATH);

	const main = page.getByRole('main');

	await expect(summary(page)).toHaveText(/^Day 2 of 3 · \w+ \d{1,2} \w+$/);
	// A regular expression is tested against the raw text, and the status dot
	// sits before the words with a space between, which is what `\s*` allows.
	await expect(
		main.getByText(/^\s*(\d of 4 committees in session|No committee in session)\s*$/)
	).toBeVisible();

	// The order `05-pages/organiser/dashboard.md` draws. On a conference day
	// there are no figures under the title: the rooms are the figures.
	const titles = await blockTitlesInOrder(page);

	expect(titles).toEqual(['Rooms', 'Today', 'Needs you']);
	await expect(main.getByText('Seats filled')).toHaveCount(0);

	// Each room: its session and who is present, and the way into it. The
	// rooms are a table on a computer and a list on a phone, and the innerText
	// of the block holds only the one the window shows.
	const rooms = block(page, 'Rooms');
	const roomsText = await rooms.innerText();

	expect(roomsText.indexOf('UNSC')).toBeGreaterThanOrEqual(0);
	expect(roomsText.indexOf('UNSC')).toBeLessThan(roomsText.indexOf('SOCHUM'));
	expect(roomsText).toMatch(/Session \d|Not in session/);
	// The Security Council, the Third Committee, and ECOFIN and ExComm, which
	// the committee day of papers added and which have not sat today.
	await expect(rooms.getByRole('link', { name: 'Open chair room' })).toHaveCount(4);
	await expect(rooms).toContainText(
		/Present: \d+ of \d+ delegates in \d+ rooms? · As of \d{2}:\d{2} · Refresh/
	);

	// "Refresh" is a plain link to this same page, which loads it again.
	const refresh = rooms.getByRole('link', { name: 'Refresh' });

	await expect(refresh).toHaveAttribute('href', /\/manage\/northbridge-running-today$/);
	await refresh.click();
	await expect(page).toHaveURL(RUNNING_TODAY_PATH);
	await expect(block(page, 'Rooms')).toContainText('As of', { timeout: DATABASE_TIMEOUT_MS });

	// Today links to the whole schedule from its heading.
	await expect(block(page, 'Today').getByRole('link', { name: 'Schedule' })).toBeVisible();

	// The panel's "Post an announcement" is the page's one filled button, so
	// no "Needs you" line is filled and every room's button is secondary.
	await expect(filledControls(page)).toHaveCount(1);
	await expect(filledControls(page)).toHaveText('Post an announcement');
	await expect(block(page, 'If plans change')).toHaveCount(0);
	await expect(block(page, 'When everything is done')).toHaveCount(0);

	await expectNoSidewaysOverflow(page);
});

test('on a phone each room\'s "Open chair room" is big enough for a thumb and stays on the screen', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	await openDashboard(page, RUNNING_TODAY_PATH);

	// On a phone each room is a list item, with its button beside who is present.
	const firstRoom = block(page, 'Rooms').getByRole('listitem').first();
	const button = firstRoom.getByRole('link', { name: 'Open chair room' });

	const roomBox = await firstRoom.boundingBox();
	const buttonBox = await button.boundingBox();

	expect(roomBox).not.toBeNull();
	expect(buttonBox).not.toBeNull();
	// 44 CSS pixels is the smallest target a thumb hits reliably (`min-h-11`).
	expect(buttonBox!.height).toBeGreaterThanOrEqual(44);
	expect(buttonBox!.x + buttonBox!.width).toBeLessThanOrEqual(roomBox!.x + roomBox!.width + 1);
});

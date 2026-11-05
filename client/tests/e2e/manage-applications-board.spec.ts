import { expect, test, type Locator, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	addScheduleCommittee,
	createScheduleConference,
	type ScheduleConference
} from './schedule-fixtures';
import {
	expectNoSidewaysOverflow,
	expectPageFitsInScreens,
	saveFullPageScreenshot
} from './page-shape';
import { createTestUser, giveApplication, signIn } from './signed-in-user';

// T135: the organiser's applications page has a board view, one column per
// state, where an application is dragged from one column to another. A drop
// posts to the bulk bar's own actions: Waitlisted decides at once, Accepted and
// Not accepted first open the bulk bar's seat panel or note panel. A refusal or
// a lost request puts the card back and says why.
//
// Dragging needs JavaScript and a mouse, so those tests run on `desktop` only.
// The tabs and the bulk bar are the way without either, and the last test shows
// they still work on `desktop-no-js` and on a phone, where no handle is drawn.
//
// The conference is written with the service-role client through
// `schedule-fixtures.ts`, as `manage-allocation-drag.spec.ts` does. Its
// committee, its seat and its applicants are this test's own, so no two
// projects running at once see each other's rows.

/** How long an assertion that waits on the database may take (see `manage-allocation.spec.ts`). */
const DATABASE_TIMEOUT_MS = 15_000;

/** How soon a drop must show on the board, before the server has answered. */
const AT_ONCE_TIMEOUT_MS = 1_000;

/**
 * How many windows tall the board may be. On a phone its four columns stack,
 * each with its heading and its few cards, so it is allowed more than one screen.
 */
const BOARD_PAGE_SCREENS = 3;

/** Anna's handle, found by its title because the handle is hidden from screen readers. */
const ANNA_HANDLE_TITLE = 'Drag Anna Kowalski to another column';

/** The conference each test works on: one committee with one free seat, and Anna under review. */
type BoardFixture = {
	conference: ScheduleConference;
	annaApplicationId: string;
	seatId: string;
};

/** Build the conference above and sign its organiser in. */
async function seedBoard(page: Page, prefix: string): Promise<BoardFixture> {
	const organiser = await createTestUser('Priya Nair');
	const conference = await createScheduleConference({ owner: organiser, namePrefix: prefix });
	const committeeId = await addScheduleCommittee(conference.id, {
		name: 'World Health Organization',
		abbreviation: 'WHO',
		position: 0
	});
	const anna = await createTestUser('Anna Kowalski');
	const annaApplicationId = await giveApplication(anna, {
		conferenceId: conference.id,
		status: 'submitted',
		committeePreferences: [committeeId],
		motivation: 'I have chaired twice and would like a seat this year.'
	});

	const admin = createServiceRoleClient();
	const { data, error } = await admin
		.from('seats')
		.insert({ committee_id: committeeId, name: 'France', country_code: 'FR', position: 0 })
		.select('id')
		.single();

	if (error || !data) throw new Error(`Could not write the test seat: ${error?.message}`);

	await signIn(page, organiser);

	return { conference, annaApplicationId, seatId: data.id };
}

/** Open the applications page, on the board or with some other query, and wait for its heading. */
async function openApplications(page: Page, fixture: BoardFixture, query: string): Promise<void> {
	await page.goto(`/manage/${fixture.conference.slug}/applications${query}`);
	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(
		'Applications',
		{ timeout: DATABASE_TIMEOUT_MS }
	);
}

/** One column of the board, by the state it holds. */
function column(page: Page, status: string): Locator {
	return page.locator(`[data-drop-target="${status}"]`);
}

/** A drag handle by its title, once the page's script has drawn it. */
async function readyHandle(page: Page, title: string): Promise<Locator> {
	const handle = page.locator(`[title="${title}"]:visible`);
	await expect(handle).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	return handle;
}

/** The middle of an element on the page, in pixels. */
async function middleOf(locator: Locator): Promise<{ x: number; y: number }> {
	const box = await locator.boundingBox();

	if (!box) throw new Error('The element is not on the screen.');

	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Press the mouse on `handle`, move it in small steps over `target`, and let go. */
async function dragOnto(page: Page, handle: Locator, target: Locator): Promise<void> {
	const from = await middleOf(handle);
	const to = await middleOf(target);

	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	await page.mouse.move(to.x, to.y, { steps: 12 });
	await page.mouse.up();
}

/** Anna's application as the database has it now. */
async function readApplication(
	applicationId: string
): Promise<{ status: string; decision_note: string | null }> {
	const admin = createServiceRoleClient();
	const { data, error } = await admin
		.from('applications')
		.select('status, decision_note')
		.eq('id', applicationId)
		.single();

	if (error || !data) throw new Error(`Could not read the test application: ${error?.message}`);

	return data;
}

test('an application dragged to Waitlisted moves there at once, and it is kept', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'A mouse drag needs JavaScript and a mouse.');
	const fixture = await seedBoard(page, 'Board Waitlist MUN');

	await openApplications(page, fixture, '?view=board');
	const handle = await readyHandle(page, ANNA_HANDLE_TITLE);
	await dragOnto(page, handle, column(page, 'waitlisted'));

	await expect(column(page, 'waitlisted')).toContainText('Anna Kowalski', {
		timeout: AT_ONCE_TIMEOUT_MS
	});
	await expect(column(page, 'submitted')).not.toContainText('Anna Kowalski');
	await expect(page.getByText('1 application waitlisted.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect((await readApplication(fixture.annaApplicationId)).status).toBe('waitlisted');

	// The redirect after the decision came back to the board, not the table.
	await page.reload();
	await expect(column(page, 'waitlisted')).toContainText('Anna Kowalski', {
		timeout: DATABASE_TIMEOUT_MS
	});
});

test('an application dragged to Not accepted asks for the note first, then is kept', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'A mouse drag needs JavaScript and a mouse.');
	const fixture = await seedBoard(page, 'Board Reject MUN');

	await openApplications(page, fixture, '?view=board');
	const handle = await readyHandle(page, ANNA_HANDLE_TITLE);
	await dragOnto(page, handle, column(page, 'rejected'));

	// The bulk bar's note panel opens, and nothing is decided until it is pressed.
	const main = page.getByRole('main');
	await expect(main.getByRole('heading', { name: 'Mark 1 as not accepted' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(column(page, 'rejected')).toContainText('Anna Kowalski');
	expect((await readApplication(fixture.annaApplicationId)).status).toBe('submitted');

	await main.getByLabel('Note for the applicants').fill('We had more applicants than seats.');
	await main.getByRole('button', { name: 'Mark 1 as not accepted' }).click();

	await expect(page.getByText('1 application marked as not accepted.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect(await readApplication(fixture.annaApplicationId)).toEqual({
		status: 'rejected',
		decision_note: 'We had more applicants than seats.'
	});

	await page.reload();
	await expect(column(page, 'rejected')).toContainText('Anna Kowalski', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(column(page, 'submitted')).not.toContainText('Anna Kowalski');
});

test('an application dragged to Accepted is seated once a seat is chosen', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'A mouse drag needs JavaScript and a mouse.');
	const fixture = await seedBoard(page, 'Board Accept MUN');

	await openApplications(page, fixture, '?view=board');
	const handle = await readyHandle(page, ANNA_HANDLE_TITLE);
	await dragOnto(page, handle, column(page, 'accepted'));

	const main = page.getByRole('main');
	const seatChoice = main.locator(`select[name="seat:${fixture.annaApplicationId}"]`);
	await expect(seatChoice).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await seatChoice.selectOption(fixture.seatId);
	await main.getByRole('button', { name: 'Accept 1 application' }).click();

	await expect(page.getByText('1 application accepted.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect((await readApplication(fixture.annaApplicationId)).status).toBe('accepted');

	await page.reload();
	await expect(column(page, 'accepted')).toContainText('Anna Kowalski', {
		timeout: DATABASE_TIMEOUT_MS
	});
	// Taking back an acceptance is the review page's Revoke, so Anna has no handle now.
	await expect(page.locator(`[title="${ANNA_HANDLE_TITLE}"]`)).toHaveCount(0);
});

test('a move the server refuses goes back and says why', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'A mouse drag needs JavaScript and a mouse.');
	const fixture = await seedBoard(page, 'Board Refused MUN');

	await openApplications(page, fixture, '?view=board');
	const handle = await readyHandle(page, ANNA_HANDLE_TITLE);

	// Anna withdraws after the board was drawn, so the page still shows her
	// under review and the server is the one to say no.
	const admin = createServiceRoleClient();
	const { error } = await admin
		.from('applications')
		.update({ status: 'withdrawn' })
		.eq('id', fixture.annaApplicationId);

	if (error) throw new Error(`Could not withdraw the test application: ${error.message}`);

	await dragOnto(page, handle, column(page, 'rejected'));

	await expect(page.getByText('Nothing changed. 1 was already decided.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(column(page, 'rejected')).not.toContainText('Anna Kowalski');
	await expect(page.getByRole('heading', { name: 'Mark 1 as not accepted' })).toHaveCount(0);
	expect((await readApplication(fixture.annaApplicationId)).status).toBe('withdrawn');
});

test('a drop that never reaches the server goes back and says so', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'A mouse drag needs JavaScript and a mouse.');
	const fixture = await seedBoard(page, 'Board Offline MUN');

	await openApplications(page, fixture, '?view=board');
	const handle = await readyHandle(page, ANNA_HANDLE_TITLE);
	await page.route(
		(url) => url.search.includes('/bulkWaitlist'),
		(route) => route.abort()
	);
	await dragOnto(page, handle, column(page, 'waitlisted'));

	await expect(
		page.getByText('That did not reach the server. Check your connection and try again.')
	).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(column(page, 'submitted')).toContainText('Anna Kowalski');
	await expect(column(page, 'waitlisted')).not.toContainText('Anna Kowalski');
	expect((await readApplication(fixture.annaApplicationId)).status).toBe('submitted');
});

test('without a mouse or a script the tabs and the bulk bar still decide', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name === 'desktop', 'The desktop drags; this is the other way.');
	const fixture = await seedBoard(page, 'Board Fallback MUN');
	const main = page.getByRole('main');

	// The board still lists Anna, but no handle is drawn: without a script there
	// is nothing to drag with, and on a phone the handle is hidden.
	await openApplications(page, fixture, '?view=board');
	await expect(column(page, 'submitted')).toContainText('Anna Kowalski');
	await expect(main.locator(`[title="${ANNA_HANDLE_TITLE}"]:visible`)).toHaveCount(0);

	await main.getByRole('navigation', { name: 'View' }).getByRole('link', { name: 'Table' }).click();
	await main
		.getByRole('checkbox', { name: 'Select Anna Kowalski' })
		.locator('visible=true')
		.check();
	await main.getByRole('status').getByRole('button', { name: 'Waitlist' }).click();

	await expect(page.getByText('1 application waitlisted.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect((await readApplication(fixture.annaApplicationId)).status).toBe('waitlisted');

	await main
		.getByRole('navigation', { name: 'Sections' })
		.getByRole('link', { name: /^Waitlisted/ })
		.click();
	await expect(
		main.getByRole('link', { name: 'Anna Kowalski', exact: true }).locator('visible=true')
	).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
});

test('the board fits its window on a desktop and on a phone', async ({ page }) => {
	const fixture = await seedBoard(page, 'Board Shape MUN');

	await openApplications(page, fixture, '?view=board');
	await expect(column(page, 'submitted')).toContainText('Anna Kowalski');

	await saveFullPageScreenshot(page, 'manage-applications-board');
	await expectNoSidewaysOverflow(page);
	await expectPageFitsInScreens(page, BOARD_PAGE_SCREENS);
});

import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { ClickBudgetJourney, type JourneyCount } from './click-budget';
import { expectNoSidewaysOverflow, expectOnFirstScreen } from './page-shape';
import { createTestUser, signIn } from './signed-in-user';

// Quick sessions (S14; `specs/05-pages/chair/quick-session.md`): setting a
// committee up on `/quick/new` the way myMUN's "Set up new committee" does,
// starting its first session, and "Edit delegations" of a kept one. Every test
// makes its own account and its own quick session, so they run side by side
// on all three projects. Each draft button works without JavaScript by posting
// the whole form, so most tests hold on `desktop-no-js` as well; the ones about
// what JavaScript adds skip it.

/** How long an assertion that waits on the database or a page load may take. */
const DATABASE_TIMEOUT_MS = 15_000;

/**
 * Budget "A quick session from `/home`": "Run a quick session", the name,
 * "Security Council", "Start session": 3 clicks, 2 pages, 1 typed field, 0
 * decisions, counted from `/home`.
 */
const QUICK_SESSION_BUDGET: JourneyCount = { clicks: 3, pages: 2, typedFields: 1, decisions: 0 };

/** Without JavaScript "Security Council" reloads the page: one page more. */
const QUICK_SESSION_BUDGET_WITHOUT_SCRIPT: JourneyCount = { ...QUICK_SESSION_BUDGET, pages: 3 };

/** The address of a quick session's chair room, whatever its random slug. */
const CHAIR_ROOM = /\/conferences\/quick-[a-z0-9]{10}\/committees\/[a-z0-9-]+\/chair$/;

/** Whether the test runs with JavaScript switched off. */
function isWithoutScript(testInfo: TestInfo): boolean {
	return testInfo.project.name === 'desktop-no-js';
}

/** The difference between two counts, for a journey measured from `/home` rather than from sign-in. */
function stepBetween(before: JourneyCount, after: JourneyCount): JourneyCount {
	return {
		clicks: after.clicks - before.clicks,
		pages: after.pages - before.pages,
		typedFields: after.typedFields - before.typedFields,
		decisions: after.decisions - before.decisions
	};
}

/** Fail when a step measured on its own goes over its budget, which is a ceiling. */
function expectStepWithin(step: JourneyCount, budget: JourneyCount): void {
	expect(step.clicks, 'clicks').toBeLessThanOrEqual(budget.clicks);
	expect(step.pages, 'pages').toBeLessThanOrEqual(budget.pages);
	expect(step.typedFields, 'typed fields').toBeLessThanOrEqual(budget.typedFields);
	expect(step.decisions, 'decisions').toBeLessThanOrEqual(budget.decisions);
}

/** Sign a new account in and open `/quick/new`. */
async function openSetup(page: Page): Promise<void> {
	await signIn(page, await createTestUser());
	await page.goto('/quick/new');
	await expect(page.getByRole('heading', { level: 1, name: 'Run a quick session' })).toBeVisible();
	await waitForSetupScript(page);
}

/**
 * When the browser runs JavaScript, wait until the page's script has taken it
 * over. Until then the page is the server's HTML and every button is the
 * no-JavaScript one: a press posts the whole form and reloads, which a test of
 * what the script does would read as a request it should not have sent. The
 * "Search" beside the search box is drawn only until `onMount` runs, after
 * every component of the page is live, so its going is the sign. (The hidden
 * button Enter presses is also called "Search", but it is out of the
 * accessibility tree, which `getByRole` reads.)
 */
async function waitForSetupScript(page: Page): Promise<void> {
	if (test.info().project.use.javaScriptEnabled === false) return;

	await expect(page.getByRole('button', { name: 'Search', exact: true })).toHaveCount(0, {
		timeout: DATABASE_TIMEOUT_MS
	});
}

/** The hidden `member` fields, one per member of the committee. */
function memberFields(page: Page) {
	return page.locator('input[type="hidden"][name="member"]');
}

/** The values of the hidden `member` fields, in the order the committee lists them. */
function memberValues(page: Page): Promise<string[]> {
	return memberFields(page).evaluateAll((fields) =>
		fields.map((field) => (field as HTMLInputElement).value)
	);
}

/** The "Your committee" column. */
function committeeColumn(page: Page) {
	return page.getByRole('region', { name: 'Your committee' });
}

/**
 * Type into the search box. Without JavaScript the search is sent with its
 * "Search" button; with it the list follows the box by itself.
 */
async function search(page: Page, text: string, testInfo: TestInfo): Promise<void> {
	await page.getByLabel('Search countries').fill(text);

	if (isWithoutScript(testInfo)) {
		await page.getByRole('button', { name: 'Search', exact: true }).click();
	}
}

/** Set the room's sessions as ended yesterday, so the chair room shows its lobby. */
async function endSessionsYesterday(conferenceSlug: string): Promise<void> {
	const admin = createServiceRoleClient();
	const { data: committee, error } = await admin
		.from('committees')
		.select('id, conferences!inner(slug)')
		.eq('conferences.slug', conferenceSlug)
		.single();

	if (error || !committee) throw new Error(`Could not find the quick session: ${error?.message}`);

	const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
	const anHourEarlier = new Date(yesterday.getTime() - 60 * 60 * 1000);

	await admin
		.from('committee_sessions')
		.update({
			status: 'ended',
			started_at: anHourEarlier.toISOString(),
			ended_at: yesterday.toISOString()
		})
		.eq('committee_id', committee.id);
	await admin
		.from('committee_state')
		.update({ mode: 'idle', current_session_id: null, active_speakers_list_id: null })
		.eq('committee_id', committee.id);
}

/** The quick session's seats as `name:shown`, in their order. */
async function readSeats(conferenceSlug: string): Promise<string[]> {
	const admin = createServiceRoleClient();
	const { data, error } = await admin
		.from('seats')
		.select('name, is_available, committees!inner(conferences!inner(slug))')
		.eq('committees.conferences.slug', conferenceSlug)
		.order('position');

	if (error) throw new Error(`Could not read the seats: ${error.message}`);

	return (data ?? []).map((seat) => `${seat.name}:${seat.is_available ? 'shown' : 'hidden'}`);
}

test('a visitor is sent to sign in first', async ({ page }) => {
	await page.goto('/quick/new');

	await expect(page).toHaveURL('/login?next=%2Fquick%2Fnew');
});

test('budget "A quick session from /home": 3 · 2 · 1 · 0, one page more without JavaScript', async ({
	page
}, testInfo) => {
	const journey = await ClickBudgetJourney.signIn(page, await createTestUser());
	const atHome = journey.count();

	await journey.click(page.getByRole('main').getByRole('link', { name: 'Run a quick session' }));
	await journey.type(page.getByLabel('Committee name'), 'Thursday practice');
	await journey.click(page.getByRole('button', { name: 'Security Council' }));
	await expect(memberFields(page)).toHaveCount(15);
	await journey.click(page.getByRole('button', { name: 'Start session' }));

	await expect(page).toHaveURL(CHAIR_ROOM, { timeout: DATABASE_TIMEOUT_MS });
	await expect(page.getByRole('button', { name: 'Mark all present' })).toBeVisible();

	const budget = isWithoutScript(testInfo)
		? QUICK_SESSION_BUDGET_WITHOUT_SCRIPT
		: QUICK_SESSION_BUDGET;

	expectStepWithin(stepBetween(atHome, journey.count()), budget);
});

test('draws its own top line, no app header or footer, and keeps the footer in reach', async ({
	page
}, testInfo) => {
	await openSetup(page);

	await expect(page.getByRole('link', { name: 'MUNMeet home' })).toBeVisible();
	// Matched at its end: the server writes the link relative (`../home`).
	await expect(page.getByRole('link', { name: 'Cancel' })).toHaveAttribute('href', /\/home$/);
	await expect(page.getByRole('contentinfo')).toHaveCount(0);
	await expect(page.getByRole('navigation')).toHaveCount(0);

	await page.getByRole('button', { name: 'UN members' }).click();
	await expect(memberFields(page)).toHaveCount(193);

	const start = page.getByRole('button', { name: 'Start session' });

	await expectOnFirstScreen(page, start);
	await expectNoSidewaysOverflow(page);

	// The same two columns at 1024 × 768, the footer still on the first screen.
	if (testInfo.project.name !== 'phone') {
		await page.setViewportSize({ width: 1024, height: 768 });
		await expectOnFirstScreen(page, start);
		await expectNoSidewaysOverflow(page);
	}
});

test('the ready-made lists fill the committee with 193, 15 and 27 members, replacing it', async ({
	page
}) => {
	await openSetup(page);

	await page.getByRole('button', { name: 'UN members' }).click();
	await expect(memberFields(page)).toHaveCount(193);
	await page.getByRole('button', { name: 'Security Council' }).click();
	await expect(memberFields(page)).toHaveCount(15);
	await page.getByRole('button', { name: 'EU members' }).click();
	await expect(memberFields(page)).toHaveCount(27);
	await expect(committeeColumn(page).getByText('27 members')).toBeVisible();

	// Alphabetical, the order a chair calls them in.
	await expect(memberFields(page).first()).toHaveValue('country:AT');
});

test('the search filters by the start of a word, "added" marks a chosen state, and a custom member shows its initials', async ({
	page
}, testInfo) => {
	await openSetup(page);

	await search(page, 'king', testInfo);
	await expect(page.getByRole('button', { name: 'Add United Kingdom' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Add France' })).toHaveCount(0);

	await page.getByRole('button', { name: 'Add United Kingdom' }).click();
	await expect(committeeColumn(page).getByText('United Kingdom')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Add United Kingdom' })).toHaveCount(0);
	await expect(page.getByText('added', { exact: true })).toBeVisible();

	await search(page, 'Amnesty International', testInfo);
	await expect(page.getByText('No member state matches “Amnesty International”.')).toBeVisible();
	await page.getByRole('button', { name: 'Add “Amnesty International” as a member' }).click();

	await expect(committeeColumn(page).getByText('Amnesty International')).toBeVisible();
	await expect(committeeColumn(page).getByText('AI', { exact: true })).toBeVisible();
	await expect(page.getByLabel('Search countries')).toHaveValue('');
});

test('"Paste a list" adds one member per line, each once, and refuses more than 300', async ({
	page
}) => {
	await openSetup(page);

	await page.getByText('Paste a list').click();
	await page.getByLabel('One delegation per line').fill('france\nWorld Bank\nFrance\n\nGermany');
	await page.getByRole('button', { name: 'Add these' }).click();

	await expect(memberFields(page)).toHaveCount(3);
	await expect
		.poll(() => memberValues(page))
		.toEqual(['country:FR', 'country:DE', 'name:World Bank']);

	const tooMany = Array.from({ length: 301 }, (_, index) => `Member ${index}`).join('\n');

	if (!(await page.getByLabel('One delegation per line').isVisible())) {
		await page.getByText('Paste a list').click();
	}
	await page.getByLabel('One delegation per line').fill(tooMany);
	await page.getByRole('button', { name: 'Add these' }).click();

	await expect(page.getByText('Please add at most 300 delegations at a time.')).toBeVisible();
	await expect(memberFields(page)).toHaveCount(3);
});

test('"×" removes one member and "Clear all" every one', async ({ page }) => {
	await openSetup(page);

	await page.getByRole('button', { name: 'Security Council' }).click();
	await page.getByRole('button', { name: 'Remove France' }).click();
	await expect(memberFields(page)).toHaveCount(14);

	await page.getByRole('button', { name: 'Clear all' }).click();
	await expect(memberFields(page)).toHaveCount(0);
	await expect(
		page.getByText('Nobody yet. Start from a ready-made list, or add delegations one by one.')
	).toBeVisible();
});

test('"Start session" waits for two members, saying why', async ({ page }, testInfo) => {
	await openSetup(page);

	const start = page.getByRole('button', { name: 'Start session' });

	await expect(start).toBeDisabled();
	await expect(page.getByText('Add at least two members to start')).toBeVisible();

	await search(page, 'France', testInfo);
	await page.getByRole('button', { name: 'Add France' }).click();
	await expect(start).toBeDisabled();

	await search(page, 'Germany', testInfo);
	await page.getByRole('button', { name: 'Add Germany' }).click();
	await expect(start).toBeEnabled();
	await expect(
		page.getByText('Opens Session 1 straight away. The committee is kept for next time.')
	).toBeVisible();
});

test('a refused field shows its message and keeps every field and member', async ({ page }) => {
	await openSetup(page);

	await page.getByLabel('Agenda, optional').fill('Climate finance');
	await page.getByLabel('Speaking time').fill('20');
	await page.getByRole('button', { name: 'Security Council' }).click();
	await page.getByRole('button', { name: 'Start session' }).click();

	await expect(page.getByText("Please enter the committee's name.")).toBeVisible();
	await expect(
		page.getByText('Please enter a speaking time between 0:30 and 10:00.')
	).toBeVisible();
	await expect(page.getByLabel('Agenda, optional')).toHaveValue('Climate finance');
	await expect(page.getByLabel('Speaking time')).toHaveValue('20');
	await expect(memberFields(page)).toHaveCount(15);
	await expect(page).toHaveURL(/\/quick\/new/);
});

test('with JavaScript only "Start session" sends a request', async ({ page }, testInfo) => {
	test.skip(isWithoutScript(testInfo), 'Without JavaScript every button posts the form.');

	await openSetup(page);

	const posts: string[] = [];
	page.on('request', (request) => {
		if (request.method() === 'POST') posts.push(request.url());
	});

	await page.getByLabel('Committee name').fill('Model GA');
	await page.getByRole('button', { name: 'EU members' }).click();
	await page.getByRole('button', { name: 'Remove Austria' }).click();
	await page.getByRole('button', { name: 'Clear all' }).click();
	await page.getByText('Paste a list').click();
	await page.getByLabel('One delegation per line').fill('Kenya\nPress');
	await page.getByRole('button', { name: 'Add these' }).click();
	await page.getByLabel('Search countries').fill('bra');
	await page.getByRole('button', { name: 'Add Brazil' }).click();
	await expect(memberFields(page)).toHaveCount(3);
	await expect(page.getByRole('button', { name: 'Search', exact: true })).toHaveCount(0);

	expect(posts).toEqual([]);

	await page.getByRole('button', { name: 'Start session' }).click();
	await expect(page).toHaveURL(CHAIR_ROOM, { timeout: DATABASE_TIMEOUT_MS });
	expect(posts).toHaveLength(1);
	expect(posts[0]).toContain('/quick/new?/start');
});

test('without JavaScript every button posts the whole form and "Start session" starts the session', async ({
	page
}, testInfo) => {
	test.skip(!isWithoutScript(testInfo), 'This is the path without JavaScript.');

	await openSetup(page);

	await page.getByLabel('Committee name').fill('No script club');
	await page.getByRole('button', { name: 'EU members' }).click();
	await expect(page).toHaveURL(/\?\/fillFromList$/);
	await expect(page.getByLabel('Committee name')).toHaveValue('No script club');
	await page.getByRole('button', { name: 'Clear all' }).click();
	await expect(memberFields(page)).toHaveCount(0);

	await page.getByText('Paste a list').click();
	await page.getByLabel('One delegation per line').fill('Kenya\nPress');
	await page.getByRole('button', { name: 'Add these' }).click();
	await expect(memberFields(page)).toHaveCount(2);

	await search(page, 'bra', testInfo);
	await page.getByRole('button', { name: 'Add Brazil' }).click();
	await page.getByRole('button', { name: 'Remove Press' }).click();
	await expect.poll(() => memberValues(page)).toEqual(['country:BR', 'country:KE']);

	await page.getByRole('button', { name: 'Start session' }).click();
	await expect(page).toHaveURL(CHAIR_ROOM, { timeout: DATABASE_TIMEOUT_MS });
});

test('"Edit delegations" adds and hides seats, and is refused while a session runs', async ({
	page
}, testInfo) => {
	await openSetup(page);

	await page.getByLabel('Committee name').fill('Thursday practice');
	await page.getByRole('button', { name: 'Security Council' }).click();
	await page.getByRole('button', { name: 'Start session' }).click();
	await expect(page).toHaveURL(CHAIR_ROOM, { timeout: DATABASE_TIMEOUT_MS });

	const room = new URL(page.url()).pathname;
	const conferenceSlug = room.split('/')[2];

	// Session 1 is running: the page sends the chair back to the room.
	await page.goto(`/quick/${conferenceSlug}/delegations`);
	await expect(page).toHaveURL(room);
	await expect(page.getByText('End the session before changing its delegations.')).toBeVisible();

	await endSessionsYesterday(conferenceSlug);
	await page.goto(room);
	await page.getByRole('link', { name: 'Edit delegations' }).click();

	await expect(
		page.getByRole('heading', { level: 1, name: 'Edit delegations · Thursday practice' })
	).toBeVisible();
	await expect(memberFields(page)).toHaveCount(15);
	await waitForSetupScript(page);

	await page.getByRole('button', { name: 'Remove France' }).click();
	await search(page, 'Brazil', testInfo);
	await page.getByRole('button', { name: 'Add Brazil' }).click();
	await page.getByRole('button', { name: 'Save delegations' }).click();

	await expect(page).toHaveURL(room, { timeout: DATABASE_TIMEOUT_MS });
	await expect(page.getByText('Delegations saved.')).toBeVisible();

	const seats = await readSeats(conferenceSlug);

	expect(seats).toContain('Brazil:shown');
	expect(seats).toContain('France:hidden');
	expect(seats.filter((seat) => seat.endsWith(':shown'))).toHaveLength(15);
});

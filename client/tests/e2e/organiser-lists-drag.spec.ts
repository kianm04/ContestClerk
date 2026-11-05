import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { addScheduleCommittee, createScheduleConference } from './schedule-fixtures';
import { createTestUser, signIn } from './signed-in-user';

// T132: every list an organiser puts in order is dragged into order the same
// way as the speaking queue (T129): the committees, the seats of a committee,
// the questions of the application form and the fees. Each test drags the
// bottom row of three to the top with a mouse, checks the new order shows at
// once, and then that the database and a reload both keep it. The arrow
// buttons stay the way without JavaScript, and their own tests in
// `manage-committees.spec.ts`, `manage-application-form.spec.ts` and
// `manage-fees.spec.ts` still run on `desktop-no-js`.
//
// A committee's topics are dragged too, but they are fields of the committee
// form rather than rows of their own: a drop only redraws them, and the order
// is saved with "Save changes". Their test checks exactly that.
//
// The service-role client writes the starting rows the way the organiser's own
// forms would, and reads the saved order back. It never shows that something
// is allowed; the drop itself goes through the organiser's own session.

/** How long a page or the database may take to catch up. */
const DATABASE_TIMEOUT_MS = 15_000;

/** How soon a dropped row must show in its new place, before the server has answered. */
const AT_ONCE_TIMEOUT_MS = 1_000;

/** What the toast says when a request never reached the server (`$lib/in-place-form.svelte.ts`). */
const NETWORK_FAILURE_MESSAGE =
	'That did not reach the server. Check your connection and try again.';

/** The three rows every test starts with, top to bottom, and the order after the drag. */
const START_ORDER = ['Alpha', 'Bravo', 'Charlie'];
const DRAGGED_ORDER = ['Charlie', 'Alpha', 'Bravo'];

/** The tables whose order these tests read back, and what their rows are called by. */
type OrderedTable = 'committees' | 'seats' | 'application_questions' | 'fees';

/** The names of a list's rows in their saved order. */
async function readSavedOrder(
	table: OrderedTable,
	ownerColumn: 'conference_id' | 'committee_id',
	ownerId: string
): Promise<string[]> {
	const admin = createServiceRoleClient();
	const nameColumn = table === 'application_questions' ? 'label' : 'name';

	const { data, error } = await admin
		.from(table)
		.select(`id, ${nameColumn}`)
		.eq(ownerColumn, ownerId)
		.order('position')
		.order('id')
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<Record<string, string>[], { merge: false }>();

	if (error) throw new Error(`Could not read the order back: ${error.message}`);

	return (data ?? []).map((row) => row[nameColumn]);
}

/**
 * The draggable list whose rows include the handle for `rowName`. A page can
 * hold more than one: the committee editor has its topics and its seats.
 */
function listHolding(page: Page, rowName: string): Locator {
	const handle = page.getByRole('button', { name: `Reorder ${rowName}`, exact: true });

	return page.getByRole('main').locator('[data-sortable-list]').filter({ has: handle });
}

/** The middle of an element on the page, in pixels. */
async function middleOf(locator: Locator): Promise<{ x: number; y: number }> {
	const box = await locator.boundingBox();

	if (!box) throw new Error('The element is not on the screen.');

	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Drag the row named `rowName` to the top of `list` with a mouse, and let go. */
async function dragToTop(page: Page, list: Locator, rowName: string): Promise<void> {
	const handle = list.getByRole('button', { name: `Reorder ${rowName}`, exact: true });
	const rows = list.locator(':scope > li');
	// The handle is switched on once the page's JavaScript is running.
	await expect(handle).toBeEnabled({ timeout: DATABASE_TIMEOUT_MS });

	// A mouse only reaches what is on the screen, and on most of these pages
	// the list starts below the first screenful. The dragged row is brought to
	// the middle of the screen rather than only just into view, because an
	// editor's save bar sticks to the bottom of the screen and would cover it.
	await handle.evaluate((element) => element.scrollIntoView({ block: 'center' }));
	const from = await middleOf(handle);
	// Aim at the top row's own handle rather than the middle of the row: the
	// handle sits at the same height in every row, so ending just above it puts
	// the dragged row's middle just above the top row's middle, however tall
	// the rows are.
	const to = await middleOf(rows.first().getByRole('button', { name: /^Reorder / }));

	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	// Several small steps, as a hand moves, so the other rows make room on the way.
	await page.mouse.move(from.x, to.y - 10, { steps: 12 });
	await expect(rows.first()).toHaveAttribute('style', /translateY\(\d/);
	await page.mouse.up();
}

/** Check `list` draws its rows in the dragged order within `timeout` milliseconds. */
async function expectDraggedOrderShown(list: Locator, timeout: number): Promise<void> {
	await expect(list.locator(':scope > li')).toHaveText(
		DRAGGED_ORDER.map((name) => new RegExp(name)),
		{ timeout }
	);
}

/**
 * Drag Charlie to the top, check the new order shows before the server has
 * answered, then that the database holds it and a reload draws it too.
 */
async function expectDragKept(page: Page, readOrder: () => Promise<string[]>): Promise<void> {
	await dragToTop(page, listHolding(page, 'Charlie'), 'Charlie');
	await expectDraggedOrderShown(listHolding(page, 'Charlie'), AT_ONCE_TIMEOUT_MS);

	await expect.poll(readOrder, { timeout: DATABASE_TIMEOUT_MS }).toEqual(DRAGGED_ORDER);
	await page.reload();
	await expectDraggedOrderShown(listHolding(page, 'Charlie'), DATABASE_TIMEOUT_MS);
}

/** A new organiser, signed in, with a conference of their own. */
async function openOwnConference(page: Page, namePrefix: string) {
	const owner = await createTestUser('Dana Okafor');
	const conference = await createScheduleConference({ owner, namePrefix, status: 'draft' });
	await signIn(page, owner);

	return conference;
}

/** Run only on the `desktop` project: a mouse drag needs JavaScript and a mouse. */
function skipWithoutMouse(testInfo: TestInfo): void {
	test.skip(testInfo.project.name !== 'desktop', 'A mouse drag needs JavaScript and a mouse.');
}

test('the committees list is dragged into order, and the order is kept', async ({
	page
}, testInfo) => {
	skipWithoutMouse(testInfo);
	const conference = await openOwnConference(page, 'Committee Drag MUN');
	for (const [index, name] of START_ORDER.entries()) {
		await addScheduleCommittee(conference.id, { name, abbreviation: name, position: index + 1 });
	}

	await page.goto(`/manage/${conference.slug}/committees`);
	await expectDragKept(page, () => readSavedOrder('committees', 'conference_id', conference.id));
});

test('the seats of a committee are dragged into order, and the order is kept', async ({
	page
}, testInfo) => {
	skipWithoutMouse(testInfo);
	const conference = await openOwnConference(page, 'Seat Drag MUN');
	const committeeId = await addScheduleCommittee(conference.id, {
		name: 'General Assembly',
		abbreviation: 'GA'
	});
	const seats = START_ORDER.map((name, index) => ({
		committee_id: committeeId,
		name,
		position: index + 1
	}));
	const { error } = await createServiceRoleClient().from('seats').insert(seats);
	if (error) throw new Error(`Could not write the test seats: ${error.message}`);

	await page.goto(`/manage/${conference.slug}/committees/${committeeId}`);
	await expectDragKept(page, () => readSavedOrder('seats', 'committee_id', committeeId));
});

test('the application form questions are dragged into order, and the order is kept', async ({
	page
}, testInfo) => {
	skipWithoutMouse(testInfo);
	const conference = await openOwnConference(page, 'Question Drag MUN');
	const questions = START_ORDER.map((label, index) => ({
		conference_id: conference.id,
		label,
		type: 'short_text' as const,
		position: index + 1
	}));
	const { error } = await createServiceRoleClient().from('application_questions').insert(questions);
	if (error) throw new Error(`Could not write the test questions: ${error.message}`);

	await page.goto(`/manage/${conference.slug}/application-form`);
	await expectDragKept(page, () =>
		readSavedOrder('application_questions', 'conference_id', conference.id)
	);
});

test('the fees are dragged into order, and the order is kept', async ({ page }, testInfo) => {
	skipWithoutMouse(testInfo);
	const conference = await openOwnConference(page, 'Fee Drag MUN');
	const fees = START_ORDER.map((name, index) => ({
		conference_id: conference.id,
		name,
		amount_cents: 5000,
		applies_to: 'individual' as const,
		position: index + 1
	}));
	const { error } = await createServiceRoleClient().from('fees').insert(fees);
	if (error) throw new Error(`Could not write the test fees: ${error.message}`);

	await page.goto(`/manage/${conference.slug}/fees`);
	await expectDragKept(page, () => readSavedOrder('fees', 'conference_id', conference.id));
});

/** The topics a committee has saved, in their saved order. */
async function readSavedTopics(committeeId: string): Promise<string[]> {
	const { data, error } = await createServiceRoleClient()
		.from('committees')
		.select('topics')
		.eq('id', committeeId)
		.single();

	if (error || !data) throw new Error(`Could not read the topics back: ${error?.message}`);

	return data.topics;
}

/** What the topic inputs of the committee form hold, top to bottom. */
function readTopicInputs(list: Locator): Promise<string[]> {
	return list
		.locator('input')
		.evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
}

test('a committee’s topics are dragged into order, and saved with the form', async ({
	page
}, testInfo) => {
	skipWithoutMouse(testInfo);
	const conference = await openOwnConference(page, 'Topic Drag MUN');
	const committeeId = await addScheduleCommittee(conference.id, {
		name: 'Human Rights Council',
		abbreviation: 'HRC'
	});
	const { error } = await createServiceRoleClient()
		.from('committees')
		.update({ topics: START_ORDER })
		.eq('id', committeeId);
	if (error) throw new Error(`Could not write the test topics: ${error.message}`);

	await page.goto(`/manage/${conference.slug}/committees/${committeeId}`);
	const topics = listHolding(page, 'topic 1');
	await dragToTop(page, topics, 'topic 3');

	// The drop only redraws the rows; nothing is saved until the form is.
	await expect
		.poll(() => readTopicInputs(topics), { timeout: AT_ONCE_TIMEOUT_MS })
		.toEqual(DRAGGED_ORDER);
	expect(await readSavedTopics(committeeId)).toEqual(START_ORDER);

	await page.getByRole('button', { name: 'Save changes' }).click();
	await expect
		.poll(() => readSavedTopics(committeeId), { timeout: DATABASE_TIMEOUT_MS })
		.toEqual(DRAGGED_ORDER);
	await page.reload();
	await expect
		.poll(() => readTopicInputs(listHolding(page, 'topic 1')), { timeout: DATABASE_TIMEOUT_MS })
		.toEqual(DRAGGED_ORDER);
});

test('a drop the server never hears about puts the fees back with a message', async ({
	page
}, testInfo) => {
	skipWithoutMouse(testInfo);
	const conference = await openOwnConference(page, 'Failed Fee Drag MUN');
	const fees = START_ORDER.map((name, index) => ({
		conference_id: conference.id,
		name,
		amount_cents: 5000,
		applies_to: 'individual' as const,
		position: index + 1
	}));
	const { error } = await createServiceRoleClient().from('fees').insert(fees);
	if (error) throw new Error(`Could not write the test fees: ${error.message}`);

	await page.goto(`/manage/${conference.slug}/fees`);
	await page.route(
		(url) => url.search.includes('/moveFeeTo'),
		(route) => route.abort()
	);
	await dragToTop(page, listHolding(page, 'Charlie'), 'Charlie');

	await expect(page.getByText(NETWORK_FAILURE_MESSAGE)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(listHolding(page, 'Charlie').locator(':scope > li')).toHaveText(
		START_ORDER.map((name) => new RegExp(name))
	);
	expect(await readSavedOrder('fees', 'conference_id', conference.id)).toEqual(START_ORDER);
});

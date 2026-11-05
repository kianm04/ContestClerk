import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	DATABASE_TIMEOUT_MS,
	makeChairedCommittee,
	pressChairTab,
	readCommitteeState,
	takeRollCall,
	type ChairedCommittee,
	waitForConsoleScript,
	waitUntilAnswered
} from './chair-room-fixtures';
import { ClickBudgetJourney } from './click-budget';
import { seedWaiting, startSessionDirectly } from './gsl-fixtures';
import { skipWithoutJavaScript } from './in-place';
import { expectNoSidewaysOverflow, saveFullPageScreenshot } from './page-shape';
import { signIn } from './signed-in-user';

// The acceptance criteria of `specs/05-pages/chair/motions.md` that need a
// real browser, the session redesign's (S6) and the ones it kept: who may
// open the view, the floor's order and voting out of order, the composer's
// kinds, fields, refusals and keyboard, Pass and Fail with and without
// counting, the dropped motions with Undo, Restore and "Clear the floor",
// where Pass lands, Withdraw, the refusals while a vote is open or the room is
// suspended, the session record, the click budget and the view's shape from a
// laptop to a phone.
//
// Every button is a plain `<form method="post">`, so the tests run on all
// three projects unless they say otherwise, and `desktop-no-js` proves the
// view works without JavaScript. The committee has three seats; most tests
// take a roll call with Japan absent, so two are present and a motion needs
// two votes for.

/** How long the realtime criterion allows a second screen to catch up. */
const REALTIME_TIMEOUT_MS = 2_000;

/** A motion as the composer is filled in: its kind's short name and who raised it. */
type MotionDraft = {
	/** The kind's segment: "Mod", "Unmod", "Extend", "Suspend", "Adjourn", "Close debate", … */
	kind: string;
	/** A seat's name, or "The chair". */
	raisedBy: string;
	/** The topic, the reason or the motion's name. */
	topic?: string;
	/** The total or the length, typed the MUN way ("10", "1:30"). */
	total?: string;
	/** A moderated caucus's speaking time. */
	each?: string;
};

/** Whether the test runs without JavaScript. */
function hasNoScript(testInfo: TestInfo): boolean {
	return testInfo.project.use.javaScriptEnabled === false;
}

/** Start a session, take a roll call with `absentSeat` absent unless null, sign the chair in and open Motions. */
async function openMotionsWithSession(
	page: Page,
	room: ChairedCommittee,
	absentSeat: string | null = 'Japan'
): Promise<void> {
	await startSessionDirectly(room);
	if (absentSeat !== null) await takeRollCall(room, absentSeat);
	await signIn(page, room.chair);
	await openMotions(page, room);
}

/**
 * With JavaScript, wait until the page has come to life. Until then the
 * composer is the server's: its "Raised by" is a `<select>` (a `combobox` too)
 * and a kind chosen early goes back to Mod as Svelte takes over. The top bar
 * says "Connected" only once the script runs, and only while a session does,
 * which every caller has.
 */
async function waitForScript(page: Page): Promise<void> {
	if (hasNoScript(test.info())) return;

	await waitForConsoleScript(page);
}

/** Open the Motions view of a running session and wait for "Next to vote" and the script. */
async function openMotions(page: Page, room: ChairedCommittee, search = ''): Promise<void> {
	await page.goto(`${room.roomPath}/motions${search}`);
	await expect(page.getByRole('heading', { name: /^Next to vote/ })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitForScript(page);
}

/** "Record a motion", the composer across the foot of the left column. */
function composer(page: Page): Locator {
	return page.getByRole('form', { name: 'Record a motion' });
}

/** "Next to vote", the motion to decide. */
function nextToVote(page: Page): Locator {
	return page.getByRole('region', { name: /^Next to vote/ });
}

/** The rows of "Further motions", top to bottom. */
function furtherRows(page: Page): Locator {
	return page.getByRole('region', { name: 'Further motions' }).getByRole('listitem');
}

/** "Decided this session". */
function decided(page: Page): Locator {
	return page.getByRole('region', { name: 'Decided this session' });
}

/**
 * Choose a kind in the composer's row of kinds, by pressing its segment: the
 * label around the hidden radio button that is named `kind`.
 */
async function chooseKind(page: Page, kind: string): Promise<void> {
	// The inner locator of `has` is looked for inside each label, so it starts from `page`.
	const radio = page.getByRole('radio', { name: kind, exact: true });

	await composer(page).locator('label').filter({ has: radio }).click();
}

/**
 * Fill in the composer and press "Add to floor": "Raised by" is typed and
 * chosen with Enter with JavaScript, and picked from its `<select>` without.
 * The fields are found by the name they are sent under, which is the same
 * with and without JavaScript.
 */
async function recordMotion(page: Page, testInfo: TestInfo, draft: MotionDraft): Promise<void> {
	const form = composer(page);

	await chooseKind(page, draft.kind);

	if (hasNoScript(testInfo)) {
		await form.getByLabel('Raised by').selectOption({ label: draft.raisedBy });
	} else {
		const raisedBy = form.getByRole('combobox', { name: 'Raised by' });
		// The box finds "The chair" by the start of a word, as a chair types it.
		await raisedBy.fill(draft.raisedBy === 'The chair' ? 'chair' : draft.raisedBy);
		await raisedBy.press('Enter');
	}

	if (draft.topic !== undefined) await form.locator('input[name="topic"]').fill(draft.topic);
	if (draft.total !== undefined) await form.locator('input[name="totalTime"]').fill(draft.total);
	if (draft.each !== undefined) await form.locator('input[name="speakingTime"]').fill(draft.each);

	await form.getByRole('button', { name: 'Add to floor' }).click();
}

/** Record a motion and wait until the floor holds `floorCount` motions, the one to decide among them. */
async function addMotion(
	page: Page,
	testInfo: TestInfo,
	draft: MotionDraft,
	floorCount: number
): Promise<void> {
	await recordMotion(page, testInfo, draft);
	// The one to decide counts too, so a motion that was never recorded cannot pass for one.
	await expect(nextToVote(page)).not.toContainText('No motions on the floor', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(furtherRows(page)).toHaveCount(floorCount - 1, { timeout: DATABASE_TIMEOUT_MS });
	await waitUntilAnswered(page);
}

/** Type the counts under the motion to decide, and press Pass or Fail. */
async function decide(
	page: Page,
	button: 'Pass' | 'Fail',
	counts: { for: string; against: string } | null = null
): Promise<void> {
	if (counts !== null) {
		await nextToVote(page).getByLabel('For', { exact: true }).fill(counts.for);
		await nextToVote(page).getByLabel('Against', { exact: true }).fill(counts.against);
	}

	await nextToVote(page).getByRole('button', { name: button, exact: true }).click();
}

/** The toast, which says what happened and may offer "Undo". */
function toast(page: Page, text: string | RegExp): Locator {
	return page.getByRole('status').filter({ hasText: text });
}

/** Write an open vote into the running session, as "Open vote" would. */
async function openAVote(room: ChairedCommittee): Promise<void> {
	const state = await readCommitteeState(room.committeeId);
	const admin = createServiceRoleClient();
	const { error } = await admin.from('votes').insert({
		committee_id: room.committeeId,
		session_id: state.current_session_id ?? '',
		kind: 'substantive',
		subject: 'Draft Resolution 1.1',
		status: 'open'
	});

	if (error) throw new Error(`Could not open the vote: ${error.message}`);
}

/** The caucus clock and the list the room is on, as the database holds them. */
async function readCaucus(room: ChairedCommittee) {
	const state = await readCommitteeState(room.committeeId);
	const admin = createServiceRoleClient();
	const { data: list } = await admin
		.from('speakers_lists')
		.select('name, kind, motion_id')
		.eq('id', state.active_speakers_list_id ?? '')
		.single();

	return { state, list };
}

const CAUCUS: MotionDraft = { kind: 'Mod', raisedBy: 'France', topic: 'Climate finance' };

test('is not found for the chair of another committee', async ({ page }) => {
	const room = await makeChairedCommittee('Stranger Motions MUN');
	const otherRoom = await makeChairedCommittee('Other Motions MUN');

	await signIn(page, otherRoom.chair);
	const response = await page.goto(`${room.roomPath}/motions`);

	expect(response?.status()).toBe(404);
});

test('without a session it says so neutrally, links to the chair room and draws no composer', async ({
	page
}) => {
	const room = await makeChairedCommittee('No Session Motions MUN');

	await signIn(page, room.chair);
	await page.goto(`${room.roomPath}/motions`);

	await expect(page.getByText('No session is running.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	// The server writes the link relative to the page ("../../chair"), which the
	// browser keeps until the client router rewrites it, never without JavaScript.
	await expect(page.getByRole('link', { name: 'Open the chair room' })).toHaveAttribute(
		'href',
		new RegExp(`${room.roomPath}$`)
	);
	await expect(page.getByRole('button', { name: 'Add to floor' })).toHaveCount(0);
});

test('the floor is ordered most disruptive first, with the defaults for empty times', async ({
	page
}, testInfo) => {
	const room = await makeChairedCommittee('Order Motions MUN');

	await openMotionsWithSession(page, room);
	await expect(nextToVote(page)).toContainText('No motions on the floor');
	await expect(furtherRows(page)).toHaveCount(0);
	await expect(page.getByRole('region', { name: 'Further motions' })).toContainText('None');

	await addMotion(page, testInfo, CAUCUS, 1);
	await expect(nextToVote(page)).toContainText('Moderated caucus · 10:00 / 1:30');
	await expect(nextToVote(page)).toContainText('Climate finance · France');

	await addMotion(page, testInfo, { kind: 'Adjourn', raisedBy: 'Ghana' }, 2);
	await expect(nextToVote(page)).toContainText('Adjourn the meeting');
	await expect(furtherRows(page).first()).toContainText('2');
	await expect(furtherRows(page).first()).toContainText('Moderated caucus · 10:00 / 1:30');

	await addMotion(page, testInfo, { kind: 'Unmod', raisedBy: 'The chair' }, 3);
	await expect(furtherRows(page).first()).toContainText('Unmoderated caucus · 10:00');
	await expect(furtherRows(page).first()).toContainText('the chair');
	await expect(
		page.getByRole('heading', { name: 'Next to vote · most disruptive first' })
	).toBeVisible();
});

test('"Vote on this now" puts a further motion up out of order, by a link', async ({
	page
}, testInfo) => {
	const room = await makeChairedCommittee('Out Of Order Motions MUN');

	await openMotionsWithSession(page, room);
	await addMotion(page, testInfo, { kind: 'Adjourn', raisedBy: 'Ghana' }, 1);
	await addMotion(page, testInfo, CAUCUS, 2);

	await furtherRows(page).first().locator('summary', { hasText: 'More for this motion' }).click();
	await furtherRows(page)
		.first()
		.getByRole('link', { name: /Vote on this now/ })
		.click();

	await expect(page).toHaveURL(/\?motion=/, { timeout: DATABASE_TIMEOUT_MS });
	await expect(page.getByRole('heading', { name: 'Next to vote · out of order' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(nextToVote(page)).toContainText('Moderated caucus');
	await expect(furtherRows(page).first()).toContainText('Adjourn the meeting');
});

test('the composer refuses with the quoted messages and keeps what was typed', async ({
	page
}, testInfo) => {
	const room = await makeChairedCommittee('Validation Motions MUN');

	await openMotionsWithSession(page, room);
	await recordMotion(page, testInfo, { ...CAUCUS, topic: '', total: '2', each: '2:30' });

	await expect(page.getByText('A moderated caucus needs a topic.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page.getByText('Speaking time cannot be longer than the total time.')).toBeVisible();
	await expect(composer(page).locator('input[name="speakingTime"]')).toHaveValue('2:30');
	await expect(composer(page).locator('input[name="totalTime"]')).toHaveValue('2');

	await recordMotion(page, testInfo, { kind: 'Suspend', raisedBy: 'Ghana', total: '300' });
	await expect(page.getByText('A length must be between 1 minute and 4 hours.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(nextToVote(page)).toContainText('No motions on the floor');
});

test('the fields follow the kind with JavaScript, and all show without it', async ({
	page
}, testInfo) => {
	const room = await makeChairedCommittee('Fields Motions MUN');

	await openMotionsWithSession(page, room);
	const form = composer(page);

	// The eight kinds in one row, Mod chosen at first.
	for (const kind of ['Mod', 'Unmod', 'Extend', 'Suspend', 'Adjourn', 'Close debate', 'Document']) {
		await expect(form.getByRole('radio', { name: kind, exact: true })).toHaveCount(1);
	}
	// `exact`, or "Mod" would also find "Unmod".
	await expect(form.getByRole('radio', { name: 'Mod', exact: true })).toBeChecked();

	if (hasNoScript(testInfo)) {
		await expect(form.getByLabel('Topic, reason or name')).toBeVisible();
		await expect(form.getByLabel('Total or length')).toBeVisible();
		await expect(form.getByLabel('Each speaker (Mod only)')).toBeVisible();
		await expect(form.getByText('Mod only: 1:30 when empty.')).toBeVisible();
		await expect(form.getByLabel('Raised by').locator('option')).toContainText(['The chair']);
		return;
	}

	await expect(form.getByLabel('Total', { exact: true })).toHaveAttribute('placeholder', '10:00');
	await expect(form.getByLabel('Each', { exact: true })).toHaveAttribute('placeholder', '1:30');

	await chooseKind(page, 'Extend');
	// `exact`, or "By" would also find "Raised by".
	await expect(form.getByLabel('By', { exact: true })).toHaveAttribute('placeholder', '5:00');
	await expect(form.locator('input[name="topic"]')).toHaveCount(0);

	await chooseKind(page, 'Close debate');
	await expect(form.locator('input[name="totalTime"]')).toHaveCount(0);
	await expect(form.getByRole('combobox', { name: 'Raised by' })).toBeVisible();
});

test('"Raised by" offers the chair first and an absent seat it will not take', async ({
	page
}, testInfo) => {
	skipWithoutJavaScript(testInfo);
	const room = await makeChairedCommittee('Raised By Motions MUN');

	await openMotionsWithSession(page, room);
	const raisedBy = composer(page).getByRole('combobox', { name: 'Raised by' });
	await raisedBy.click();

	const options = page.getByRole('option');
	await expect(options.first()).toHaveText('The chair');
	await expect(page.getByRole('option', { name: /Japan/ })).toHaveAttribute(
		'aria-disabled',
		'true'
	);
	await expect(page.getByRole('option', { name: /Japan/ })).toContainText('absent');
});

test('three motions are recorded with the keyboard alone, the cursor back in "Raised by" after each', async ({
	page
}, testInfo) => {
	skipWithoutJavaScript(testInfo);
	test.skip(testInfo.project.name === 'phone', 'A phone has no keyboard of its own.');
	const room = await makeChairedCommittee('Keyboard Motions MUN');

	await openMotionsWithSession(page, room);
	const raisedBy = composer(page).getByRole('combobox', { name: 'Raised by' });
	// M puts the cursor in "Raised by" while Motions is open.
	await page.locator('body').click({ position: { x: 5, y: 5 } });
	await page.keyboard.press('m');
	await expect(raisedBy).toBeFocused();

	for (const [seat, topic] of [
		['fra', 'Aid workers'],
		['gha', 'Cross-border aid'],
		['the', 'Sanctions']
	]) {
		await page.keyboard.type(seat);
		await page.keyboard.press('Enter');
		await page.keyboard.type(topic);
		await page.keyboard.press('Enter');
		await expect(raisedBy).toBeFocused();
	}

	await expect(furtherRows(page)).toHaveCount(2, { timeout: DATABASE_TIMEOUT_MS });
	await expect(nextToVote(page)).toContainText('Moderated caucus');
	await waitUntilAnswered(page);
});

test('Pass and Fail work without counting, record a tally with one, and refuse a count that disagrees', async ({
	page
}, testInfo) => {
	const room = await makeChairedCommittee('Decide Motions MUN');

	await openMotionsWithSession(page, room);
	await addMotion(page, testInfo, { kind: 'Document', raisedBy: 'The chair', topic: 'WP 1.2' }, 1);

	await decide(page, 'Fail');
	await expect(decided(page)).toContainText('Failed', { timeout: DATABASE_TIMEOUT_MS });
	await expect(decided(page)).toContainText('Introduce WP 1.2 · the chair');
	await waitUntilAnswered(page);

	await addMotion(page, testInfo, { kind: 'Other', raisedBy: 'Ghana', topic: 'Photo' }, 1);
	// Two present: two for pass it. "0 for" says it fails, so Pass is refused.
	if (hasNoScript(testInfo)) {
		await decide(page, 'Pass', { for: '0', against: '2' });
		await expect(
			page.getByText('As counted, the motion fails. Press Fail, or correct the count.')
		).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	} else {
		await nextToVote(page).getByLabel('For', { exact: true }).fill('0');
		await expect(nextToVote(page).getByRole('button', { name: 'Pass' })).toBeDisabled();
		await expect(nextToVote(page)).toContainText('0 for is short of 2');
	}

	await decide(page, 'Pass', { for: '2', against: '0' });
	await expect(decided(page).getByRole('listitem').first()).toContainText('Passed', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(decided(page).getByRole('listitem').first()).toContainText('2–0');
	await expect(nextToVote(page)).toContainText('No motions on the floor');
});

test('the line under the counts says what they mean as they are typed', async ({
	page
}, testInfo) => {
	skipWithoutJavaScript(testInfo);
	const room = await makeChairedCommittee('Count Line Motions MUN');

	await openMotionsWithSession(page, room);
	await addMotion(page, testInfo, CAUCUS, 1);

	const pass = nextToVote(page).getByRole('button', { name: 'Pass' });
	const fail = nextToVote(page).getByRole('button', { name: 'Fail' });
	await expect(nextToVote(page)).toContainText(
		'Passes with 2 for, a simple majority of the 2 present.'
	);
	await expect(pass).toBeEnabled();
	await expect(fail).toBeEnabled();

	await nextToVote(page).getByRole('button', { name: 'One more for' }).click();
	await expect(nextToVote(page)).toContainText('As counted, it fails.');
	await expect(pass).toBeDisabled();

	await nextToVote(page).getByRole('button', { name: 'One more for' }).click();
	await expect(nextToVote(page)).toContainText('As counted, it passes.');
	await expect(fail).toBeDisabled();
	await expect(nextToVote(page)).toContainText('2 for is enough to pass');
});

test('Pass drops the other motions, and Undo puts them back in their places', async ({
	page
}, testInfo) => {
	const room = await makeChairedCommittee('Undo Motions MUN');

	await openMotionsWithSession(page, room);
	await addMotion(page, testInfo, { kind: 'Document', raisedBy: 'France', topic: 'WP 1.1' }, 1);
	await addMotion(page, testInfo, { kind: 'Other', raisedBy: 'Ghana', topic: 'Photo' }, 2);
	await addMotion(page, testInfo, { kind: 'Close debate', raisedBy: 'The chair' }, 3);

	// Close debate goes first; pass the document out of order, which stays on Motions.
	await furtherRows(page).first().locator('summary', { hasText: 'More for this motion' }).click();
	await furtherRows(page)
		.first()
		.getByRole('link', { name: /Vote on this now/ })
		.click();
	await expect(nextToVote(page)).toContainText('Introduce WP 1.1', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await decide(page, 'Pass');

	await expect(toast(page, '2 other motions dropped')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(decided(page)).toContainText('Dropped');
	await expect(nextToVote(page)).toContainText('No motions on the floor');
	await waitUntilAnswered(page);

	await toast(page, '2 other motions dropped').getByRole('button', { name: 'Undo' }).click();

	await expect(nextToVote(page)).toContainText('Close debate', { timeout: DATABASE_TIMEOUT_MS });
	await expect(furtherRows(page)).toHaveCount(1);
	await expect(furtherRows(page).first()).toContainText('Photo');
});

test('"Clear the floor" drops every motion, and Restore puts one back, with and without JavaScript', async ({
	page
}, testInfo) => {
	const room = await makeChairedCommittee('Clear Motions MUN');

	await openMotionsWithSession(page, room);
	await addMotion(page, testInfo, { kind: 'Adjourn', raisedBy: 'Ghana' }, 1);
	await addMotion(page, testInfo, CAUCUS, 2);
	await addMotion(page, testInfo, { kind: 'Close debate', raisedBy: 'France' }, 3);

	await page.getByRole('button', { name: 'Clear the floor' }).click();

	await expect(toast(page, '3 motions dropped')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(nextToVote(page)).toContainText('No motions on the floor');
	await expect(decided(page).getByRole('listitem')).toHaveCount(3);
	await waitUntilAnswered(page);

	const adjourned = decided(page).getByRole('listitem').filter({ hasText: 'Adjourn the meeting' });
	await adjourned.getByRole('button', { name: 'Restore' }).click();

	await expect(nextToVote(page)).toContainText('Adjourn the meeting', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(decided(page).getByRole('listitem')).toHaveCount(2);
});

test('Pass on a moderated caucus takes the chair to the live room, the caucus waiting for its first speaker', async ({
	page
}, testInfo) => {
	const room = await makeChairedCommittee('Caucus Motions MUN');

	await openMotionsWithSession(page, room);
	await addMotion(page, testInfo, CAUCUS, 1);
	await decide(page, 'Pass', { for: '2', against: '0' });

	await expect(page).toHaveURL(room.roomPath, { timeout: DATABASE_TIMEOUT_MS });
	await waitUntilAnswered(page);

	const { state, list } = await readCaucus(room);
	expect(state).toMatchObject({
		mode: 'moderated_caucus',
		caucus_total_seconds: 600,
		caucus_paused_remaining_seconds: 600,
		current_speaker_entry_id: null
	});
	expect(list).toMatchObject({ name: 'Climate finance', kind: 'caucus' });
});

test('Fail records the motion as failed and the next motion moves up', async ({
	page
}, testInfo) => {
	const room = await makeChairedCommittee('Failed Motions MUN');

	await openMotionsWithSession(page, room);
	await addMotion(page, testInfo, { kind: 'Suspend', raisedBy: 'Ghana' }, 1);
	await addMotion(page, testInfo, { kind: 'Close debate', raisedBy: 'The chair' }, 2);

	await decide(page, 'Fail', { for: '1', against: '1' });
	await expect(decided(page)).toContainText('Failed', { timeout: DATABASE_TIMEOUT_MS });
	await expect(decided(page)).toContainText('1–1');
	await expect(nextToVote(page)).toContainText('Close debate');
	expect((await readCommitteeState(room.committeeId)).mode).toBe('formal_debate');

	// Withdraw is offered while proposed, and needs no confirmation.
	await nextToVote(page).getByRole('button', { name: 'Withdraw' }).click();
	await expect(decided(page)).toContainText('Withdrawn', { timeout: DATABASE_TIMEOUT_MS });
	await expect(nextToVote(page)).toContainText('No motions on the floor');
	await expect(decided(page).getByRole('button', { name: 'Withdraw' })).toHaveCount(0);
});

test('more votes than delegates present are refused', async ({ page }, testInfo) => {
	const room = await makeChairedCommittee('Too Many Motions MUN');

	await openMotionsWithSession(page, room);
	await addMotion(page, testInfo, { kind: 'Suspend', raisedBy: 'France' }, 1);

	// Two seats are present, so three hands cannot have been counted.
	await decide(page, 'Pass', { for: '3', against: '0' });

	await expect(page.getByText('More votes than delegates present.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(nextToVote(page)).toContainText('Suspend the meeting');
});

test('motions are decided before a roll call, every seat counting as present', async ({
	page
}, testInfo) => {
	const room = await makeChairedCommittee('No Roll Call Motions MUN');

	await openMotionsWithSession(page, room, null);
	await addMotion(page, testInfo, { kind: 'Document', raisedBy: 'Japan', topic: 'WP 1.1' }, 1);

	await expect(nextToVote(page)).toContainText(
		'Passes with 2 for, a simple majority of the 3 seats.'
	);
	await expect(nextToVote(page)).toContainText('No roll call yet.');

	await decide(page, 'Pass');
	await expect(decided(page)).toContainText('Passed', { timeout: DATABASE_TIMEOUT_MS });
});

test('Pass waits for an open vote to close, and for a suspended session to resume', async ({
	page
}, testInfo) => {
	const room = await makeChairedCommittee('Refused Pass Motions MUN');

	await openMotionsWithSession(page, room);
	await addMotion(page, testInfo, CAUCUS, 1);
	await openAVote(room);

	await decide(page, 'Pass');
	await expect(page.getByText('Close the open vote first.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(nextToVote(page)).toContainText('Moderated caucus');

	const admin = createServiceRoleClient();
	await admin.from('votes').delete().eq('committee_id', room.committeeId);
	await admin
		.from('committee_state')
		.update({
			mode: 'suspended',
			mode_before_suspension: 'formal_debate',
			suspended_at: new Date().toISOString()
		})
		.eq('committee_id', room.committeeId);
	await openMotions(page, room);

	await decide(page, 'Pass');
	await expect(page.getByText('Resume the session first.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
});

test('an ended session is drawn read-only as its record', async ({ page }, testInfo) => {
	const room = await makeChairedCommittee('Record Motions MUN');

	await openMotionsWithSession(page, room);
	await addMotion(page, testInfo, { kind: 'Suspend', raisedBy: 'Ghana' }, 1);
	await decide(page, 'Fail');
	await expect(decided(page)).toContainText('Failed', { timeout: DATABASE_TIMEOUT_MS });
	await addMotion(page, testInfo, { kind: 'Adjourn', raisedBy: 'France' }, 1);
	await waitUntilAnswered(page);

	const state = await readCommitteeState(room.committeeId);
	const admin = createServiceRoleClient();
	await admin
		.from('committee_sessions')
		.update({ status: 'ended', ended_at: new Date().toISOString() })
		.eq('id', state.current_session_id ?? '');

	await page.goto(`${room.roomPath}/motions?session=${state.current_session_id}`);

	await expect(page.getByText('This session has ended.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(decided(page)).toContainText('Suspend the meeting');
	await expect(page.getByRole('button', { name: 'Add to floor' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: /Pass|Fail|Withdraw|Restore/ })).toHaveCount(0);
	await expect(page.getByText('More for this motion')).toHaveCount(0);
});

test('a co-chair on Motions stays there when the other chair’s Pass changes the room', async ({
	browser
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'Realtime needs JavaScript and one project.');
	// Two browsers each sign in and open the view, which takes longer than one test usually does.
	test.slow();

	const room = await makeChairedCommittee('Realtime Motions MUN');
	const chairContext = await browser.newContext();
	const organiserContext = await browser.newContext();
	const chairPage = await chairContext.newPage();
	const organiserPage = await organiserContext.newPage();

	await openMotionsWithSession(chairPage, room);
	await addMotion(chairPage, testInfo, { kind: 'Unmod', raisedBy: 'France' }, 1);
	await signIn(organiserPage, room.organiser);
	await openMotions(organiserPage, room);
	await expect(organiserPage.getByText('Connected', { exact: true })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	await decide(chairPage, 'Pass');

	await expect(chairPage).toHaveURL(room.roomPath, { timeout: DATABASE_TIMEOUT_MS });
	// The co-chair is not moved: the floor empties and the live strip appears.
	await expect(nextToVote(organiserPage)).toContainText('No motions on the floor', {
		timeout: REALTIME_TIMEOUT_MS + 1_000
	});
	await expect(organiserPage.getByText('Live', { exact: true })).toBeVisible();
	expect(new URL(organiserPage.url()).pathname).toBe(`${room.roomPath}/motions`);

	await chairContext.close();
	await organiserContext.close();
});

test('the mode bar opens Motions', async ({ page }) => {
	const room = await makeChairedCommittee('Links Motions MUN');

	await startSessionDirectly(room);
	await signIn(page, room.chair);
	await page.goto(`${room.roomPath}/gsl`);
	await pressChairTab(page, 'Motions');

	await expect(page).toHaveURL(`${room.roomPath}/motions`, { timeout: DATABASE_TIMEOUT_MS });
});

test.describe('the view’s shape', () => {
	/** A floor of four motions and one decided, as the shape tests draw it. */
	async function fillTheFloor(page: Page, testInfo: TestInfo, room: ChairedCommittee) {
		await openMotionsWithSession(page, room);
		await addMotion(page, testInfo, { kind: 'Suspend', raisedBy: 'Ghana' }, 1);
		await decide(page, 'Fail', { for: '0', against: '2' });
		await expect(decided(page)).toContainText('Failed', { timeout: DATABASE_TIMEOUT_MS });
		await addMotion(page, testInfo, { kind: 'Unmod', raisedBy: 'France', total: '15' }, 1);
		await addMotion(page, testInfo, { ...CAUCUS, total: '12' }, 2);
		await addMotion(page, testInfo, { ...CAUCUS, topic: 'Aid', raisedBy: 'Ghana' }, 3);
		await addMotion(page, testInfo, { kind: 'Close debate', raisedBy: 'The chair' }, 4);
	}

	test('two columns at 1280: the motion and the composer left, only lists right, no cards', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'desktop', 'The laptop’s shape.');
		await fillTheFloor(page, testInfo, await makeChairedCommittee('Laptop Motions MUN'));

		const left = await nextToVote(page).boundingBox();
		const composerBox = await composer(page).boundingBox();
		const lists = await page
			.getByRole('complementary', { name: /Motions on the floor/ })
			.boundingBox();

		expect(left && lists && left.x + left.width <= lists.x).toBe(true);
		expect(composerBox && lists && composerBox.x < lists.x).toBe(true);
		expect(composerBox && left && composerBox.y > left.y).toBe(true);
		// The page itself does not scroll; long lists scroll inside their column.
		const scrolls = await page.evaluate(
			() => document.documentElement.scrollHeight > window.innerHeight
		);
		expect(scrolls).toBe(false);
		await saveFullPageScreenshot(page, 'motions-1280');
	});

	test('at 1024 the right column keeps 320px, the fields stay in one row and three further motions show', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'desktop', 'The small laptop’s shape.');
		await page.setViewportSize({ width: 1024, height: 768 });
		await fillTheFloor(page, testInfo, await makeChairedCommittee('Small Motions MUN'));

		const lists = await page
			.getByRole('complementary', { name: /Motions on the floor/ })
			.boundingBox();
		expect(lists?.width ?? 0).toBeGreaterThanOrEqual(320);

		const raisedBy = await composer(page)
			.getByRole('combobox', { name: 'Raised by' })
			.boundingBox();
		const add = await composer(page).getByRole('button', { name: 'Add to floor' }).boundingBox();
		expect(
			Math.abs((raisedBy?.y ?? 0) + (raisedBy?.height ?? 0) - (add?.y ?? 0) - (add?.height ?? 0))
		).toBeLessThan(8);

		for (const index of [0, 1, 2]) await expect(furtherRows(page).nth(index)).toBeInViewport();
		await expectNoSidewaysOverflow(page);
	});

	test('one column on a phone, in order, with Pass and Fail sharing the width', async ({
		page
	}, testInfo) => {
		test.skip(
			testInfo.project.name !== 'phone',
			'Only the phone project has a phone-sized window.'
		);
		await fillTheFloor(page, testInfo, await makeChairedCommittee('Phone Motions MUN'));

		const order = [
			await nextToVote(page).boundingBox(),
			await composer(page).boundingBox(),
			await page.getByRole('region', { name: 'Further motions' }).boundingBox(),
			await decided(page).boundingBox()
		].map((box) => box?.y ?? 0);
		expect([...order].sort((first, second) => first - second)).toEqual(order);

		const pass = await nextToVote(page).getByRole('button', { name: 'Pass' }).boundingBox();
		const fail = await nextToVote(page).getByRole('button', { name: 'Fail' }).boundingBox();
		expect(Math.abs((pass?.width ?? 0) - (fail?.width ?? 0))).toBeLessThan(2);
		expect(pass?.height ?? 0).toBeGreaterThanOrEqual(44);

		await saveFullPageScreenshot(page, 'motions');
		await expectNoSidewaysOverflow(page);
	});
});

test('budget: record a moderated caucus motion and pass it, during a GSL speech', async ({
	page
}, testInfo) => {
	skipWithoutJavaScript(testInfo);
	const room = await makeChairedCommittee('Budget Motions MUN');

	await startSessionDirectly(room);
	await takeRollCall(room, 'Japan');
	await seedWaiting(room, ['Ghana']);
	await signIn(page, room.chair);
	await page.goto(room.roomPath);
	await waitForScript(page);
	await page.getByRole('button', { name: 'Call Ghana' }).click();
	await waitUntilAnswered(page);

	// The journey starts on the live room the chair is looking at, which the
	// journey counts as its first page; motions.md's two pages are the ones the
	// walk goes to: Motions, then the live room again.
	const journey = ClickBudgetJourney.fromPage(page);
	await journey.click(
		page.getByRole('navigation', { name: 'Modes' }).getByRole('link', { name: /^Motions/ })
	);
	const raisedBy = composer(page).getByRole('combobox', { name: 'Raised by' });
	// The scripted box, not the `<select>` the server draws before the page comes to life.
	await expect(raisedBy).toHaveAttribute('aria-autocomplete', 'list', {
		timeout: DATABASE_TIMEOUT_MS
	});
	// Enter chooses the seat and adds the motion, so the budget counts it with the typing.
	await journey.type(raisedBy, 'fra');
	await raisedBy.press('Enter');
	const topic = composer(page).getByLabel('Topic');
	await journey.type(topic, 'Protecting aid workers');
	await topic.press('Enter');
	await expect(nextToVote(page)).toContainText('Protecting aid workers', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await journey.click(nextToVote(page).getByRole('button', { name: 'Pass' }));

	await expect(page).toHaveURL(room.roomPath, { timeout: DATABASE_TIMEOUT_MS });
	journey.expectWithinBudget({ clicks: 2, pages: 3, typedFields: 2, decisions: 0 });
	await waitUntilAnswered(page);
	expect((await readCommitteeState(room.committeeId)).mode).toBe('moderated_caucus');
});

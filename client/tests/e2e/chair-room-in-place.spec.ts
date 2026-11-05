import { expect, test, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	DATABASE_TIMEOUT_MS,
	makeChairedCommittee,
	openRoom,
	readCommitteeState,
	startSession,
	takeRollCall,
	type ChairedCommittee,
	waitForConsoleScript,
	waitUntilAnswered
} from './chair-room-fixtures';
import {
	addBox,
	addThroughBox,
	callSpeaker,
	floorRegion,
	gslPath,
	openGslView,
	seedWaiting,
	waitingRows
} from './gsl-fixtures';
import { markPage, readMarker, skipWithoutJavaScript } from './in-place';
import { signIn } from './signed-in-user';

// T124: with JavaScript, the committee room's buttons send their form in the
// background and the page answers in place instead of reloading.
//
// Each test leaves a marker on `window` before pressing a button and checks it
// is still there afterwards (`./in-place.ts`). The other chair specs already
// press every button on `desktop-no-js`; the last test here does the same three
// presses without JavaScript, to show the plain forms still work. The floor's
// and the queue's buttons are the GSL view's (S4), pressed on `chair/gsl`.

/** How soon a pressed control must show its result, before the server has answered. */
const AT_ONCE_TIMEOUT_MS = 1_000;

/**
 * How long a started clock may take to show a lower number: a little over a
 * second, with room for a slow machine. The clock never steps back up when the
 * server answers (T139, `./timer-clock.spec.ts`).
 */
const COUNTDOWN_TIMEOUT_MS = 4_000;

/** The seconds the first clock on the page shows, read from its "m:ss". */
async function readClockSeconds(page: Page): Promise<number> {
	const clockText = await page.getByRole('timer').first().innerText();
	const [minutes, seconds] = clockText.trim().split(':').map(Number);

	return minutes * 60 + seconds;
}

/**
 * Put Ghana on the list, open the GSL view and call Ghana, whose clock is then
 * ready and not running (S4): the floor's controls are drawn only while a
 * seat has the floor (T167).
 */
async function openWithGhanaCalled(page: Page, room: ChairedCommittee): Promise<void> {
	await seedWaiting(room, ['Ghana']);
	await openGslView(page, gslPath(room));
	await callSpeaker(page, 'Ghana');
}

/** Sign the chair in, start a session and take a roll call with Japan absent. */
async function openRoomWithSession(page: Page, room: ChairedCommittee): Promise<void> {
	await signIn(page, room.chair);
	await openRoom(page, room.roomPath);
	await startSession(page);
	await takeRollCall(room, 'Japan');
}

/**
 * Open a roll call vote from the Vote view's set-up (S10): the subject in
 * "On", the "Roll call" segment, "Open vote". With JavaScript it waits for the
 * page's script first, or what was typed would be put back as Svelte takes
 * the page over.
 */
async function openRollCallVote(page: Page, room: ChairedCommittee): Promise<void> {
	await page.goto(`${room.roomPath}/voting`);
	await expect(page.getByRole('heading', { name: 'Open a vote' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	if (test.info().project.use.javaScriptEnabled !== false) await waitForConsoleScript(page);

	await page.getByLabel('On', { exact: true }).fill('Draft Resolution 1.1');
	const rollCall = page.getByRole('radio', { name: 'Roll call', exact: true });
	await page.locator('label').filter({ has: rollCall }).click();
	await expect(rollCall).toBeChecked();
	await page.getByRole('button', { name: 'Open vote' }).click();
	await expect(page.getByRole('heading', { name: /^Draft Resolution 1\.1/ })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	// The vote shows before the server has saved it (T141), so wait for its answer.
	await waitUntilAnswered(page);
}

/** How many entries the room's active speakers list holds in the database. */
async function readListLength(committeeId: string): Promise<number> {
	const admin = createServiceRoleClient();
	const state = await readCommitteeState(committeeId);

	const { count, error } = await admin
		.from('speakers_list_entries')
		.select('*', { count: 'exact', head: true })
		.eq('speakers_list_id', state.active_speakers_list_id ?? '');

	if (error) throw new Error(`Could not count the entries: ${error.message}`);

	return count ?? 0;
}

/** Each stored answer of the committee's current vote, as "<seat> <choice>". */
async function readVotes(committeeId: string): Promise<string[]> {
	const admin = createServiceRoleClient();
	const state = await readCommitteeState(committeeId);

	const { data: seats } = await admin
		.from('seats')
		.select('id, name')
		.eq('committee_id', committeeId);
	const { data: entries, error } = await admin
		.from('vote_entries')
		.select('seat_id, choice')
		.eq('vote_id', state.current_vote_id ?? '');

	if (error) throw new Error(`Could not read the votes: ${error.message}`);

	const seatNames = new Map((seats ?? []).map((seat) => [seat.id, seat.name]));

	return (entries ?? []).map((entry) => `${seatNames.get(entry.seat_id)} ${entry.choice}`);
}

test('starting the timer runs the clock at once without reloading', async ({ page }, testInfo) => {
	skipWithoutJavaScript(testInfo);
	const room = await makeChairedCommittee('In Place Timer MUN');

	await openRoomWithSession(page, room);
	await openWithGhanaCalled(page, room);
	await markPage(page);

	// Safari does not move the focus to a button a mouse clicks, so the focus is
	// only a keyboard user's to keep: the button is pressed from the keyboard (T151).
	await page.getByRole('button', { name: 'Start' }).press('Enter');

	// The button turns into "Pause" and keeps the keyboard focus, before the
	// server has answered.
	const pauseButton = page.getByRole('button', { name: 'Pause' });
	await expect(pauseButton).toBeVisible({ timeout: AT_ONCE_TIMEOUT_MS });
	await expect(pauseButton).toBeFocused();
	// The clock counts down on its own from the press.
	await expect(page.getByRole('timer').first()).toBeVisible({ timeout: AT_ONCE_TIMEOUT_MS });
	const secondsAtStart = await readClockSeconds(page);
	await expect
		.poll(() => readClockSeconds(page), { timeout: COUNTDOWN_TIMEOUT_MS })
		.toBeLessThan(secondsAtStart);

	await expect
		.poll(async () => (await readCommitteeState(room.committeeId)).timer_ends_at, {
			timeout: DATABASE_TIMEOUT_MS
		})
		.not.toBeNull();
	expect(await readMarker(page)).toBe('still here');
});

// T128: "End speech" is one of the room's in-place buttons too.
test('ending a speech empties the floor without reloading', async ({ page }, testInfo) => {
	skipWithoutJavaScript(testInfo);
	const room = await makeChairedCommittee('In Place End Speech MUN');

	await openRoomWithSession(page, room);
	await openWithGhanaCalled(page, room);
	await markPage(page);

	await page.getByRole('button', { name: 'End speech' }).click();

	// Ghana has spoken and nobody else waits, so the floor asks for the first speaker.
	await expect(floorRegion(page).getByText('Add the first speaker to the list')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	// The empty floor shows before the server has saved it (T141), so wait for its answer.
	await waitUntilAnswered(page);
	expect((await readCommitteeState(room.committeeId)).current_speaker_entry_id).toBeNull();
	expect(await readMarker(page)).toBe('still here');
});

test('adding a speaker shows them waiting without reloading', async ({ page }, testInfo) => {
	skipWithoutJavaScript(testInfo);
	const room = await makeChairedCommittee('In Place Speakers MUN');

	await openRoomWithSession(page, room);
	await openGslView(page, gslPath(room));
	await markPage(page);

	await addBox(page).click();
	await addBox(page).fill('gha');
	await addBox(page).press('Enter');

	// Ghana's row appears with the press, before the server has answered.
	await expect(waitingRows(page).filter({ hasText: 'Ghana' })).toBeVisible({
		timeout: AT_ONCE_TIMEOUT_MS
	});
	await expect
		.poll(() => readListLength(room.committeeId), { timeout: DATABASE_TIMEOUT_MS })
		.toBe(1);
	// When the saved row replaces the one shown at once, there is still only one.
	await expect(waitingRows(page)).toHaveCount(1);
	expect(await readMarker(page)).toBe('still here');
});

test('recording a roll call vote shows the answer without reloading', async ({
	page
}, testInfo) => {
	skipWithoutJavaScript(testInfo);
	const room = await makeChairedCommittee('In Place Vote MUN');

	await openRoomWithSession(page, room);
	await openRollCallVote(page, room);
	await markPage(page);

	// The answers say what delegates answer aloud: "Yes" records `for` (S10).
	const forButton = page
		.getByRole('form', { name: 'Vote of France' })
		.getByRole('button', { name: 'Yes', exact: true });
	// Safari does not move the focus to a button a mouse clicks, so the focus is
	// only a keyboard user's to keep: the button is pressed from the keyboard (T151).
	await forButton.press('Enter');

	await expect(forButton).toHaveAttribute('aria-pressed', 'true', { timeout: AT_ONCE_TIMEOUT_MS });
	await expect
		.poll(() => readVotes(room.committeeId), { timeout: DATABASE_TIMEOUT_MS })
		.toEqual(['France for']);
	await expect(forButton).toBeFocused();
	expect(await readMarker(page)).toBe('still here');
});

test('a press that never reaches the server goes back and says so', async ({ page }, testInfo) => {
	skipWithoutJavaScript(testInfo);
	const room = await makeChairedCommittee('In Place Offline MUN');

	await openRoomWithSession(page, room);
	await openWithGhanaCalled(page, room);
	await markPage(page);
	// The network drops only this one press. A ready clock's "Start" resumes
	// the seconds it holds (S4), so it posts `?/timerResume`.
	await page.route(
		(url) => url.search === '?/timerResume',
		(route) => route.abort()
	);

	await page.getByRole('button', { name: 'Start' }).click();

	// The toast names the action that failed, then why (T141).
	await expect(page.getByRole('alert')).toContainText(
		'The timer was not resumed. Check your connection',
		{
			timeout: DATABASE_TIMEOUT_MS
		}
	);
	await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
	expect((await readCommitteeState(room.committeeId)).timer_ends_at).toBeNull();
	expect(await readMarker(page)).toBe('still here');
});

test('without JavaScript the same buttons post and reload the page', async ({ page }, testInfo) => {
	test.skip(
		testInfo.project.use.javaScriptEnabled !== false,
		'The other projects answer in place; this one checks the plain forms.'
	);
	const room = await makeChairedCommittee('No Script In Place MUN');

	await openRoomWithSession(page, room);
	await openWithGhanaCalled(page, room);
	await page.getByRole('button', { name: 'Start' }).click();
	await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect((await readCommitteeState(room.committeeId)).timer_ends_at).not.toBeNull();

	// Japan is marked absent, so the add box's `<select>` offers France.
	await addThroughBox(page, testInfo, 'France');

	await openRollCallVote(page, room);
	await page
		.getByRole('form', { name: 'Vote of France' })
		.getByRole('button', { name: 'Yes', exact: true })
		.click();
	// France and Ghana are present; France has answered, so one seat is left to call.
	await expect(page.getByText('1 to call')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect(await readVotes(room.committeeId)).toEqual(['France for']);
});

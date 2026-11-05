import { expect, test, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	expectLittleLayoutShift,
	expectNoSidewaysOverflow,
	expectPageFitsInScreens,
	saveFullPageScreenshot
} from './page-shape';
import {
	DATABASE_TIMEOUT_MS,
	makeChairedCommittee,
	openRoom,
	readCommitteeState,
	startSession,
	waitForConsoleScript,
	waitUntilAnswered,
	type ChairedCommittee
} from './chair-room-fixtures';
import { createTestUser, signIn } from './signed-in-user';
import {
	addThroughBox,
	callSpeaker as pressCall,
	floorClock,
	floorRegion,
	floorSpeaker,
	openFloorMenu,
	openRowMenu,
	queueColumn,
	waitingRows
} from './gsl-fixtures';

// The acceptance criteria of `specs/05-pages/chair/committee-room.md` that need
// a real browser: who may open the room, starting a session, the timer
// buttons, the next speaker, a second screen following along through realtime,
// and the page's shape on a laptop and a phone, including that it holds still
// while it loads on a phone (T126). In formal debate the room draws the GSL
// view (`specs/05-pages/chair/gsl.md`, S4), so the floor and the queue below
// are that view's: the clock under the speaker, "Next: {seat}", the add box
// and each row's "⋯". An unmoderated caucus is `chair-unmod.spec.ts`'s, and
// ending a session `chair-room-suspended-ended.spec.ts`'s, each tested once by
// its own view.
//
// Every button on the page is a plain `<form method="post">`, so every test but
// the realtime one runs on all three projects, and `desktop-no-js` proves the
// room works without JavaScript.

/** How long the realtime criterion allows a second screen to catch up. */
const REALTIME_TIMEOUT_MS = 2_000;

/** How many screens the room may take on a laptop. */
const ROOM_SCREENS = 2;

/**
 * How long a started clock is left to run before it is paused. A clock paused
 * in its first second still holds its whole length, which reads as not
 * started ("Start"), so the tests let it run past that before they pause it.
 */
const CLOCK_RUN_MS = 1_500;

/** Put a seat on the active speakers list as the next one waiting. */
async function addWaitingSpeaker(committeeId: string, seatName: string): Promise<void> {
	const admin = createServiceRoleClient();
	const state = await readCommitteeState(committeeId);

	const { data: seat, error: seatError } = await admin
		.from('seats')
		.select('id')
		.eq('committee_id', committeeId)
		.eq('name', seatName)
		.single();

	if (seatError || !seat || !state.active_speakers_list_id) {
		throw new Error(`Could not find the seat or the list: ${seatError?.message}`);
	}

	const { error } = await admin.from('speakers_list_entries').insert({
		speakers_list_id: state.active_speakers_list_id,
		seat_id: seat.id,
		position: 1,
		status: 'waiting'
	});

	if (error) {
		throw new Error(`Could not add the speaker: ${error.message}`);
	}
}

/**
 * Put `seatName` on the list and give it the floor with "Call {seat}" (T167).
 * The seat goes in through the database, so the room is opened again to show
 * it. The called speaker's clock is ready and not running (S4), so the floor
 * offers "Start", and the press is answered before a test opens the room again.
 */
async function callSpeaker(page: Page, room: ChairedCommittee, seatName: string): Promise<void> {
	await addWaitingSpeaker(room.committeeId, seatName);
	await openRoom(page, room.roomPath);
	await pressCall(page, seatName);
}

/** Wait until the floor names `seatName` as having the floor. */
async function expectSpeaking(page: Page, seatName: string): Promise<void> {
	await expect(floorSpeaker(page, seatName)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
}

/** The seconds the first clock on the page shows, read from its "m:ss". */
async function readClockSeconds(page: Page): Promise<number> {
	const clockText = await page.getByRole('timer').first().innerText();
	const [minutes, seconds] = clockText.trim().replace('+', '').split(':').map(Number);

	return minutes * 60 + seconds;
}

test('is not found for a signed-in reader who does not chair the committee', async ({ page }) => {
	const room = await makeChairedCommittee('Stranger Chair Room MUN');
	const stranger = await createTestUser('Chair Room Stranger');

	await signIn(page, stranger);
	const response = await page.goto(room.roomPath);

	expect(response?.status()).toBe(404);
});

test('sends a visitor to sign in and back', async ({ page }) => {
	const room = await makeChairedCommittee('Visitor Chair Room MUN');

	await page.goto(room.roomPath);

	await expect(page).toHaveURL(`/login?next=${encodeURIComponent(room.roomPath)}`);
});

test('starting a session opens a General Speakers’ List in formal debate', async ({ page }) => {
	const room = await makeChairedCommittee('Start Chair Room MUN');

	await signIn(page, room.chair);
	await openRoom(page, room.roomPath);
	// The lobby (S11): the committee's name is the page's one heading, over the start button.
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Security Council');
	await expect(
		page.getByRole('button', { name: /^Start (Session 1|a practice session)$/ })
	).toBeVisible();

	await startSession(page);

	const state = await readCommitteeState(room.committeeId);
	expect(state.mode).toBe('formal_debate');
	expect(state.current_session_id).not.toBeNull();

	const admin = createServiceRoleClient();
	const { data: list } = await admin
		.from('speakers_lists')
		.select('name, session_id, motion_id')
		.eq('id', state.active_speakers_list_id ?? '')
		.single();

	expect(list).toEqual({
		name: "General Speakers' List",
		session_id: state.current_session_id,
		motion_id: null
	});
	// The top strip asks for a roll call before one has been taken.
	await expect(page.getByText('Take roll call')).toBeVisible();
});

// specs/05-pages/chair/gsl.md's empty floor: the list has just opened and
// nobody has been added yet. The live room and the view's own route draw the
// same GSL view, with the opening band above it until a speaker is called;
// this looks at the view's own route.
test('shows the GSL view with an empty floor and an empty list on a freshly started session', async ({
	page
}) => {
	const room = await makeChairedCommittee('Empty List Chair Room MUN');

	await signIn(page, room.chair);
	await openRoom(page, room.roomPath);
	await startSession(page);
	await page.goto(`${room.roomPath}/gsl`);

	await expect(
		page.getByRole('heading', { name: 'General Speakers’ List · 1:30 each' })
	).toBeVisible();
	await expect(floorRegion(page).getByText('Add the first speaker to the list')).toBeVisible();
	// With nobody on the floor there is no clock to start, speech to end or seat to call.
	await expect(floorClock(page)).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'End speech' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: /^(Next|Call)/ })).toHaveCount(0);
	await expect(queueColumn(page).getByRole('heading', { name: 'Speakers’ list' })).toBeVisible();
	await expect(waitingRows(page)).toHaveCount(0);
});

test('the timer starts, pauses, resumes, grows and resets', async ({ page }) => {
	const room = await makeChairedCommittee('Timer Chair Room MUN');

	await signIn(page, room.chair);
	await openRoom(page, room.roomPath);
	await startSession(page);

	// A called speaker's clock is ready at the full time and not running (S4).
	await callSpeaker(page, room, 'Ghana');
	const ready = await readCommitteeState(room.committeeId);
	expect(ready.timer_ends_at).toBeNull();
	expect(ready.timer_paused_remaining_seconds).toBe(ready.timer_total_seconds);
	await expect(floorClock(page)).toHaveText('1:30');

	await page.getByRole('button', { name: 'Start' }).click();
	await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitUntilAnswered(page);
	expect((await readCommitteeState(room.committeeId)).timer_ends_at).not.toBeNull();
	await page.waitForTimeout(CLOCK_RUN_MS);

	await page.getByRole('button', { name: 'Pause' }).click();
	await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitUntilAnswered(page);
	const paused = await readCommitteeState(room.committeeId);
	expect(paused.timer_ends_at).toBeNull();
	expect(paused.timer_paused_remaining_seconds).toBeGreaterThan(0);

	// "+15 s" on a paused timer adds to what it is holding.
	const heldSeconds = paused.timer_paused_remaining_seconds ?? 0;
	await page.getByRole('button', { name: '+15 s' }).click();
	await expect
		.poll(async () => (await readCommitteeState(room.committeeId)).timer_paused_remaining_seconds, {
			timeout: DATABASE_TIMEOUT_MS
		})
		.toBe(heldSeconds + 15);
	// The row is saved before the page has its answer, so wait for the answer too.
	await waitUntilAnswered(page);

	await page.getByRole('button', { name: 'Resume' }).click();
	await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitUntilAnswered(page);

	// "Reset clock", in the floor's "⋯", puts the full length back and holds it, ready.
	await openFloorMenu(page, 'More');
	await page.getByRole('button', { name: 'Reset clock' }).click();
	await expect
		.poll(async () => (await readCommitteeState(room.committeeId)).timer_paused_remaining_seconds, {
			timeout: DATABASE_TIMEOUT_MS
		})
		.toBe(paused.timer_total_seconds);
	expect((await readCommitteeState(room.committeeId)).timer_ends_at).toBeNull();
	await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
});

test('"Next speaker" gives the floor to the first seat waiting', async ({ page }) => {
	const room = await makeChairedCommittee('Speaker Chair Room MUN');

	await signIn(page, room.chair);
	await openRoom(page, room.roomPath);
	await startSession(page);

	// Over an empty floor the button names the seat it calls (T167).
	await callSpeaker(page, room, 'Ghana');
	const state = await readCommitteeState(room.committeeId);
	expect(state.current_speaker_entry_id).not.toBeNull();

	// With nobody else waiting, "Next" is disabled and says why (S4).
	await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
	await expect(page.getByText('Nobody is waiting')).toBeVisible();

	await addWaitingSpeaker(room.committeeId, 'Japan');
	await openRoom(page, room.roomPath);
	await page.getByRole('button', { name: 'Next: Japan' }).click();
	await expectSpeaking(page, 'Japan');
	await waitUntilAnswered(page);
	const next = await readCommitteeState(room.committeeId);
	expect(next.current_speaker_entry_id).not.toBe(state.current_speaker_entry_id);
	// Japan's clock is ready at the full time, for the chair to start.
	expect(next.timer_ends_at).toBeNull();
	expect(next.timer_paused_remaining_seconds).toBe(next.timer_total_seconds);
});

// T128: "End speech" stops the clock and ends the speech without calling the
// next seat. Like every test here it runs on `desktop-no-js` too, where the
// button posts and the page reloads.
test('"End speech" ends the speech and leaves the next seat waiting', async ({ page }) => {
	const room = await makeChairedCommittee('End Speech Chair Room MUN');

	await signIn(page, room.chair);
	await openRoom(page, room.roomPath);
	await startSession(page);
	await callSpeaker(page, room, 'Ghana');
	await addWaitingSpeaker(room.committeeId, 'Japan');
	// Opened again so that the room knows Japan waits, with or without JavaScript.
	await openRoom(page, room.roomPath);

	await page.getByRole('button', { name: 'End speech' }).click();

	// The floor is empty and names the seat waiting next (T167).
	await expect(page.getByRole('button', { name: 'Call Japan' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(floorRegion(page).getByText(/^Ghana spoke last/)).toBeVisible();
	// The screen shows the result before the server has saved it (T141), so wait for its answer.
	await waitUntilAnswered(page);
	const state = await readCommitteeState(room.committeeId);
	expect(state.current_speaker_entry_id).toBeNull();
	expect(state.timer_ends_at).toBeNull();
	expect(state.timer_paused_remaining_seconds).toBeNull();

	const admin = createServiceRoleClient();
	const { data: entries } = await admin
		.from('speakers_list_entries')
		.select('status, seats(name)')
		.eq('speakers_list_id', state.active_speakers_list_id ?? '');
	// Both entries were put in at the same position, so they are put in order by
	// their status, which differs: "spoken" comes before "waiting".
	const byStatus = [...(entries ?? [])].sort((first, second) =>
		first.status.localeCompare(second.status)
	);

	expect(byStatus).toEqual([
		{ status: 'spoken', seats: { name: 'Ghana' } },
		{ status: 'waiting', seats: { name: 'Japan' } }
	]);
	// Japan is still waiting, and with nobody on the floor there is no speech to end.
	await expect(waitingRows(page)).toHaveText([/Japan/]);
	await expect(page.getByRole('button', { name: 'End speech' })).toHaveCount(0);
});

// T128: the queue column beside the floor adds, moves and removes seats, and
// every one of them works without JavaScript (S4: the add box, or its
// `<select>` without JavaScript, and each row's "⋯").
test('the speaking queue adds, reorders and removes seats', async ({ page }, testInfo) => {
	const room = await makeChairedCommittee('Queue Chair Room MUN');

	await signIn(page, room.chair);
	await openRoom(page, room.roomPath);
	await startSession(page);
	// Calling a first speaker ends the opening, so the room draws the GSL view.
	await callSpeaker(page, room, 'France');
	// The add box is a `<select>` until the page's script swaps the search box in.
	if (testInfo.project.use.javaScriptEnabled !== false) await waitForConsoleScript(page);

	for (const seatName of ['Ghana', 'Japan']) {
		await addThroughBox(page, testInfo, seatName);
	}
	await expect(waitingRows(page)).toHaveText([/Ghana/, /Japan/]);

	// Each row's menu is a `<details>`, which opens without JavaScript.
	await openRowMenu(page, 'Japan');
	await page.getByRole('button', { name: 'Move up' }).click();
	await expect(waitingRows(page).first()).toContainText('Japan', {
		timeout: DATABASE_TIMEOUT_MS
	});

	await openRowMenu(page, 'Ghana');
	await page.getByRole('button', { name: 'Remove' }).click();
	await expect(waitingRows(page)).toHaveText([/Japan/], { timeout: DATABASE_TIMEOUT_MS });
});

test('a speaker yields to another seat, then to the chair', async ({ page }) => {
	const room = await makeChairedCommittee('Yield Chair Room MUN');

	await signIn(page, room.chair);
	await openRoom(page, room.roomPath);
	await startSession(page);
	await callSpeaker(page, room, 'Ghana');

	// "Yield" is a `<details>` menu, which opens without JavaScript.
	await openFloorMenu(page, 'Yield');
	await floorRegion(page).getByRole('button', { name: 'Japan' }).click();

	await expectSpeaking(page, 'Japan');
	// The screen shows the result before the server has saved it (T141), so wait for its answer.
	await waitUntilAnswered(page);
	const yielded = await readCommitteeState(room.committeeId);
	const admin = createServiceRoleClient();
	const { data: entries } = await admin
		.from('speakers_list_entries')
		.select('status, position, seats(name)')
		.eq('speakers_list_id', yielded.active_speakers_list_id ?? '')
		.order('position');

	expect(entries).toEqual([
		{ status: 'speaking', position: 0, seats: { name: 'Japan' } },
		{ status: 'spoken', position: 1, seats: { name: 'Ghana' } }
	]);

	await openFloorMenu(page, 'Yield');
	await floorRegion(page)
		.getByRole('button', { name: /To the chair/ })
		.click();
	// Both seats have spoken and nobody waits, so the floor asks for the first speaker.
	await expect(floorRegion(page).getByText('Add the first speaker to the list')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
});

test('an organiser who is not a named chair is told so', async ({ page }, testInfo) => {
	const room = await makeChairedCommittee('Organiser Chair Room MUN');

	await signIn(page, room.organiser);
	await openRoom(page, room.roomPath);

	// The top bar names the organiser and links back to their dashboard. On a
	// phone it keeps the link alone, without "Viewing as organiser"
	// (`chair/committee-room.md`, "On a 390 phone").
	const topBar = page.getByRole('banner');
	await expect(topBar.getByRole('link', { name: 'Dashboard' })).toBeVisible();
	if (testInfo.project.name === 'phone') {
		await expect(topBar.getByText('Viewing as organiser')).toBeHidden();
	} else {
		await expect(topBar.getByText('Viewing as organiser')).toBeVisible();
	}
});

test('a second screen follows the room within two seconds', async ({ browser }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'Realtime needs JavaScript and one project.');

	const room = await makeChairedCommittee('Realtime Chair Room MUN');
	const chairContext = await browser.newContext();
	const organiserContext = await browser.newContext();
	const chairPage = await chairContext.newPage();
	const organiserPage = await organiserContext.newPage();

	await signIn(chairPage, room.chair);
	await signIn(organiserPage, room.organiser);
	await openRoom(chairPage, room.roomPath);
	await startSession(chairPage);
	// Over an empty floor the room offers "Call Ghana" (T167).
	await addWaitingSpeaker(room.committeeId, 'Ghana');
	await openRoom(chairPage, room.roomPath);
	await openRoom(organiserPage, room.roomPath);

	// The dot says "Connected" once the channel is subscribed; before that a
	// change could slip past unheard.
	await expect(organiserPage.getByText('Connected', { exact: true })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// The timer is a moment in the database, and each screen counts down to it
	// on its own, so the two clocks agree to within a second.
	// "Call Ghana" gives Ghana the floor with the clock ready (S4); "Start" runs it.
	await chairPage.getByRole('button', { name: 'Call Ghana' }).click();
	await chairPage.getByRole('button', { name: 'Start' }).click();
	await expect(organiserPage.getByRole('button', { name: 'Pause' })).toBeVisible({
		timeout: REALTIME_TIMEOUT_MS + 1_000
	});
	const chairSeconds = await readClockSeconds(chairPage);
	const organiserSeconds = await readClockSeconds(organiserPage);
	expect(Math.abs(chairSeconds - organiserSeconds)).toBeLessThanOrEqual(1);

	// A pause reaches the second screen too. (Suspending, which this test also
	// pressed before the console, is the suspended screen's own test now.)
	await chairPage.waitForTimeout(CLOCK_RUN_MS);
	await chairPage.getByRole('button', { name: 'Pause' }).click();

	await expect(organiserPage.getByRole('button', { name: 'Resume' })).toBeVisible({
		timeout: REALTIME_TIMEOUT_MS + 1_000
	});
	await expect(floorRegion(organiserPage).getByText('Paused', { exact: true })).toBeVisible();

	await chairContext.close();
	await organiserContext.close();
});

test('leaving while a live change is being read lands on the page asked for', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'Realtime needs JavaScript and one project.');

	const room = await makeChairedCommittee('Leaving Live Room MUN');
	await signIn(page, room.chair);
	await openRoom(page, room.roomPath);
	await startSession(page);
	await expect(page.getByText('Connected', { exact: true })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// The room's next reading is never answered, so it is still on its way when
	// the chair leaves. Safari cancels it then, and the room must not answer
	// that by loading itself again over the page the chair asked for (T154).
	await page.route(
		(url) => url.pathname.endsWith('/__data.json'),
		() => {},
		{ times: 1 }
	);
	const reading = page.waitForRequest((request) => request.url().includes('/__data.json'));
	await addWaitingSpeaker(room.committeeId, 'Ghana');
	await reading;

	const gslViewPath = `${room.roomPath}/gsl`;
	await page.goto(gslViewPath);

	await expect(waitingRows(page).filter({ hasText: 'Ghana' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect(new URL(page.url()).pathname).toBe(gslViewPath);
});

test('the chair finds the room from their committees and the committee page', async ({ page }) => {
	const room = await makeChairedCommittee('Entry Chair Room MUN');

	await signIn(page, room.chair);
	// The test conference's dates are in the past, which the list hides without `?past=1`.
	await page.goto('/committees?past=1');
	await page.getByRole('link', { name: 'Chair room' }).first().click();
	await expect(page).toHaveURL(room.roomPath, { timeout: DATABASE_TIMEOUT_MS });

	await page.goto(`/conferences/${room.conferenceSlug}/committees/${room.committeeSlug}`);
	await page.getByRole('link', { name: 'Open chair room' }).click();
	await expect(page).toHaveURL(room.roomPath, { timeout: DATABASE_TIMEOUT_MS });
});

test('does not spill off the side of a phone screen', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	const room = await makeChairedCommittee('Phone Chair Room International MUN');

	await signIn(page, room.chair);
	await openRoom(page, room.roomPath);
	await startSession(page);
	await callSpeaker(page, room, 'Japan');

	await saveFullPageScreenshot(page, 'chair-room');
	await expectNoSidewaysOverflow(page);
});

test('does not move about by itself while it loads on a phone', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	const room = await makeChairedCommittee('Steady Chair Room MUN');

	// A room with a session running and a speaker on the floor, so that every
	// panel that can appear is there to be measured.
	await signIn(page, room.chair);
	await openRoom(page, room.roomPath);
	await startSession(page);
	await callSpeaker(page, room, 'Ghana');

	// Opened afresh, so that what is measured is the room loading, not the presses above.
	await openRoom(page, room.roomPath);
	await expectLittleLayoutShift(page);
});

test('fits in a couple of screens', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'One project is enough to measure a height.');

	const room = await makeChairedCommittee('Height Chair Room MUN');

	await signIn(page, room.chair);
	await openRoom(page, room.roomPath);
	await startSession(page);
	await callSpeaker(page, room, 'France');

	// Saved before the assertion, so that a failure leaves a picture of the page.
	await saveFullPageScreenshot(page, 'chair-room');
	await expectPageFitsInScreens(page, ROOM_SCREENS);
});

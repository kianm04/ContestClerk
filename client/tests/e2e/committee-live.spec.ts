import { expect, test, type Locator, type Page, type WebSocketRoute } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	DATABASE_TIMEOUT_MS,
	makeChairedCommittee,
	takeRollCall,
	type ChairedCommittee
} from './chair-room-fixtures';
import {
	answerRollCallDirectly,
	closeVoteDirectly,
	endSessionDirectly,
	fillSpeakersList,
	livePathOf,
	makeRollCallVoteDirectly,
	proposeCaucus,
	roomChannelListening,
	startSessionInDatabase,
	startSingleSpeakerDirectly,
	startUnmodDirectly,
	suspendForLunchDirectly,
	updateRoom,
	writeRoomState
} from './committee-live-fixtures';
import { openVoteDirectly, startModDirectly } from './mode-fixtures';
import {
	expectNoSidewaysOverflow,
	expectOnFirstScreen,
	expectPageFitsInScreens,
	saveFullPageScreenshot
} from './page-shape';
import { addScheduleCommittee, addScheduleEvent } from './schedule-fixtures';
import { createTestUser, giveSeat, signIn, type TestUser } from './signed-in-user';

// The acceptance criteria of `specs/05-pages/delegate/committee-live.md` that
// need a real browser, as the session redesign (S13) draws the page: who may
// watch, what a delegate sees in every room state, their place and their own
// answer, the clock, following the chair through realtime, a dropped
// connection, and the page's shape on a phone and on a laptop. The projector
// shows the same room (`committee-display.spec.ts`), whose last test follows
// the chair's presses on a delegate's phone and the projector together.
//
// Every test makes a conference of its own with `makeChairedCommittee`, so the
// seats given here are never seen by another test and are not given back.
// The room is put into each state straight in the database, as the chair's
// presses leave it (`committee-live-fixtures.ts`). The page is drawn on the
// server, so every test but the ones about the clock and realtime runs on all
// three projects, `desktop-no-js` included.

/** How long the realtime criteria allow the live view to catch up with the chair. */
const REALTIME_TIMEOUT_MS = 2_000;

/** How long the page waits between reloads while realtime is down, plus some slack. */
const PAUSED_RELOAD_TIMEOUT_MS = 25_000;

/** How many screens the live view may take on a laptop. */
const LIVE_SCREENS = 2;

/**
 * A room in formal debate with France speaking and 45 seconds left of a
 * minute, Ghana and Japan waiting, and a moderated caucus raised by Ghana on
 * the floor, watched by the delegate for Japan.
 */
async function makeBusyRoom(conferenceName: string, delegateName: string) {
	const room = await makeChairedCommittee(conferenceName);
	const delegate = await createTestUser(delegateName);
	await giveSeat(delegate, room.committeeId, 'Japan');
	await startSessionInDatabase(room);
	await fillSpeakersList(room, ['France', 'Ghana', 'Japan'], true);
	await proposeCaucus(room, 'Ghana');
	await updateRoom(room, {
		timer_total_seconds: 60,
		timer_ends_at: new Date(Date.now() + 45_000).toISOString()
	});

	return { room, delegate };
}

/** A room with a session running and nothing else, watched by the delegate for Japan. */
async function makeRunningRoom(conferenceName: string, delegateName: string) {
	const room = await makeChairedCommittee(conferenceName);
	const delegate = await createTestUser(delegateName);
	await giveSeat(delegate, room.committeeId, 'Japan');
	await startSessionInDatabase(room);

	return { room, delegate };
}

/** Open the live view as `user` and wait for the committee's heading. */
async function openLiveView(page: Page, room: ChairedCommittee, user: TestUser): Promise<void> {
	await signIn(page, user);
	await page.goto(livePathOf(room));
	await expect(page.getByRole('heading', { name: /UNSC/, level: 1 })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
}

/** The polite live region, which holds the message screens and nothing else. */
function messageRegion(page: Page): Locator {
	return page.locator('[aria-live="polite"]');
}

/** The seconds the clock on the page shows, read from its "m:ss". */
async function readClockSeconds(page: Page): Promise<number> {
	const clockText = await page.getByRole('timer', { name: 'Time left' }).innerText();
	const [minutes, seconds] = clockText.trim().split(':').map(Number);

	return minutes * 60 + seconds;
}

test('sends a visitor to sign in and back', async ({ page }) => {
	const room = await makeChairedCommittee('Visitor Live MUN');

	await page.goto(livePathOf(room));

	await expect(page).toHaveURL(`/login?next=${encodeURIComponent(livePathOf(room))}`);
});

test('is not found for a stranger or a delegate of another committee', async ({ page }) => {
	const room = await makeChairedCommittee('Stranger Live MUN');
	const otherDelegate = await createTestUser('Live Other Delegate');
	const stranger = await createTestUser('Live Stranger');
	const otherCommitteeId = await addScheduleCommittee(room.conferenceId, {
		name: 'General Assembly',
		abbreviation: 'GA',
		room: 'Room 2'
	});
	const admin = createServiceRoleClient();
	await admin
		.from('seats')
		.insert({ committee_id: otherCommitteeId, name: 'Kenya', country_code: 'KE', position: 1 });
	await giveSeat(otherDelegate, otherCommitteeId, 'Kenya');

	await signIn(page, otherDelegate);
	expect((await page.goto(livePathOf(room)))?.status()).toBe(404);

	await page.context().clearCookies();
	await signIn(page, stranger);
	expect((await page.goto(livePathOf(room)))?.status()).toBe(404);
});

test('lets the organiser watch a room with no session, without the footer or a seat', async ({
	page
}) => {
	const room = await makeChairedCommittee('Idle Live MUN');

	await openLiveView(page, room, room.organiser);

	await expect(page.getByRole('heading', { level: 1 })).toHaveText('UNSC');
	await expect(messageRegion(page).getByText('No session is running')).toBeVisible();
	await expect(page.getByRole('contentinfo')).toHaveCount(0);
	// With nothing later on the schedule there is no "Next" line, and staff have no "You".
	await expect(page.getByRole('main').getByText(/^Next: /)).toHaveCount(0);
	await expect(page.getByRole('main').getByText(/You /)).toHaveCount(0);
});

test('names the next schedule event while no session is running', async ({ page }) => {
	const room = await makeChairedCommittee('Next Event Live MUN');
	const startsAt = Date.now() + 2 * 24 * 60 * 60 * 1000;
	await addScheduleEvent({
		conferenceId: room.conferenceId,
		title: 'Committee session II',
		startsAt: new Date(startsAt).toISOString(),
		endsAt: new Date(startsAt + 60 * 60 * 1000).toISOString(),
		audience: 'committee',
		committeeId: room.committeeId,
		location: 'Room 4'
	});

	await openLiveView(page, room, room.organiser);

	await expect(messageRegion(page).getByText('No session is running')).toBeVisible();
	await expect(
		messageRegion(page).getByText(
			/^Next: Committee session II · \w+ \d{1,2} \w+, \d\d:\d\d · Room 4$/
		)
	).toBeVisible();
});

test('the opening says the session has started, in the live region and nothing else', async ({
	page
}) => {
	const { room, delegate } = await makeRunningRoom('Opening Live MUN', 'Live Opening Delegate');

	await openLiveView(page, room, delegate);

	await expect(messageRegion(page).getByText('The session has started')).toBeVisible();
	await expect(messageRegion(page).getByText('Agenda to be set')).toBeVisible();
	await expect(page.getByRole('timer')).toHaveCount(0);
});

test('shows a delegate the floor, their place, the list and the motion on the floor', async ({
	page
}) => {
	const { room, delegate } = await makeBusyRoom('Speakers Live MUN', 'Live Japan Delegate');

	await openLiveView(page, room, delegate);

	const floor = page.getByRole('region', { name: 'General Speakers’ List' });
	await expect(floor.getByText('France', { exact: true })).toBeVisible();
	await expect(floor.getByRole('timer', { name: 'Time left' })).toBeVisible();
	// 45 seconds left on France, then Ghana's minute.
	await expect(floor.getByText(/^You are 2nd · about 2 min$/)).toBeVisible();
	// `exact`, because a name is otherwise matched anywhere in "General Speakers’ List" too.
	const list = page.getByRole('region', { name: 'Speakers’ list', exact: true });
	await expect(list.getByRole('listitem')).toHaveText([
		/^\s*1\s*Ghana\s*$/,
		/^\s*2\s*Japan.*You\s*$/
	]);
	const motion = page.getByRole('region', { name: 'Motion on the floor' });
	await expect(motion.getByText('Moderated caucus · 10:00 / 1:00')).toBeVisible();
	await expect(motion.getByText('Climate finance · Ghana')).toBeVisible();
	// The room is drawn without the old ring, pill or speech details.
	await expect(page.getByText('Speaking now')).toHaveCount(0);
	await expect(page.getByText(/^of \d/)).toHaveCount(0);
	// Nothing on the page lets a delegate change the room.
	await expect(page.getByRole('main').locator('form')).toHaveCount(0);
	await expect(page.getByRole('main').getByRole('button')).toHaveCount(0);

	// The context line counts who is present at the latest roll call, and a
	// seat marked absent keeps its place but is skipped by "Next".
	await takeRollCall(room, 'Ghana');
	await page.reload();
	await expect(page.getByText(/^Japan · 2\/3 present/)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(list.getByRole('listitem').first()).toHaveText(/^\s*1\s*Ghana\s*absent\s*$/);
	await expect(floor.getByText(/^You are 1st · about 1 min$/)).toBeVisible();
});

test('says "You have the floor" above the speaker while the reader\'s seat has it', async ({
	page
}) => {
	const { room, delegate } = await makeRunningRoom('Floor Live MUN', 'Live Floor Delegate');
	await fillSpeakersList(room, ['Japan', 'France'], true);

	await openLiveView(page, room, delegate);

	await expect(page.getByText('You have the floor')).toBeVisible();
	await expect(page.getByText(/^You are /)).toHaveCount(0);
});

test('the clock counts down, and holds still while paused', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'The clock ticks with JavaScript only.');

	const { room, delegate } = await makeRunningRoom('Timer Live MUN', 'Live Timer Delegate');
	await fillSpeakersList(room, ['France'], true);
	await updateRoom(room, {
		timer_total_seconds: 120,
		timer_ends_at: new Date(Date.now() + 90_000).toISOString()
	});

	await openLiveView(page, room, delegate);

	const firstReading = await readClockSeconds(page);
	await expect.poll(() => readClockSeconds(page)).toBeLessThan(firstReading);

	await updateRoom(room, { timer_ends_at: null, timer_paused_remaining_seconds: 45 });
	await page.reload();
	await expect(page.getByRole('timer', { name: 'Time left' })).toHaveText('0:45', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page.getByText('Paused', { exact: true })).toBeVisible();

	// Two seconds later a paused clock still says the same.
	await page.waitForTimeout(2_000);
	expect(await readClockSeconds(page)).toBe(45);
});

test('a moderated caucus shows its topic, its clock line and its own speakers', async ({
	page
}) => {
	const { room, delegate } = await makeRunningRoom('Mod Live MUN', 'Live Mod Delegate');
	await startModDirectly(room, {
		topic: 'Opening humanitarian corridors',
		totalSeconds: 600,
		speakingSeconds: 60,
		caucusClock: { pausedAtSeconds: 372 }
	});
	await fillSpeakersList(room, ['Ghana', 'France', 'Japan'], true);

	await openLiveView(page, room, delegate);

	const floor = page.getByRole('region', {
		name: 'Moderated caucus · Opening humanitarian corridors'
	});
	await expect(floor.getByRole('timer', { name: 'Caucus time left' })).toHaveText(
		/^\s*Caucus\s+6:12\s+left of 10:00\s*$/
	);
	await expect(floor.getByText('Ghana', { exact: true })).toBeVisible();
	const list = page.getByRole('region', { name: 'Caucus speakers' });
	await expect(list.getByRole('listitem')).toHaveText([
		/^\s*1\s*France\s*$/,
		/^\s*2\s*Japan.*You\s*$/
	]);
	await expect(page.getByRole('region', { name: 'Motion on the floor' })).toHaveCount(0);
});

test('an unmoderated caucus shows the clock and when the room is back, with no list', async ({
	page
}) => {
	const { room, delegate } = await makeRunningRoom('Unmod Live MUN', 'Live Unmod Delegate');
	await startUnmodDirectly(room, 522);

	await openLiveView(page, room, delegate);

	const floor = page.getByRole('region', {
		name: 'Unmoderated caucus · Drafting the working paper'
	});
	await expect(floor.getByRole('timer', { name: 'Time left' })).toHaveText(/^\s*8:[34]\d\s*$/);
	await expect(floor.getByText(/^Back at \d\d:\d\d$/)).toBeVisible();
	// No list of speakers in the page itself; the app's top bar keeps its own menu list.
	await expect(page.getByRole('main').getByRole('list')).toHaveCount(0);
});

test("a single speaker shows the purpose, a typed name's initials and the reader's place", async ({
	page
}) => {
	const { room, delegate } = await makeRunningRoom('Single Live MUN', 'Live Single Delegate');
	await startSingleSpeakerDirectly(room, 'Secretary-General', ['Japan']);

	await openLiveView(page, room, delegate);

	const floor = page.getByRole('region', { name: 'Single speaker · Right of reply' });
	await expect(floor.getByText('Secretary-General', { exact: true })).toBeVisible();
	await expect(floor.getByText('SG', { exact: true })).toBeVisible();
	await expect(floor.getByText(/^You are 1st · about 1 min$/)).toBeVisible();
});

test("voting: by show of hands without counts, by roll call with the reader's answer, then the result", async ({
	page
}) => {
	const { room, delegate } = await makeRunningRoom('Vote Live MUN', 'Live Vote Delegate');
	await writeRoomState(room, { mode: 'voting' });

	await openLiveView(page, room, delegate);
	await expect(messageRegion(page).getByText('Voting procedure')).toBeVisible();
	await expect(messageRegion(page).getByText('The vote will open shortly')).toBeVisible();

	await openVoteDirectly(room);
	await page.reload();
	const vote = page.getByRole('region', { name: 'Draft Resolution 1.1' });
	await expect(vote.getByText('Simple majority · voting by show of hands')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(vote.locator('dl')).toHaveCount(0);

	await makeRollCallVoteDirectly(room);
	await answerRollCallDirectly(room, 'France', 'for');
	await page.reload();
	await expect(vote.getByText('Roll call vote · two-thirds majority')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(vote.getByText('Your seat has not been called yet')).toBeVisible();
	await expect(vote.locator('dl > div')).toHaveText([/for\s*1/, /against\s*0/, /abstaining\s*0/]);

	await answerRollCallDirectly(room, 'Japan', 'against');
	await page.reload();
	await expect(vote.getByText('You voted no')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	await closeVoteDirectly(room, false);
	await page.reload();
	await expect(page.getByRole('region', { name: 'Draft Resolution 1.1 fails' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
});

test("a chair's answer for the reader's seat reaches the phone within two seconds", async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'Realtime needs JavaScript and one project.');

	const { room, delegate } = await makeRunningRoom('Answer Live MUN', 'Live Answer Delegate');
	await openVoteDirectly(room);
	await makeRollCallVoteDirectly(room);

	const isListening = roomChannelListening(page);
	await openLiveView(page, room, delegate);
	await isListening;
	await expect(page.getByText('Your seat has not been called yet')).toBeVisible();

	await answerRollCallDirectly(room, 'Japan', 'for');
	await expect(page.getByText('You voted yes')).toBeVisible({ timeout: REALTIME_TIMEOUT_MS });
});

test('suspended: the reason and when the room is back, then the mode that was suspended', async ({
	page
}) => {
	const { room, delegate } = await makeRunningRoom('Suspended Live MUN', 'Live Suspended Delegate');
	await fillSpeakersList(room, ['France', 'Japan'], true);
	await suspendForLunchDirectly(room);

	await openLiveView(page, room, delegate);

	await expect(messageRegion(page).getByText('Suspended for lunch')).toBeVisible();
	await expect(messageRegion(page).getByText(/^Back at \d\d:\d\d · in 41 min$/)).toBeVisible();
	await saveFullPageScreenshot(page, 'committee-live-suspended');

	// "Resume session" puts back the mode that was suspended.
	await writeRoomState(room, {
		mode: 'formal_debate',
		suspended_at: null,
		suspended_until: null,
		mode_before_suspension: null
	});
	await page.reload();
	await expect(page.getByRole('region', { name: 'General Speakers’ List' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page.getByText('Suspended for lunch')).toHaveCount(0);
});

test('ended: the session, that it was the last, and who announces the awards', async ({ page }) => {
	const { room, delegate } = await makeRunningRoom('Ended Live MUN', 'Live Ended Delegate');
	await endSessionDirectly(room);

	await openLiveView(page, room, delegate);

	// The fixture conference ran in May 2020, so this was its last session.
	await expect(messageRegion(page).getByText('Session 1 has ended')).toBeVisible();
	await expect(messageRegion(page).getByText('That was the last session.')).toBeVisible();
	await expect(
		messageRegion(page).getByText('Awards are announced by the organisers.')
	).toBeVisible();
});

test('says so when live updates drop, and keeps reloading', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'Realtime needs JavaScript and one project.');

	const room = await makeChairedCommittee('Paused Live MUN');
	await startSessionInDatabase(room);

	// Every realtime socket is passed through to the server, until the test
	// closes it. After that the page's attempts to reconnect are refused.
	const sockets: WebSocketRoute[] = [];
	let isRealtimeDown = false;
	await page.routeWebSocket(/\/realtime\//, (socket) => {
		if (isRealtimeDown) {
			void socket.close();
			return;
		}
		socket.connectToServer();
		sockets.push(socket);
	});

	const isListening = roomChannelListening(page);
	await openLiveView(page, room, room.organiser);
	await isListening;
	await expect(page.getByText('Connected', { exact: true })).toBeVisible();

	isRealtimeDown = true;
	await Promise.all(sockets.map((socket) => socket.close()));

	await expect(page.getByText('Live updates paused. Refresh to catch up.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page.getByText('Reconnecting…')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Refresh' })).toHaveAttribute(
		'href',
		livePathOf(room)
	);

	// Nothing tells the page about this change but its own reloads every 15 seconds.
	await suspendForLunchDirectly(room);
	await expect(messageRegion(page).getByText('Suspended for lunch')).toBeVisible({
		timeout: PAUSED_RELOAD_TIMEOUT_MS
	});
});

test('without JavaScript it draws the room and claims no connection', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop-no-js', 'This is the page without its script.');

	const { room, delegate } = await makeBusyRoom('No Script Live MUN', 'Live No Script Delegate');

	await openLiveView(page, room, delegate);

	await expect(page.getByText('France', { exact: true })).toBeVisible();
	await expect(page.getByText('Connected', { exact: true })).toHaveCount(0);
	await expect(page.getByText(/Live updates paused/)).toHaveCount(0);
});

test('does not spill off the side of a phone screen, with the speaker, clock and place on its first screen', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	const { delegate, room } = await makeBusyRoom(
		'Phone Live View International Model United Nations',
		'Live Phone Delegate'
	);

	await openLiveView(page, room, delegate);
	await expect(page.getByText(/^You are 2nd/)).toBeVisible();

	await saveFullPageScreenshot(page, 'committee-live');
	await expectNoSidewaysOverflow(page);
	await expect(page.getByRole('contentinfo')).toHaveCount(0);

	const floor = page.getByRole('region', { name: 'General Speakers’ List' });
	await expectOnFirstScreen(page, floor.getByText('France', { exact: true }));
	await expectOnFirstScreen(page, floor.getByRole('timer', { name: 'Time left' }));
	await expectOnFirstScreen(page, floor.getByText(/^You are 2nd/));
});

test('uses the width of a desktop, the list beside the floor', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'One project is enough to measure a layout.');

	const { delegate, room } = await makeBusyRoom('Desktop Live MUN', 'Live Desktop Delegate');

	await openLiveView(page, room, delegate);
	await expect(page.getByText(/^You are 2nd/)).toBeVisible();

	// Saved before the assertions, so that a failure leaves a picture of the page.
	await saveFullPageScreenshot(page, 'committee-live');
	await expectPageFitsInScreens(page, LIVE_SCREENS);

	// The list stands to the right of the floor, not under it.
	const floorBox = await page.getByRole('region', { name: 'General Speakers’ List' }).boundingBox();
	const listBox = await page
		.getByRole('region', { name: 'Speakers’ list', exact: true })
		.boundingBox();
	expect(floorBox).not.toBeNull();
	expect(listBox).not.toBeNull();
	expect(listBox?.x ?? 0).toBeGreaterThanOrEqual((floorBox?.x ?? 0) + (floorBox?.width ?? 0));
	expect(listBox?.y ?? 0).toBeLessThan((floorBox?.y ?? 0) + (floorBox?.height ?? 0));
});

test('a delegate finds the live view from their committees and the committee page', async ({
	page
}) => {
	const room = await makeChairedCommittee('Entry Live MUN');
	const delegate = await createTestUser('Live Entry Delegate');
	await giveSeat(delegate, room.committeeId, 'Ghana');

	await signIn(page, delegate);
	// The test conference's dates are in the past, which the list hides without `?past=1`.
	await page.goto('/committees?past=1');
	await page.getByRole('link', { name: 'Live view' }).first().click();
	await expect(page).toHaveURL(livePathOf(room), { timeout: DATABASE_TIMEOUT_MS });

	await page.goto(`/conferences/${room.conferenceSlug}/committees/${room.committeeSlug}`);
	await page.getByRole('link', { name: 'Open live room' }).click();
	await expect(page).toHaveURL(livePathOf(room), { timeout: DATABASE_TIMEOUT_MS });
});

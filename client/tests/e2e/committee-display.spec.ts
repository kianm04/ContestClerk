import {
	expect,
	test,
	type Browser,
	type Locator,
	type Page,
	type WebSocketRoute
} from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	DATABASE_TIMEOUT_MS,
	endSessionFromFrame,
	makeChairedCommittee,
	modeBar,
	openRoom,
	pressChairTab,
	startSession,
	takeRollCall,
	type ChairedCommittee
} from './chair-room-fixtures';
import {
	closeVoteDirectly,
	countHandsDirectly,
	displayPathOf,
	endSessionDirectly,
	endSpeechDirectly,
	fillSpeakersList,
	giveTopics,
	NO_CAUCUS_CLOCK,
	livePathOf,
	roomChannelListening,
	startSessionInDatabase,
	startSingleSpeakerDirectly,
	startUnmodDirectly,
	suspendForLunchDirectly,
	writeRoomState
} from './committee-live-fixtures';
import { addSeats, callSpeaker, seedWaiting } from './gsl-fixtures';
import { openVoteDirectly, setCaucusClock, startModDirectly } from './mode-fixtures';
import { saveFullPageScreenshot } from './page-shape';
import { addScheduleCommittee, addScheduleEvent } from './schedule-fixtures';
import { createTestUser, giveSeat, signIn } from './signed-in-user';

// The acceptance criteria of `specs/05-pages/chair/display.md` (S12) that need
// a real browser: who may open the projector, what it shows in every room
// state, its full screen, pointer and hint, a dropped connection, the page
// without JavaScript, and that it follows the chair's presses together with a
// delegate's phone.
//
// Every test makes a conference of its own with `makeChairedCommittee`. The
// room states are put in place straight in the database, the way the chair's
// presses leave them (`committee-live-fixtures.ts`), except in the test that
// follows the chair, which presses the console's own buttons. The page is drawn
// on the server, so every test of what it shows runs on all three projects.

/** How long the display may take to show a change the chair has made. */
const REALTIME_TIMEOUT_MS = 2_000;

/** How long the page waits between reloads while realtime is down, plus some slack. */
const PAUSED_RELOAD_TIMEOUT_MS = 25_000;

/** The projector shapes the display is designed for (16:9) and checked at (4:3). */
const PROJECTOR_SIZES = [
	{ width: 1920, height: 1080 },
	{ width: 1280, height: 720 },
	{ width: 1024, height: 768 }
];

/** Open the display and wait until it has drawn its top line. */
async function openDisplay(page: Page, room: ChairedCommittee): Promise<void> {
	await page.goto(displayPathOf(room));
	await expect(page.getByRole('main').getByText('UNSC', { exact: true })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
}

/** The display's one heading: the mode line, or the title of a message screen. */
function screenHeading(page: Page): Locator {
	return page.getByRole('heading', { level: 1 });
}

/** A room in formal debate with France speaking and Ghana, Japan, Kenya and Brazil waiting. */
async function makeRoomInDebate(conferenceName: string): Promise<ChairedCommittee> {
	const room = await makeChairedCommittee(conferenceName);
	await addSeats(room, [
		{ name: 'Kenya', countryCode: 'KE' },
		{ name: 'Brazil', countryCode: 'BR' }
	]);
	await startSessionInDatabase(room);
	await fillSpeakersList(room, ['France', 'Ghana', 'Japan', 'Kenya', 'Brazil'], true);

	return room;
}

test('sends a visitor to sign in, and is not found for a stranger', async ({ page }) => {
	const room = await makeChairedCommittee('Visitor Display MUN');
	const stranger = await createTestUser('Display Stranger');

	await page.goto(displayPathOf(room));
	await expect(page).toHaveURL(`/login?next=${encodeURIComponent(displayPathOf(room))}`);

	await signIn(page, stranger);
	expect((await page.goto(displayPathOf(room)))?.status()).toBe(404);
});

test('a delegate of another committee is not let in, and a delegate of this one is', async ({
	page
}) => {
	const room = await makeChairedCommittee('Delegates Display MUN');
	const otherCommitteeId = await addScheduleCommittee(room.conferenceId, {
		name: 'General Assembly',
		abbreviation: 'GA'
	});
	const admin = createServiceRoleClient();
	await admin
		.from('seats')
		.insert({ committee_id: otherCommitteeId, name: 'Kenya', country_code: 'KE', position: 1 });
	const otherDelegate = await createTestUser('Display Other Delegate');
	const delegate = await createTestUser('Display Own Delegate');
	await giveSeat(otherDelegate, otherCommitteeId, 'Kenya');
	await giveSeat(delegate, room.committeeId, 'Ghana');

	await signIn(page, otherDelegate);
	expect((await page.goto(displayPathOf(room)))?.status()).toBe(404);

	await page.context().clearCookies();
	await signIn(page, delegate);
	await openDisplay(page, room);
	// The display is about the room, never the reader.
	await expect(page.getByText('You', { exact: true })).toHaveCount(0);
});

test('the lobby names the committee, the conference and the next event, on a page of its own', async ({
	page
}) => {
	const room = await makeChairedCommittee('Lobby Display MUN');
	const startsAt = Date.now() + 2 * 24 * 60 * 60 * 1000;
	await addScheduleEvent({
		conferenceId: room.conferenceId,
		title: 'Committee session II',
		startsAt: new Date(startsAt).toISOString(),
		endsAt: new Date(startsAt + 60 * 60 * 1000).toISOString(),
		audience: 'committee',
		committeeId: room.committeeId,
		location: 'Council Chamber'
	});

	await signIn(page, room.organiser);
	await openDisplay(page, room);

	await expect(screenHeading(page)).toHaveText('Security Council');
	await expect(page.getByText(/^Lobby Display MUN/)).toBeVisible();
	await expect(
		page.getByText(/^Next: Committee session II · \w+ \d{1,2} \w+, \d\d:\d\d · Council Chamber$/)
	).toBeVisible();
	// No app header, no footer, and nothing on the screen is a form, a button or a
	// link. (The root layout's "Skip to content" link, hidden until focused, is
	// the one link on every page, and jumps to this `<main>`.)
	await expect(page.getByRole('navigation')).toHaveCount(0);
	await expect(page.getByRole('contentinfo')).toHaveCount(0);
	await expect(page.getByRole('main').locator('form, button, a')).toHaveCount(0);
	// The wall clock, "14:07".
	await expect(page.getByRole('main').locator('time')).toHaveText(/^\s*\d\d:\d\d\s*$/);
});

test('the opening says the session has started, with the agenda and the roll call to come', async ({
	page
}) => {
	const room = await makeChairedCommittee('Opening Display MUN');
	await startSessionInDatabase(room);

	await signIn(page, room.organiser);
	await openDisplay(page, room);

	await expect(screenHeading(page)).toHaveText('Session 1 has started');
	await expect(page.getByText('Agenda to be set · Roll call to be taken')).toBeVisible();

	await takeRollCall(room, 'Ghana');
	await giveTopics(room, ['Climate finance']);
	await writeRoomState(room, { agenda_topic: 'Climate finance' });
	await page.reload();
	await expect(page.getByText('Climate finance · 2 of 3 present')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page.getByText('· 2/3 present')).toBeVisible();
});

test('the GSL shows the speaker, the clock and the next three, skipping a seat marked absent', async ({
	page
}) => {
	const room = await makeRoomInDebate('GSL Display MUN');
	await takeRollCall(room, 'Japan');
	await writeRoomState(room, { timer_total_seconds: 60, timer_paused_remaining_seconds: 41 });

	await signIn(page, room.organiser);
	await openDisplay(page, room);

	await expect(screenHeading(page)).toHaveText('General Speakers’ List');
	await expect(page.getByText('France', { exact: true })).toBeVisible();
	await expect(page.getByRole('timer', { name: 'Time left' })).toHaveText('0:41');
	await expect(page.getByText('Paused', { exact: true })).toBeVisible();
	// Japan is marked absent, so "Next" skips it.
	await expect(page.getByText('Ghana · Kenya · Brazil', { exact: true })).toBeVisible();
	await saveFullPageScreenshot(page, 'committee-display-gsl');
});

test('a speaker called whose clock has not started reads "About to speak"', async ({ page }) => {
	const room = await makeRoomInDebate('Called Display MUN');
	await writeRoomState(room, { timer_total_seconds: 60, timer_paused_remaining_seconds: 60 });

	await signIn(page, room.organiser);
	await openDisplay(page, room);

	await expect(page.getByText('About to speak', { exact: true })).toBeVisible();
	await expect(page.getByRole('timer', { name: 'Time left' })).toHaveText('1:00');
});

test('nobody on the floor of the GSL reads that the next speaker will be called shortly', async ({
	page
}) => {
	const room = await makeChairedCommittee('Empty Display MUN');
	await startSessionInDatabase(room);
	await fillSpeakersList(room, ['France', 'Ghana'], true);
	await endSpeechDirectly(room);

	await signIn(page, room.organiser);
	await openDisplay(page, room);

	await expect(page.getByText('The next speaker will be called shortly')).toBeVisible();
	await expect(page.getByText('Ghana', { exact: true })).toBeVisible();
	await expect(page.getByRole('timer')).toHaveCount(0);
});

test('the clock turns warning in its last ten seconds and counts up in danger at zero', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name === 'phone', 'The display has no phone layout.');

	const room = await makeRoomInDebate('Over Time Display MUN');
	await writeRoomState(room, {
		timer_total_seconds: 60,
		timer_ends_at: new Date(Date.now() - 7_000).toISOString()
	});

	await signIn(page, room.organiser);
	await openDisplay(page, room);

	const clock = page.getByRole('timer', { name: 'Time left' });
	await expect(clock).toHaveText(/^\s*\+0:0\d\s*$/);
	await expect(clock).toHaveClass(/text-danger-700/);
});

test('a moderated caucus shows its topic, its own clock and the next three from its list', async ({
	page
}) => {
	const room = await makeChairedCommittee('Mod Display MUN');
	await startSessionInDatabase(room);
	await startModDirectly(room, {
		topic: 'Opening humanitarian corridors',
		totalSeconds: 600,
		speakingSeconds: 60,
		caucusClock: { pausedAtSeconds: 372 }
	});
	await fillSpeakersList(room, ['Ghana', 'France', 'Japan'], true);

	await signIn(page, room.organiser);
	await openDisplay(page, room);

	await expect(screenHeading(page)).toHaveText('Moderated caucus · Opening humanitarian corridors');
	await expect(page.getByRole('timer', { name: 'Caucus time left' })).toHaveText(
		/^\s*Caucus\s+6:12\s+left\s*$/
	);
	await expect(page.getByText('Ghana', { exact: true })).toBeVisible();
	await expect(page.getByText('France · Japan', { exact: true })).toBeVisible();

	await setCaucusClock(room, { pausedAtSeconds: 0 });
	await page.reload();
	await expect(page.getByText('Caucus time is up')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
});

test('a moderated caucus with nobody on the floor asks for placards', async ({ page }) => {
	const room = await makeChairedCommittee('Placards Display MUN');
	await startSessionInDatabase(room);
	await startModDirectly(room, {
		topic: 'Opening humanitarian corridors',
		totalSeconds: 600,
		speakingSeconds: 60,
		caucusClock: { pausedAtSeconds: 600 }
	});

	await signIn(page, room.organiser);
	await openDisplay(page, room);

	await expect(page.getByText('Raise your placard to speak')).toBeVisible();
	await expect(page.getByText('Next', { exact: true })).toHaveCount(0);
});

test('an unmoderated caucus shows one huge clock and when the room is back', async ({ page }) => {
	const room = await makeChairedCommittee('Unmod Display MUN');
	await startSessionInDatabase(room);
	await startUnmodDirectly(room, 522);

	await signIn(page, room.organiser);
	await openDisplay(page, room);

	await expect(screenHeading(page)).toHaveText('Unmoderated caucus · Drafting the working paper');
	await expect(page.getByRole('timer', { name: 'Time left' })).toHaveText(/^\s*8:[34]\d\s*$/);
	await expect(page.getByText(/^Back at \d\d:\d\d$/)).toBeVisible();
});

test("a single speaker shows the purpose and a typed name's initials", async ({ page }) => {
	const room = await makeChairedCommittee('Single Display MUN');
	await startSessionInDatabase(room);
	await startSingleSpeakerDirectly(room, 'Secretary-General', ['Ghana']);

	await signIn(page, room.organiser);
	await openDisplay(page, room);

	await expect(screenHeading(page)).toHaveText('Single speaker · Right of reply');
	await expect(page.getByText('Secretary-General', { exact: true })).toBeVisible();
	await expect(page.getByText('SG', { exact: true })).toBeVisible();
	await expect(page.getByText('Ghana', { exact: true })).toBeVisible();
});

test('voting: the procedure, then the counts as the chair saves them, then the result', async ({
	page
}) => {
	const room = await makeChairedCommittee('Vote Display MUN');
	await startSessionInDatabase(room);
	await writeRoomState(room, { mode: 'voting' });

	await signIn(page, room.organiser);
	await openDisplay(page, room);
	await expect(screenHeading(page)).toHaveText('Voting procedure');
	await expect(page.getByText('The vote will open shortly')).toBeVisible();

	await openVoteDirectly(room);
	await countHandsDirectly(room, { for: 2, against: 1, abstain: 0 });
	await page.reload();
	await expect(screenHeading(page)).toHaveText('Voting by show of hands · simple majority', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page.getByText('Draft Resolution 1.1', { exact: true })).toBeVisible();
	await expect(page.locator('dl > div')).toHaveText([/for\s*2/, /against\s*1/, /abstaining\s*0/]);

	await closeVoteDirectly(room, true);
	await page.reload();
	await expect(page.getByText('Draft Resolution 1.1 passes', { exact: true })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(screenHeading(page)).toHaveText('Draft Resolution 1.1 · simple majority');
});

test('suspended: the reason and when the room is back, counting down in whole minutes', async ({
	page
}) => {
	const room = await makeRoomInDebate('Suspended Display MUN');
	await suspendForLunchDirectly(room);

	await signIn(page, room.organiser);
	await openDisplay(page, room);

	await expect(screenHeading(page)).toHaveText('Suspended for lunch');
	await expect(page.getByText(/^Back at \d\d:\d\d · in 41 min$/)).toBeVisible();
});

test('ended: the session that ended, and that it was the last', async ({ page }) => {
	const room = await makeRoomInDebate('Ended Display MUN');
	await endSessionDirectly(room);

	await signIn(page, room.organiser);
	await openDisplay(page, room);

	// The fixture conference ran in May 2020, so this was its last session.
	await expect(screenHeading(page)).toHaveText('Session 1 has ended');
	await expect(page.getByText('That was the last session.')).toBeVisible();
});

test('fills a projector of every shape without scrolling or spilling over', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'One project is enough to measure a layout.');

	const room = await makeRoomInDebate('Sizes Display MUN Model United Nations');
	await writeRoomState(room, { timer_total_seconds: 60, timer_paused_remaining_seconds: 41 });
	await signIn(page, room.organiser);

	for (const size of PROJECTOR_SIZES) {
		await page.setViewportSize(size);
		await openDisplay(page, room);
		const overflow = await page.evaluate(() => ({
			sideways: document.documentElement.scrollWidth - window.innerWidth,
			downwards: document.documentElement.scrollHeight - window.innerHeight
		}));

		expect(overflow, `${size.width} × ${size.height}`).toEqual({ sideways: 0, downwards: 0 });
	}
});

test('shows "Press F for full screen" for three seconds, F toggles full screen, and the pointer hides', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'The hint, F and the pointer need JavaScript.');

	const room = await makeChairedCommittee('Full Screen Display MUN');
	await signIn(page, room.organiser);
	await openDisplay(page, room);

	const hint = page.getByText('Press F for full screen');
	await expect(hint).toBeVisible();
	await expect(hint).toHaveCount(0, { timeout: 5_000 });

	await page.keyboard.press('f');
	await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
	await page.keyboard.press('f');
	await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(false);

	const main = page.getByRole('main');
	await page.mouse.move(200, 200);
	await expect(main).not.toHaveClass(/cursor-none/);
	await expect(main).toHaveClass(/cursor-none/, { timeout: 5_000 });
	await page.mouse.move(300, 300);
	await expect(main).not.toHaveClass(/cursor-none/);
});

test('says "Reconnecting…" when live updates drop, and keeps reading the room', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'Realtime needs JavaScript and one project.');

	const room = await makeRoomInDebate('Paused Display MUN');

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

	await signIn(page, room.organiser);
	const isListening = roomChannelListening(page);
	await openDisplay(page, room);
	await isListening;

	isRealtimeDown = true;
	await Promise.all(sockets.map((socket) => socket.close()));
	await expect(page.getByText('Reconnecting…')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	// Nobody stands at a projector to press "Refresh", so there is none.
	await expect(page.getByRole('main').getByRole('link')).toHaveCount(0);

	// Nothing tells the page about this change but its own reloads every 15 seconds.
	await suspendForLunchDirectly(room);
	await expect(screenHeading(page)).toHaveText('Suspended for lunch', {
		timeout: PAUSED_RELOAD_TIMEOUT_MS
	});
});

test('without JavaScript it draws the room and reloads itself every fifteen seconds', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop-no-js', 'This is the page without its script.');

	const room = await makeRoomInDebate('No Script Display MUN');
	await signIn(page, room.organiser);
	await openDisplay(page, room);

	await expect(page.getByText('France', { exact: true })).toBeVisible();
	await expect(page.locator('meta[http-equiv="refresh"]')).toHaveAttribute('content', '15');
	await expect(page.getByText('Press F for full screen')).toHaveCount(0);
});

/** A signed-in page of its own for `user`, in a browser context of its own. */
async function pageFor(browser: Browser, user: Parameters<typeof signIn>[1]): Promise<Page> {
	const context = await browser.newContext();
	const page = await context.newPage();
	await signIn(page, user);

	return page;
}

test("the display and a delegate's phone both follow the chair's presses within two seconds", async ({
	browser
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'Realtime needs JavaScript and one project.');

	const room = await makeChairedCommittee('Follow Display MUN');
	const delegate = await createTestUser('Follow Display Delegate');
	await giveSeat(delegate, room.committeeId, 'Japan');
	const chairPage = await pageFor(browser, room.chair);
	const displayPage = await pageFor(browser, room.organiser);
	const phonePage = await pageFor(browser, delegate);

	await openRoom(chairPage, room.roomPath);
	const isDisplayListening = roomChannelListening(displayPage);
	const isPhoneListening = roomChannelListening(phonePage);
	await openDisplay(displayPage, room);
	await phonePage.goto(livePathOf(room));
	await Promise.all([isDisplayListening, isPhoneListening]);
	await expect(screenHeading(displayPage)).toHaveText('Security Council');
	await expect(phonePage.getByText('No session is running')).toBeVisible();

	/** Both watchers show `displayText` and `phoneText` within two seconds of the press. */
	async function expectBothFollow(displayText: string | RegExp, phoneText: string | RegExp) {
		await Promise.all([
			expect(screenHeading(displayPage)).toHaveText(displayText, { timeout: REALTIME_TIMEOUT_MS }),
			expect(phonePage.getByRole('main').getByText(phoneText).first()).toBeVisible({
				timeout: REALTIME_TIMEOUT_MS
			})
		]);
	}

	await startSession(chairPage);
	await expectBothFollow('Session 1 has started', 'The session has started');

	await seedWaiting(room, ['France', 'Ghana']);
	await chairPage.reload();
	await callSpeaker(chairPage, 'France');
	await expectBothFollow('General Speakers’ List', 'General Speakers’ List');
	await expect(displayPage.getByText('France', { exact: true })).toBeVisible();
	await expect(displayPage.getByText('About to speak')).toBeVisible();

	// The display follows the room, never the chair's tab: on Motions it keeps the speech.
	await pressChairTab(chairPage, 'Motions');
	await expect(chairPage).toHaveURL(`${room.roomPath}/motions`, { timeout: DATABASE_TIMEOUT_MS });
	await expect(displayPage.getByText('France', { exact: true })).toBeVisible();
	await expect(screenHeading(displayPage)).toHaveText('General Speakers’ List');

	await modeBar(chairPage).getByRole('button', { name: 'Suspend' }).click();
	await expectBothFollow('Suspended', 'Suspended');
	await chairPage.getByRole('main').getByRole('button', { name: 'Resume session' }).click();
	await expectBothFollow('General Speakers’ List', 'General Speakers’ List');

	await endSessionFromFrame(chairPage);
	await expectBothFollow('Session 1 has ended', 'Session 1 has ended');

	await chairPage.context().close();
	await displayPage.context().close();
	await phonePage.context().close();
});

test('the display and a phone show the same screen for every room state, within two seconds', async ({
	browser
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'Realtime needs JavaScript and one project.');

	const room = await makeChairedCommittee('Same Screen Display MUN');
	const delegate = await createTestUser('Same Screen Delegate');
	await giveSeat(delegate, room.committeeId, 'Japan');
	await startSessionInDatabase(room);
	const displayPage = await pageFor(browser, room.organiser);
	const phonePage = await pageFor(browser, delegate);

	const isDisplayListening = roomChannelListening(displayPage);
	const isPhoneListening = roomChannelListening(phonePage);
	await openDisplay(displayPage, room);
	await phonePage.goto(livePathOf(room));
	await Promise.all([isDisplayListening, isPhoneListening]);

	// Each room state as the chair's presses leave it, and what each screen then reads.
	const steps: { arrange: () => Promise<void>; display: string; phone: string }[] = [
		{
			arrange: () => fillSpeakersList(room, ['France', 'Ghana', 'Japan'], true),
			display: 'General Speakers’ List',
			phone: 'General Speakers’ List'
		},
		{
			arrange: async () => {
				await startModDirectly(room, {
					topic: 'Opening humanitarian corridors',
					totalSeconds: 600,
					speakingSeconds: 60,
					caucusClock: { pausedAtSeconds: 600 }
				});
			},
			display: 'Moderated caucus · Opening humanitarian corridors',
			phone: 'Moderated caucus · Opening humanitarian corridors'
		},
		{
			arrange: () => startUnmodDirectly(room, 300),
			display: 'Unmoderated caucus · Drafting the working paper',
			phone: 'Unmoderated caucus · Drafting the working paper'
		},
		{
			arrange: () => startSingleSpeakerDirectly(room, 'Secretary-General', ['Ghana']),
			display: 'Single speaker · Right of reply',
			phone: 'Single speaker · Right of reply'
		},
		{
			arrange: () =>
				writeRoomState(room, {
					mode: 'voting',
					current_speaker_entry_id: null,
					...NO_CAUCUS_CLOCK
				}),
			display: 'Voting procedure',
			phone: 'Voting procedure'
		},
		{
			arrange: () => openVoteDirectly(room),
			display: 'Voting by show of hands · simple majority',
			phone: 'Simple majority · voting by show of hands'
		},
		{
			arrange: () => closeVoteDirectly(room, true),
			display: 'Draft Resolution 1.1 · simple majority',
			phone: 'Draft Resolution 1.1 passes'
		},
		{
			arrange: async () => {
				await writeRoomState(room, { mode: 'formal_debate', current_vote_id: null });
				await suspendForLunchDirectly(room);
			},
			display: 'Suspended for lunch',
			phone: 'Suspended for lunch'
		},
		{
			arrange: () => endSessionDirectly(room),
			display: 'Session 1 has ended',
			phone: 'Session 1 has ended'
		}
	];

	for (const step of steps) {
		await step.arrange();
		await Promise.all([
			expect(screenHeading(displayPage)).toHaveText(step.display, {
				timeout: REALTIME_TIMEOUT_MS
			}),
			expect(phonePage.getByRole('main').getByText(step.phone).first()).toBeVisible({
				timeout: REALTIME_TIMEOUT_MS
			})
		]);
	}

	await displayPage.context().close();
	await phonePage.context().close();
});

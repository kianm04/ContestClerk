import { expect, test, type Page } from '@playwright/test';
import {
	DATABASE_TIMEOUT_MS,
	makeChairedCommittee,
	readCommitteeState,
	takeRollCall,
	waitUntilAnswered,
	type ChairedCommittee
} from './chair-room-fixtures';
import {
	fillSpeakersList,
	livePathOf,
	roomChannelListening,
	startSessionInDatabase,
	updateRoom
} from './committee-live-fixtures';
import { gslPath, openGslView } from './gsl-fixtures';
import { createTestUser, giveSeat, signIn } from './signed-in-user';

// T139: a running clock never shows more time than it did a moment before,
// whoever is watching it and however far their computer's clock is off.
//
// The chair's presses are held back on their way to the server, the way a slow
// connection would, while the page reads its clocks every 50 milliseconds. The
// clocks need JavaScript and realtime, so these tests run on one project only.
// The chair's clock is the GSL view's (S4): a called speaker's clock is ready
// at the full time and not running until the chair presses "Start".

/** How long each of the chair's presses is held back before it reaches the server. */
const HELD_PRESS_MS = 800;

/** How often the page's clocks are read, and for how long after a press. */
const SAMPLE_EVERY_MS = 50;
const CHAIR_SAMPLING_MS = 3_000;

/**
 * How long the delegate's clocks are read after a press: the chair's held
 * press, the realtime message and a fresh `load`, then three seconds more.
 */
const DELEGATE_SAMPLING_MS = 6_000;

/**
 * How long the delegate's test may take in all: three readings of
 * `DELEGATE_SAMPLING_MS` (Start, Resume and Next), two accounts signing in
 * and the room being made. It takes about 24 seconds on its own, too close to
 * Playwright's default 30 for a machine running the whole suite, where it
 * timed out once.
 */
const DELEGATE_TEST_TIMEOUT_MS = 60_000;

/** The list's speaking time, which calling a speaker and "Next" both set. */
const SPEAKING_TIME_SECONDS = 60;

/** The name `takeRollCall` marks absent: no seat has it, so every seat is present. */
const NO_SEAT_ABSENT = '';

/** How far the tests below set the browser's clock off from the server's. */
const CLOCK_SKEW_MS = 5_000;

/**
 * A room in formal debate with nobody speaking yet and three seats waiting.
 * Over an empty floor the room offers "Call France" (T167), and France's clock
 * is then ready; "Start" runs it.
 */
async function makeWaitingRoom(conferenceName: string): Promise<ChairedCommittee> {
	const room = await makeChairedCommittee(conferenceName);
	await startSessionInDatabase(room);
	// Nobody has been called yet, so the room is still opening (S5): the
	// chair's GSL view offers "Call France", and the delegate's phone shows the
	// opening message, with no clock, until somebody has the floor.
	await takeRollCall(room, NO_SEAT_ABSENT);
	await fillSpeakersList(room, ['France', 'Ghana', 'Japan'], false);

	return room;
}

/** Hold back every form the page sends (`?/timerStart` and so on) by `HELD_PRESS_MS`. */
async function holdPresses(page: Page): Promise<void> {
	await page.route(
		(url) => url.search.startsWith('?/'),
		async (route) => {
			await new Promise((resolve) => setTimeout(resolve, HELD_PRESS_MS));
			await route.fallback();
		}
	);
}

/** "m:ss" or "mm:ss" as seconds. */
function clockSeconds(clockText: string): number {
	const [minutes, seconds] = clockText.trim().split(':').map(Number);

	return minutes * 60 + seconds;
}

/**
 * Read every clock on the page every `SAMPLE_EVERY_MS` for `durationMs`, inside
 * the page itself so no reading is missed. Answers one list of seconds per clock.
 */
async function sampleClocks(page: Page, durationMs: number): Promise<number[][]> {
	const readings = await page.evaluate(
		async ({ everyMs, forMs }) => {
			const samples: string[][] = [];
			const startedAt = performance.now();

			while (performance.now() - startedAt < forMs) {
				const clocks = Array.from(document.querySelectorAll('main [role="timer"]'));
				samples.push(clocks.map((clock) => clock.textContent ?? ''));
				await new Promise((resolve) => setTimeout(resolve, everyMs));
			}

			return samples;
		},
		{ everyMs: SAMPLE_EVERY_MS, forMs: durationMs }
	);
	const clockCount = Math.min(...readings.map((sample) => sample.length));
	const perClock: number[][] = [];

	for (let clock = 0; clock < clockCount; clock += 1) {
		perClock.push(readings.map((sample) => clockSeconds(sample[clock])));
	}

	return perClock;
}

/** Each place in `seconds` where the clock showed more than the reading before. */
function rises(seconds: number[]): string[] {
	return seconds.slice(1).flatMap((reading, index) => {
		const before = seconds[index];

		return reading > before ? [`${before} then ${reading} at reading ${index + 1}`] : [];
	});
}

/** The readings from the first one that is higher than the one before, when there is one. */
function fromFirstRise(seconds: number[]): number[] {
	const riseIndex = seconds.findIndex(
		(reading, index) => index > 0 && reading > seconds[index - 1]
	);

	return riseIndex === -1 ? [] : seconds.slice(riseIndex);
}

/** Press a button on the chair's page, then read its clocks for `CHAIR_SAMPLING_MS`. */
async function pressAndSample(page: Page, buttonName: string): Promise<number[][]> {
	await page.getByRole('button', { name: buttonName }).click();

	return sampleClocks(page, CHAIR_SAMPLING_MS);
}

/** Pause the running clock and wait until the server has saved it. */
async function pauseClock(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Pause' }).click();
	await waitUntilAnswered(page);
}

/** The seconds a running timer that ends at `endsAt` has left right now, as a server reckons them. */
function secondsLeftUntil(endsAt: string): number {
	return Math.ceil((new Date(endsAt).getTime() - Date.now()) / 1000);
}

test('the chair’s clock never goes up after calling a speaker, Start, Resume or Next', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'The clocks need JavaScript and one project.');
	const room = await makeWaitingRoom('Clock Chair MUN');

	await signIn(page, room.chair);
	await openGslView(page, gslPath(room));
	await holdPresses(page);

	// The called speaker's clock shows the full time at once, ready.
	const afterCall = await pressAndSample(page, 'Call France');
	expect(afterCall.length).toBeGreaterThan(0);
	for (const clock of afterCall) {
		expect(clock[0]).toBe(SPEAKING_TIME_SECONDS);
		expect(rises(clock)).toEqual([]);
	}

	const afterStart = await pressAndSample(page, 'Start');
	for (const clock of afterStart) expect(rises(clock)).toEqual([]);

	await pauseClock(page);
	const afterResume = await pressAndSample(page, 'Resume');
	for (const clock of afterResume) expect(rises(clock)).toEqual([]);

	// "Next" shows the new speech's full time at once, ready for "Start".
	const afterNext = await pressAndSample(page, 'Next: Ghana');
	for (const clock of afterNext) {
		expect(clock[0]).toBe(SPEAKING_TIME_SECONDS);
		expect(rises(clock)).toEqual([]);
	}
});

test('the delegate’s clock never goes up while it follows the chair', async ({
	browser
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'The clocks need JavaScript and one project.');
	test.setTimeout(DELEGATE_TEST_TIMEOUT_MS);
	const room = await makeWaitingRoom('Clock Delegate MUN');
	const delegate = await createTestUser('Clock Delegate');
	await giveSeat(delegate, room.committeeId, 'Japan');
	const chairContext = await browser.newContext();
	const delegateContext = await browser.newContext();
	const chairPage = await chairContext.newPage();
	const delegatePage = await delegateContext.newPage();

	await signIn(chairPage, room.chair);
	await signIn(delegatePage, delegate);
	await openGslView(chairPage, gslPath(room));
	await holdPresses(chairPage);
	const isListening = roomChannelListening(delegatePage);
	await delegatePage.goto(livePathOf(room));
	await isListening;

	/** Read the delegate's clocks while the chair presses `buttonName`. */
	async function sampleDelegateDuring(buttonName: string): Promise<number[][]> {
		const sampling = sampleClocks(delegatePage, DELEGATE_SAMPLING_MS);
		await chairPage.getByRole('button', { name: buttonName }).click();

		return sampling;
	}

	// Before the first call the delegate's phone shows the opening message and
	// no clock (S13); the call brings the floor in, its clock at the full time.
	await chairPage.getByRole('button', { name: 'Call France' }).click();
	await expect(delegatePage.getByRole('main').getByRole('timer').first()).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	const aroundStart = await sampleDelegateDuring('Start');
	expect(aroundStart.length).toBeGreaterThan(0);
	for (const clock of aroundStart) expect(rises(clock)).toEqual([]);

	// A pause reaches the delegate a moment after the chair pressed it, so their
	// clock may have run on below the paused time and step back up to it. The
	// clock is no longer running then; the readings start once it shows the pause.
	await pauseClock(chairPage);
	await expect(delegatePage.getByText('Paused', { exact: true })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	const aroundResume = await sampleDelegateDuring('Resume');
	for (const clock of aroundResume) expect(rises(clock)).toEqual([]);

	// The new speech is the one rise allowed; from there it only counts down. The
	// delegate hears of it a moment after the press, so it may already be under
	// the full time, but never over it.
	const aroundNextSpeaker = await sampleDelegateDuring('Next: Ghana');
	for (const clock of aroundNextSpeaker) {
		const newSpeech = fromFirstRise(clock);
		expect(newSpeech.length).toBeGreaterThan(0);
		expect(newSpeech[0]).toBeLessThanOrEqual(SPEAKING_TIME_SECONDS);
		expect(rises(newSpeech)).toEqual([]);
	}

	await chairContext.close();
	await delegateContext.close();
});

test('a delegate whose clock is five seconds ahead sees the right time', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'The clocks need JavaScript and one project.');
	// France has the floor, so the delegate's phone draws the floor and its clock (S13).
	const room = await makeChairedCommittee('Clock Skew Delegate MUN');
	await startSessionInDatabase(room);
	await takeRollCall(room, NO_SEAT_ABSENT);
	await fillSpeakersList(room, ['France', 'Ghana', 'Japan'], true);
	const delegate = await createTestUser('Clock Skew Delegate');
	await giveSeat(delegate, room.committeeId, 'Japan');
	const endsAt = new Date(Date.now() + 45_000).toISOString();
	await updateRoom(room, { timer_total_seconds: 60, timer_ends_at: endsAt });

	// The browser's `Date` and timers run on from five seconds ahead of the real time.
	await page.clock.install({ time: Date.now() + CLOCK_SKEW_MS });
	await signIn(page, delegate);
	await page.goto(livePathOf(room));
	await expect(page.getByRole('timer').first()).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	const [clock] = await sampleClocks(page, 500);
	const expectedSeconds = secondsLeftUntil(endsAt);
	expect(Math.abs(clock[clock.length - 1] - expectedSeconds)).toBeLessThanOrEqual(1);
});

test('a chair whose clock is five seconds behind sees and stores the right time', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'The clocks need JavaScript and one project.');
	// France has the floor here, so the GSL view draws the floor's clock.
	const room = await makeChairedCommittee('Clock Skew Chair MUN');
	await startSessionInDatabase(room);
	await takeRollCall(room, NO_SEAT_ABSENT);
	await fillSpeakersList(room, ['France', 'Ghana', 'Japan'], true);
	const endsAt = new Date(Date.now() + 45_000).toISOString();
	await updateRoom(room, { timer_total_seconds: 60, timer_ends_at: endsAt });

	// Behind rather than ahead: a press that trusted this clock would look five
	// seconds old to the server, and the stored timer would end five seconds early.
	await page.clock.install({ time: Date.now() - CLOCK_SKEW_MS });
	await signIn(page, room.chair);

	await page.goto(gslPath(room));
	await expect(page.getByRole('main').getByRole('timer')).toHaveCount(1, {
		timeout: DATABASE_TIMEOUT_MS
	});
	const clocks = await sampleClocks(page, 500);
	for (const clock of clocks) {
		expect(Math.abs(clock[clock.length - 1] - secondsLeftUntil(endsAt))).toBeLessThanOrEqual(1);
	}

	// "Next" gives Ghana a ready clock; "Start" runs its minute from the moment of the press.
	await page.getByRole('button', { name: 'Next: Ghana' }).click();
	await waitUntilAnswered(page);
	const pressedAt = Date.now();
	await page.getByRole('button', { name: 'Start' }).click();
	await waitUntilAnswered(page);

	const stored = await readCommitteeState(room.committeeId);
	const storedEndsAt = new Date(stored.timer_ends_at ?? '').getTime();
	expect(Math.abs(storedEndsAt - (pressedAt + SPEAKING_TIME_SECONDS * 1000))).toBeLessThan(1_000);
});

import { expect, test, type Page, type Route, type TestInfo } from '@playwright/test';
import { BUSY_INDICATOR_DELAY_MS } from '../../src/lib/button-classes';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	DATABASE_TIMEOUT_MS,
	makeChairedCommittee,
	openRoom,
	startSession,
	type ChairedCommittee,
	waitUntilAnswered
} from './chair-room-fixtures';
import { waitForChairScript } from './chair-script';
import { skipWithoutJavaScript } from './in-place';
import { signIn } from './signed-in-user';

// T140: a roll call answer shows the moment it is pressed, with no spinner,
// presses made quickly are all kept in the order made, and one that fails goes
// back and says which seat it was. The other roll call tests, including the
// ones without JavaScript, are in `roll-call.spec.ts`. The roll call view is
// S5's (specs/05-pages/chair/roll-call.md): each test starts a fresh roll call
// with its quiet "Start a new roll call", so the presses answer in it.

/** How long a press may take to show on screen and still count as "at once". */
const AT_ONCE_TIMEOUT_MS = 500;

/**
 * How long each answer is held back in these tests, longer than the spinner's
 * delay, so a spinner would have had time to appear if one were drawn.
 */
const SLOW_ANSWER_MS = BUSY_INDICATOR_DELAY_MS + 300;

/** Hold back every request `route` catches by `SLOW_ANSWER_MS`, then send it on. */
async function sendSlowly(route: Route): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, SLOW_ANSWER_MS));
	await route.continue();
}

/** Give the committee two more seats, so five rows can be pressed. */
async function addTwoSeats(room: ChairedCommittee): Promise<void> {
	const admin = createServiceRoleClient();
	const { error } = await admin.from('seats').insert([
		{ committee_id: room.committeeId, name: 'Kenya', country_code: 'KE', position: 4 },
		{ committee_id: room.committeeId, name: 'Mexico', country_code: 'MX', position: 5 }
	]);

	if (error) throw new Error(`Could not add the seats: ${error.message}`);
}

/**
 * Sign the chair in, start a session and a roll call, and open the roll call
 * view. Each page is pressed only once its script runs: the presses these
 * tests time and count are the scripted ones, which never reload the page.
 */
async function openRollCall(page: Page, testInfo: TestInfo, room: ChairedCommittee): Promise<void> {
	await signIn(page, room.chair);
	await openRoom(page, room.roomPath);
	await waitForChairScript(page, testInfo);
	await startSession(page);
	await page.goto(`${room.roomPath}/roll-call`);
	await waitForChairScript(page, testInfo);
	await page.getByRole('button', { name: 'Start a new roll call' }).click();
	// The new roll call's own address names it, once the server has made it.
	await expect(page).toHaveURL(/rollCall=/, { timeout: DATABASE_TIMEOUT_MS });
	await expect(page.getByRole('form', { name: 'Attendance of Japan' })).toBeVisible();
	await waitUntilAnswered(page);
}

/** A seat's answer button. */
function answerButton(page: Page, seatName: string, answer: string) {
	return page
		.getByRole('form', { name: `Attendance of ${seatName}` })
		.getByRole('button', { name: answer, exact: true });
}

/** Each seat's mark in the committee's latest roll call, keyed by seat name. */
async function readLatestMarks(committeeId: string): Promise<Record<string, string>> {
	const admin = createServiceRoleClient();
	const { data, error } = await admin
		.from('roll_calls')
		.select('taken_at, committee_sessions!inner(committee_id), roll_call_entries(status, seat_id)')
		.eq('committee_sessions.committee_id', committeeId)
		.order('taken_at', { ascending: false })
		.limit(1)
		.single();

	if (error || !data) throw new Error(`Could not read the roll call: ${error?.message}`);

	const { data: seats, error: seatsError } = await admin
		.from('seats')
		.select('id, name')
		.eq('committee_id', committeeId);

	if (seatsError || !seats) throw new Error(`Could not read the seats: ${seatsError?.message}`);

	const marks: Record<string, string> = {};
	for (const entry of data.roll_call_entries) {
		const seatName = seats.find((seat) => seat.id === entry.seat_id)?.name ?? '?';
		marks[seatName] = entry.status;
	}

	return marks;
}

/**
 * Record whether a spinner (`.animate-spin`) ever appears on the page from now
 * on. Playwright's own checks only look now and then; this sees every change.
 */
async function watchForSpinners(page: Page): Promise<void> {
	await page.evaluate(() => {
		const record = window as Window & { spinnerSeen?: boolean };
		record.spinnerSeen = document.querySelector('.animate-spin') !== null;
		new MutationObserver(() => {
			if (document.querySelector('.animate-spin')) record.spinnerSeen = true;
		}).observe(document.body, { subtree: true, childList: true, attributes: true });
	});
}

/** Whether `watchForSpinners` saw a spinner. */
async function sawSpinner(page: Page): Promise<boolean | undefined> {
	return page.evaluate(() => (window as Window & { spinnerSeen?: boolean }).spinnerSeen);
}

/**
 * Press each `[seat, answer]` button in the page itself, one straight after the
 * other, which is quicker than any person and well within 100 ms.
 */
async function pressQuickly(page: Page, presses: [string, string][]): Promise<void> {
	await page.evaluate((pairs) => {
		for (const [seatName, answer] of pairs) {
			const form = document.querySelector(`form[aria-label="Attendance of ${seatName}"]`);
			const buttons = Array.from(form?.querySelectorAll('button') ?? []);
			buttons.find((button) => button.textContent?.trim() === answer)?.click();
		}
	}, presses);
}

test('five rows pressed together all show at once, with no spinner, and are all saved', async ({
	page
}, testInfo) => {
	skipWithoutJavaScript(testInfo);
	const room = await makeChairedCommittee('Instant Five MUN');
	await addTwoSeats(room);
	await openRollCall(page, testInfo, room);
	await page.route((url) => url.search === '?/setStatus', sendSlowly);
	await watchForSpinners(page);

	const seatNames = ['France', 'Ghana', 'Japan', 'Kenya', 'Mexico'];
	await pressQuickly(
		page,
		seatNames.map((seatName) => [seatName, 'Present'])
	);

	for (const seatName of seatNames) {
		await expect(answerButton(page, seatName, 'Present')).toHaveAttribute('aria-pressed', 'true', {
			timeout: AT_ONCE_TIMEOUT_MS
		});
	}
	// The top bar's chip counts them at once too.
	await expect(
		page.getByRole('banner').getByRole('link', { name: '5/5 present · quorum met' })
	).toBeVisible({ timeout: AT_ONCE_TIMEOUT_MS });

	await waitUntilAnswered(page);
	expect(await sawSpinner(page)).toBe(false);
	expect(await readLatestMarks(room.committeeId)).toEqual({
		France: 'present',
		Ghana: 'present',
		Japan: 'present',
		Kenya: 'present',
		Mexico: 'present'
	});
	for (const seatName of seatNames) {
		await expect(answerButton(page, seatName, 'Present')).toHaveAttribute('aria-pressed', 'true');
	}
});

test('Present then Absent pressed quickly on one row ends as Absent', async ({
	page
}, testInfo) => {
	skipWithoutJavaScript(testInfo);
	const room = await makeChairedCommittee('Instant Correction MUN');
	await openRollCall(page, testInfo, room);
	await page.route((url) => url.search === '?/setStatus', sendSlowly);

	await pressQuickly(page, [
		['France', 'Present'],
		['France', 'Absent']
	]);

	await expect(answerButton(page, 'France', 'Absent')).toHaveAttribute('aria-pressed', 'true', {
		timeout: AT_ONCE_TIMEOUT_MS
	});
	await waitUntilAnswered(page);

	await expect(answerButton(page, 'France', 'Absent')).toHaveAttribute('aria-pressed', 'true');
	expect((await readLatestMarks(room.committeeId)).France).toBe('absent');
});

for (const failure of ['answers 500', 'never arrives'] as const) {
	test(`a press whose request ${failure} goes back and names the seat`, async ({
		page
	}, testInfo) => {
		skipWithoutJavaScript(testInfo);
		const room = await makeChairedCommittee('Instant Failure MUN');
		await openRollCall(page, testInfo, room);
		await page.route(
			(url) => url.search === '?/setStatus',
			(route) =>
				failure === 'answers 500'
					? route.fulfill({ status: 500, body: 'Internal Server Error' })
					: route.abort()
		);

		await answerButton(page, 'France', 'Present').click();

		await expect(page.getByRole('alert')).toContainText('France was not marked present.', {
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(answerButton(page, 'France', 'Absent')).toHaveAttribute('aria-pressed', 'true');
		await waitUntilAnswered(page);
		expect((await readLatestMarks(room.committeeId)).France).toBe('absent');
		// The page itself is still the roll call, not an error page.
		await expect(
			page.getByRole('heading', { name: 'Roll call · Session 1', level: 2 })
		).toBeVisible();
	});
}

test('a slow form the browser cannot predict shows its spinner only after the delay', async ({
	page
}, testInfo) => {
	skipWithoutJavaScript(testInfo);
	// "Start Session 1" makes the session's General Speakers' List, whose id the
	// browser cannot know, so it is the room's one press that waits for the server.
	const room = await makeChairedCommittee('Delayed Spinner MUN');
	await signIn(page, room.chair);
	await openRoom(page, room.roomPath);
	// Pressed before the script runs, "Start Session 1" would be a plain form
	// post that loads the answer as a new page, with no spinner to time.
	await waitForChairScript(page, testInfo);
	await page.route(
		(url) => url.searchParams.has('/startSession'),
		async (route) => {
			await new Promise((resolve) => setTimeout(resolve, BUSY_INDICATOR_DELAY_MS * 3));
			await route.continue();
		}
	);
	// The moment of the press and the moment the first spinner appears, in the
	// page's own clock, so the gap between them can be measured exactly.
	await page.evaluate(() => {
		const record = window as Window & { pressedAt?: number; spinnerAt?: number };
		document.addEventListener('click', () => (record.pressedAt ??= performance.now()), true);
		new MutationObserver(() => {
			if (document.querySelector('.animate-spin')) record.spinnerAt ??= performance.now();
		}).observe(document.body, { subtree: true, childList: true, attributes: true });
	});

	const startButton = page.getByRole('button', { name: 'Start Session 1' });
	await startButton.click();

	await expect(startButton).toHaveAttribute('aria-busy', 'true');
	await expect(startButton.locator('.animate-spin')).toBeVisible();
	const gap = await page.evaluate(() => {
		const record = window as Window & { pressedAt?: number; spinnerAt?: number };
		return (record.spinnerAt ?? 0) - (record.pressedAt ?? 0);
	});
	// A little slack for the moment between the click and the form being sent.
	expect(gap).toBeGreaterThanOrEqual(BUSY_INDICATOR_DELAY_MS - 50);

	await expect(page.getByRole('heading', { name: 'Before debate' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
});

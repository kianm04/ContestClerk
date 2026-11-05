import { expect, test, type Page, type Route } from '@playwright/test';
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
import { addBox, gslPath } from './gsl-fixtures';
import { skipWithoutJavaScript } from './in-place';
import { signIn } from './signed-in-user';

// T141: every button of the committee room shows its result the moment it is
// pressed, with no spinner, and a press the server refuses goes back with a
// message naming what failed. T140's `roll-call-instant.spec.ts` checks the
// same for roll call's answers; `chair-room-in-place.spec.ts` checks the room
// answers without reloading and still works without JavaScript. The floor's
// and the queue's buttons are the GSL view's (S4), which `chair` draws in
// formal debate and `chair/gsl` always; these tests press them on `chair/gsl`.

/** How soon after the press its result must be on screen, measured in the page. */
const AT_ONCE_MS = 100;

/**
 * How long each answer is held back, so anything on screen before then was
 * drawn from the press alone, and a spinner would have had time to appear.
 */
const HELD_BACK_MS = 2_000;

/** How long a change may take to reach another screen through realtime. */
const REALTIME_TIMEOUT_MS = 5_000;

/** Hold back every request `route` catches by `HELD_BACK_MS`, then send it on. */
async function sendLate(route: Route): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, HELD_BACK_MS));
	await route.continue();
}

/** Answer every request `route` catches as a server error. */
async function failWithServerError(route: Route): Promise<void> {
	await route.fulfill({ status: 500, body: 'Internal Server Error' });
}

/** What the page records about the next press, in its own clock. */
type PressRecord = { pressedAt?: number; shownAt?: number; spinnerSeen?: boolean };

/**
 * From now on, record the moment of the next click, the moment an element
 * matching `selector` first holds `text` after it, and whether a spinner
 * (`.animate-spin`) ever appears. Playwright's own checks only look now and
 * then; the page sees every change as it happens.
 */
async function watchNextPress(page: Page, selector: string, text: string): Promise<void> {
	await page.evaluate(
		([watchedSelector, watchedText]) => {
			const record = window as Window & PressRecord;
			record.pressedAt = undefined;
			record.shownAt = undefined;
			record.spinnerSeen = false;
			document.addEventListener('click', () => (record.pressedAt ??= performance.now()), true);

			function check() {
				if (document.querySelector('.animate-spin')) record.spinnerSeen = true;
				if (record.pressedAt === undefined || record.shownAt !== undefined) return;

				const elements = Array.from(document.querySelectorAll(watchedSelector));
				if (elements.some((element) => element.textContent?.includes(watchedText))) {
					record.shownAt = performance.now();
				}
			}

			new MutationObserver(check).observe(document.body, {
				subtree: true,
				childList: true,
				attributes: true,
				characterData: true
			});
		},
		[selector, text]
	);
}

/** Milliseconds from the press to its result, once the result has shown. */
async function readShownAfterMs(page: Page): Promise<number> {
	await expect
		.poll(() => page.evaluate(() => (window as Window & PressRecord).shownAt), {
			timeout: HELD_BACK_MS
		})
		.toBeDefined();

	return page.evaluate(() => {
		const record = window as Window & PressRecord;
		return (record.shownAt ?? 0) - (record.pressedAt ?? 0);
	});
}

/** Whether `watchNextPress` saw a spinner. */
async function sawSpinner(page: Page): Promise<boolean | undefined> {
	return page.evaluate(() => (window as Window & PressRecord).spinnerSeen);
}

/** Put `seatName` on the room's active list, waiting, as another screen would. */
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

	if (error) throw new Error(`Could not add the speaker: ${error.message}`);
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

/** Sign the chair in, start a session and take a roll call with Japan absent. */
async function openRoomWithSession(page: Page, room: ChairedCommittee): Promise<void> {
	await signIn(page, room.chair);
	await openRoom(page, room.roomPath);
	await startSession(page);
	await takeRollCall(room, 'Japan');
}

/** Open the GSL view and wait for its floor. */
async function openGsl(page: Page, room: ChairedCommittee): Promise<void> {
	await page.goto(gslPath(room));
	await expect(page.locator(FLOOR)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
}

/** Type into the queue column's add box until Ghana is the one option offered. */
async function findGhana(page: Page): Promise<void> {
	await addBox(page).click();
	await addBox(page).fill('gha');
	await expect(page.getByRole('option', { name: /Ghana/ })).toBeVisible();
}

/** Choose Ghana in the add box's list with a click, as a chair with a mouse does. */
async function pressAddGhana(page: Page): Promise<void> {
	await page.getByRole('option', { name: /Ghana/ }).click();
}

/** The GSL view's floor: who has it, the clock and the controls. */
const FLOOR = 'section[aria-labelledby="gsl-floor-title"]';

/** The waiting rows of the queue column; only Ghana is ever added in these tests. */
const WAITING_ROW = 'ol[aria-label="Waiting to speak"] > li';

// Over an empty floor "Next" is "Call Ghana", named after the seat it calls
// (T167). It posts the same `?/nextSpeaker`.
test('"Call Ghana" gives Ghana the floor at once, with no spinner', async ({ page }, testInfo) => {
	skipWithoutJavaScript(testInfo);
	const room = await makeChairedCommittee('Instant Next MUN');
	await openRoomWithSession(page, room);
	await addWaitingSpeaker(room.committeeId, 'Ghana');
	await openGsl(page, room);
	await expect(page.locator(FLOOR)).toContainText('Nobody has the floor');
	await page.route((url) => url.search === '?/nextSpeaker', sendLate);
	// The floor already names Ghana on its button, so what it waits for is
	// Ghana's ready clock, whose button reads "Start" (S4).
	await watchNextPress(page, FLOOR, 'Start');

	await page.getByRole('button', { name: 'Call Ghana' }).click();

	expect(await readShownAfterMs(page)).toBeLessThan(AT_ONCE_MS);
	await waitUntilAnswered(page);
	expect(await sawSpinner(page)).toBe(false);
	await expect(page.locator(FLOOR)).toContainText('Ghana');
	await expect(page.locator(FLOOR).getByRole('timer')).toHaveText('1:30');
	expect((await readCommitteeState(room.committeeId)).current_speaker_entry_id).not.toBeNull();
});

test('a refused "Call Ghana" goes back and names the action', async ({ page }, testInfo) => {
	skipWithoutJavaScript(testInfo);
	const room = await makeChairedCommittee('Instant Next Refused MUN');
	await openRoomWithSession(page, room);
	await addWaitingSpeaker(room.committeeId, 'Ghana');
	await openGsl(page, room);
	await page.route((url) => url.search === '?/nextSpeaker', failWithServerError);

	await page.getByRole('button', { name: 'Call Ghana' }).click();

	await expect(page.getByRole('alert')).toContainText('The next speaker was not called.', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page.locator(FLOOR)).toContainText('Nobody has the floor');
	await expect(page.getByRole('button', { name: 'Call Ghana' })).toBeVisible();
	expect((await readCommitteeState(room.committeeId)).current_speaker_entry_id).toBeNull();
});

test('adding a speaker shows their row at once, with no spinner, and once only', async ({
	page
}, testInfo) => {
	skipWithoutJavaScript(testInfo);
	const room = await makeChairedCommittee('Instant Add MUN');
	await openRoomWithSession(page, room);
	await openGsl(page, room);
	await page.route((url) => url.search === '?/add', sendLate);
	// The watch starts after the typing, so the press it times is the choice itself.
	await findGhana(page);
	await watchNextPress(page, WAITING_ROW, 'Ghana');

	await pressAddGhana(page);

	expect(await readShownAfterMs(page)).toBeLessThan(AT_ONCE_MS);
	await waitUntilAnswered(page);
	expect(await sawSpinner(page)).toBe(false);
	// The saved row is the row drawn at the press, so it is still there once.
	await expect(page.locator(WAITING_ROW)).toHaveCount(1);
	expect(await readListLength(room.committeeId)).toBe(1);
});

test('a refused speaker goes back off the list and the action is named', async ({
	page
}, testInfo) => {
	skipWithoutJavaScript(testInfo);
	const room = await makeChairedCommittee('Instant Add Refused MUN');
	await openRoomWithSession(page, room);
	await openGsl(page, room);
	await page.route((url) => url.search === '?/add', failWithServerError);
	await findGhana(page);

	await pressAddGhana(page);

	await expect(page.getByRole('alert')).toContainText('The speaker was not added.', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page.locator(WAITING_ROW)).toHaveCount(0);
	expect(await readListLength(room.committeeId)).toBe(0);
});

/**
 * The Motions view's "Next to vote", where a motion on the floor is decided,
 * and "Decided this session" (S6).
 */
const FLOOR_SECTION = 'section[aria-labelledby="next-motion-heading"]';
const DECIDED_SECTION = 'section[aria-labelledby="decided-motions-heading"]';

/** What "Next to vote" says while nothing is on the floor. */
const EMPTY_FLOOR = 'No motions on the floor';

/**
 * Open the Motions view and wait for its script: until then "Raised by" is
 * the server's `<select>`, and a kind chosen early goes back to Mod.
 */
async function openMotions(page: Page, room: ChairedCommittee): Promise<void> {
	await page.goto(`${room.roomPath}/motions`);
	await expect(page.locator(FLOOR_SECTION)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await waitForConsoleScript(page);
}

/**
 * Fill in "Record a motion" for a motion to suspend the meeting, raised by
 * France: the "Suspend" segment, then France typed into "Raised by" and chosen
 * with Enter.
 */
async function fillSuspendMotion(page: Page): Promise<void> {
	const form = page.getByRole('form', { name: 'Record a motion' });
	const suspend = page.getByRole('radio', { name: 'Suspend', exact: true });
	const raisedBy = form.getByRole('combobox', { name: 'Raised by' });

	await form.locator('label').filter({ has: suspend }).click();
	await raisedBy.fill('France');
	await raisedBy.press('Enter');
}

/** Press "Add to floor". */
async function addToFloor(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Add to floor' }).click();
}

/** Count two hands for, a majority of the two present, and none against, then press "Pass". */
async function voteOnFloorMotion(page: Page): Promise<void> {
	const floor = page.locator(FLOOR_SECTION);

	await floor.getByLabel('For', { exact: true }).fill('2');
	await floor.getByLabel('Against', { exact: true }).fill('0');
	await floor.getByRole('button', { name: 'Pass', exact: true }).click();
}

test('raising a motion puts it on the floor at once, with no spinner', async ({
	page
}, testInfo) => {
	skipWithoutJavaScript(testInfo);
	const room = await makeChairedCommittee('Instant Motion MUN');
	await openRoomWithSession(page, room);
	await openMotions(page, room);
	await fillSuspendMotion(page);
	await page.route((url) => url.search === '?/propose', sendLate);
	await watchNextPress(page, FLOOR_SECTION, 'Suspend the meeting');

	await addToFloor(page);

	expect(await readShownAfterMs(page)).toBeLessThan(AT_ONCE_MS);
	await waitUntilAnswered(page);
	expect(await sawSpinner(page)).toBe(false);
	// The saved motion is the one drawn at the press, so it is still the only one.
	await expect(page.locator(FLOOR_SECTION)).toContainText('Suspend the meeting');
	await expect(page.getByRole('region', { name: 'Further motions' })).toContainText('None');
});

test('a refused motion leaves the floor and the action is named', async ({ page }, testInfo) => {
	skipWithoutJavaScript(testInfo);
	const room = await makeChairedCommittee('Instant Motion Refused MUN');
	await openRoomWithSession(page, room);
	await openMotions(page, room);
	await fillSuspendMotion(page);
	await page.route((url) => url.search === '?/propose', failWithServerError);

	await addToFloor(page);

	await expect(page.getByRole('alert')).toContainText('The motion was not recorded.', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page.locator(FLOOR_SECTION)).toContainText(EMPTY_FLOOR);
});

test('recording a motion’s vote decides it at once, with no spinner', async ({
	page
}, testInfo) => {
	skipWithoutJavaScript(testInfo);
	const room = await makeChairedCommittee('Instant Motion Vote MUN');
	await openRoomWithSession(page, room);
	await openMotions(page, room);
	await fillSuspendMotion(page);
	await addToFloor(page);
	await expect(page.locator(FLOOR_SECTION)).toContainText('Suspend the meeting');
	await waitUntilAnswered(page);
	await page.route((url) => url.search === '?/vote', sendLate);
	await watchNextPress(page, DECIDED_SECTION, 'Suspend the meeting');

	await voteOnFloorMotion(page);

	expect(await readShownAfterMs(page)).toBeLessThan(AT_ONCE_MS);
	await waitUntilAnswered(page);
	expect(await sawSpinner(page)).toBe(false);
	expect((await readCommitteeState(room.committeeId)).mode).toBe('suspended');
});

test('a refused vote puts the motion back on the floor and names the action', async ({
	page
}, testInfo) => {
	skipWithoutJavaScript(testInfo);
	const room = await makeChairedCommittee('Instant Motion Vote Refused MUN');
	await openRoomWithSession(page, room);
	await openMotions(page, room);
	await fillSuspendMotion(page);
	await addToFloor(page);
	await expect(page.locator(FLOOR_SECTION)).toContainText('Suspend the meeting');
	await waitUntilAnswered(page);
	await page.route((url) => url.search === '?/vote', failWithServerError);

	await voteOnFloorMotion(page);

	await expect(page.getByRole('alert')).toContainText('The motion was not decided.', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page.locator(FLOOR_SECTION)).toContainText('Suspend the meeting');
	expect((await readCommitteeState(room.committeeId)).mode).not.toBe('suspended');
});

test('a second chair’s screen shows the first chair’s speaker once', async ({
	browser
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'Realtime needs JavaScript and one project.');
	const room = await makeChairedCommittee('Instant Two Screens MUN');
	const firstContext = await browser.newContext();
	const secondContext = await browser.newContext();
	const firstPage = await firstContext.newPage();
	const secondPage = await secondContext.newPage();

	await openRoomWithSession(firstPage, room);
	await signIn(secondPage, room.chair);
	await openGsl(firstPage, room);
	await openGsl(secondPage, room);
	// The dot says "Connected" once the channel is subscribed; before that a
	// change could slip past unheard.
	await expect(secondPage.getByText('Connected', { exact: true })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	// The most rows for Ghana the second screen ever draws, counted on every change.
	await secondPage.evaluate((row) => {
		const record = window as Window & { mostRows?: number };
		record.mostRows = 0;
		new MutationObserver(() => {
			const rows = document.querySelectorAll(row).length;
			record.mostRows = Math.max(record.mostRows ?? 0, rows);
		}).observe(document.body, { subtree: true, childList: true });
	}, WAITING_ROW);

	await findGhana(firstPage);
	await pressAddGhana(firstPage);

	await expect(secondPage.locator(WAITING_ROW)).toHaveCount(1, { timeout: REALTIME_TIMEOUT_MS });
	await waitUntilAnswered(firstPage);
	// Give any second echo time to arrive, then check it drew nothing twice.
	await secondPage.waitForTimeout(REALTIME_TIMEOUT_MS / 2);
	await expect(secondPage.locator(WAITING_ROW)).toHaveCount(1);
	await expect(firstPage.locator(WAITING_ROW)).toHaveCount(1);
	const mostRows = await secondPage.evaluate(
		() => (window as Window & { mostRows?: number }).mostRows
	);
	expect(mostRows).toBe(1);

	await firstContext.close();
	await secondContext.close();
});

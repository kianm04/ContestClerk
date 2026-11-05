import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	DATABASE_TIMEOUT_MS,
	readCommitteeState,
	waitUntilAnswered,
	type ChairedCommittee
} from './chair-room-fixtures';

// What the GSL view's browser tests (`chair-gsl.spec.ts`, `speakers-list.spec.ts`,
// `chair-room.spec.ts` and `speaking-queue-drag.spec.ts`) share: starting a
// session and filling its General Speakers' List straight in the database,
// reading the list back, and the few steps a chair takes on the view, written
// once so that each works with and without JavaScript.
//
// The service-role client writes these rows the way the chair's own presses
// would. It arranges the state a test begins in and is never used to show that
// something is allowed, which is what `tests/db/supabase-test-client.ts` warns
// against.

/** The GSL view's own address for a committee made by `makeChairedCommittee`. */
export function gslPath(room: ChairedCommittee): string {
	return `${room.roomPath}/gsl`;
}

/**
 * Start a session in the room as "Start Session 1" would, straight in the
 * database: the session, its General Speakers' List at the committee's
 * default speaking time (90 seconds), and the room in formal debate on it.
 * A test of the GSL view starts here rather than on the lobby, whose own
 * tests are the console frame's.
 */
export async function startSessionDirectly(room: ChairedCommittee): Promise<void> {
	const admin = createServiceRoleClient();

	const { data: session, error: sessionError } = await admin
		.from('committee_sessions')
		.insert({
			committee_id: room.committeeId,
			name: 'Session 1',
			status: 'in_progress',
			started_at: new Date().toISOString()
		})
		.select('id')
		.single();

	if (sessionError || !session) {
		throw new Error(`Could not start the session: ${sessionError?.message}`);
	}

	const { data: committee } = await admin
		.from('committees')
		.select('default_speaking_time_seconds')
		.eq('id', room.committeeId)
		.single();

	const { data: list, error: listError } = await admin
		.from('speakers_lists')
		.insert({
			committee_id: room.committeeId,
			session_id: session.id,
			kind: 'general',
			name: "General Speakers' List",
			speaking_time_seconds: committee?.default_speaking_time_seconds ?? 90
		})
		.select('id')
		.single();

	if (listError || !list) throw new Error(`Could not open the list: ${listError?.message}`);

	const { error: stateError } = await admin
		.from('committee_state')
		.update({
			current_session_id: session.id,
			mode: 'formal_debate',
			active_speakers_list_id: list.id
		})
		.eq('committee_id', room.committeeId);

	if (stateError) throw new Error(`Could not open the room: ${stateError.message}`);
}

/** A seat to add: its country and the two letters of its flag. */
export type SeatSeed = { name: string; countryCode: string };

/** Add seats beyond the fixture's France, Ghana and Japan, after them. */
export async function addSeats(room: ChairedCommittee, seeds: SeatSeed[]): Promise<void> {
	const admin = createServiceRoleClient();
	const rows = seeds.map((seed, index) => ({
		committee_id: room.committeeId,
		name: seed.name,
		country_code: seed.countryCode,
		position: 10 + index
	}));
	const { error } = await admin.from('seats').insert(rows);

	if (error) throw new Error(`Could not add the seats: ${error.message}`);
}

/** Put the seats on the room's active list as waiting, in the order given, after any there. */
export async function seedWaiting(room: ChairedCommittee, seatNames: string[]): Promise<void> {
	const admin = createServiceRoleClient();
	const state = await readCommitteeState(room.committeeId);
	const { data: seats, error: seatsError } = await admin
		.from('seats')
		.select('id, name')
		.eq('committee_id', room.committeeId);

	if (seatsError || !seats || !state.active_speakers_list_id) {
		throw new Error(`Could not find the seats or the list: ${seatsError?.message}`);
	}

	// After every entry already on the list, so the seats wait behind them.
	const lastPosition = Math.max(0, ...(await readEntries(room)).map((entry) => entry.position));
	const entries = seatNames.map((seatName, index) => ({
		speakers_list_id: state.active_speakers_list_id ?? '',
		seat_id: seats.find((seat) => seat.name === seatName)?.id,
		position: lastPosition + 1 + index,
		status: 'waiting' as const
	}));
	const { error } = await admin.from('speakers_list_entries').insert(entries);

	if (error) throw new Error(`Could not add the speakers: ${error.message}`);
}

/** One entry of the room's active list, as the database holds it. */
export type StoredEntry = {
	seat: string;
	status: string;
	position: number;
	spokeSeconds: number | null;
};

/** The room's active list's entries in position order, with their seat names. */
export async function readEntries(room: ChairedCommittee): Promise<StoredEntry[]> {
	const admin = createServiceRoleClient();
	const state = await readCommitteeState(room.committeeId);
	const { data, error } = await admin
		.from('speakers_list_entries')
		.select('status, spoke_seconds, position, seats(name)')
		.eq('speakers_list_id', state.active_speakers_list_id ?? '')
		.order('position')
		.order('created_at')
		// Each of these entries has exactly one seat, which the generated types cannot tell.
		.overrideTypes<
			{ status: string; spoke_seconds: number | null; position: number; seats: { name: string } }[],
			{ merge: false }
		>();

	if (error) throw new Error(`Could not read the entries: ${error.message}`);

	return (data ?? []).map((row) => ({
		seat: row.seats.name,
		status: row.status,
		position: row.position,
		spokeSeconds: row.spoke_seconds
	}));
}

/** The seat names waiting on the room's active list, in their saved order. */
export async function readWaitingOrder(room: ChairedCommittee): Promise<string[]> {
	const entries = await readEntries(room);

	return entries.filter((entry) => entry.status === 'waiting').map((entry) => entry.seat);
}

/** The name of the seat with the floor, or null. */
export async function readSpeakingSeat(room: ChairedCommittee): Promise<string | null> {
	const entries = await readEntries(room);

	return entries.find((entry) => entry.status === 'speaking')?.seat ?? null;
}

/** Open the GSL view (or the live room drawing it) at `path` and wait for its title. */
export async function openGslView(page: Page, path: string): Promise<void> {
	await page.goto(path);
	await expect(page.getByRole('heading', { name: /General Speakers’ List/ })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
}

/** The queue column, the `<aside>` called "Speakers’ list". */
export function queueColumn(page: Page): Locator {
	return page.getByRole('complementary', { name: 'Speakers’ list' });
}

/** The waiting rows of the queue column, top to bottom. */
export function waitingRows(page: Page): Locator {
	return page.getByRole('list', { name: 'Waiting to speak' }).locator(':scope > li');
}

/**
 * The add box: the typing box JavaScript swaps in once the page has come to
 * life. Until then the page shows a `<select>` of the same name, which has the
 * ARIA role `combobox` too, so the locator asks for the `<input>`: anything
 * done to it waits for the page's script instead of typing into the
 * `<select>` and failing.
 */
export function addBox(page: Page): Locator {
	return page.getByRole('combobox', { name: 'Add a delegation' }).and(page.locator('input'));
}

/**
 * Wait until the page has come to life and swapped in the add box, before a
 * test that uses the keys ("/", Space) rather than the box itself.
 */
export async function waitForAddBox(page: Page): Promise<void> {
	await expect(addBox(page)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
}

/**
 * Add a seat from the queue column's add box and wait for its row: with
 * JavaScript by typing into the box and pressing Enter (then Escape twice, to
 * put the list away), without it by choosing it in the `<select>` and
 * pressing "Add".
 */
export async function addThroughBox(
	page: Page,
	testInfo: TestInfo,
	seatName: string
): Promise<void> {
	if (testInfo.project.use.javaScriptEnabled === false) {
		await page.getByLabel('Add a delegation').selectOption({ label: seatName });
		await queueColumn(page).getByRole('button', { name: 'Add', exact: true }).click();
	} else {
		await addBox(page).click();
		await addBox(page).fill(seatName);
		await addBox(page).press('Enter');
	}

	await expect(waitingRows(page).filter({ hasText: seatName })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitUntilAnswered(page);

	if (testInfo.project.use.javaScriptEnabled === false) return;

	// Enter keeps the list open for the next name, over the first rows. Done
	// adding, the chair puts it away: the first Escape closes the list, the
	// second leaves the box.
	await page.keyboard.press('Escape');
	await page.keyboard.press('Escape');
	await expect(addBox(page)).toHaveAttribute('aria-expanded', 'false');
}

/** Open a waiting row's "⋯" menu, a `<details>` that opens without JavaScript. */
export async function openRowMenu(page: Page, seatName: string): Promise<void> {
	await waitingRows(page)
		.locator('summary', { hasText: `Options for ${seatName}` })
		.click();
}

/** Open one of the floor's menus, "Yield" or "More" (the "⋯"). */
export async function openFloorMenu(page: Page, menuName: 'Yield' | 'More'): Promise<void> {
	await page.getByRole('main').locator('summary', { hasText: menuName }).click();
}

/** The speaker's clock, "Time left". */
export function floorClock(page: Page): Locator {
	return page.getByRole('main').getByRole('timer', { name: 'Time left' });
}

/** The floor, the `<section>` named by the GSL's title. */
export function floorRegion(page: Page): Locator {
	return page.getByRole('region', { name: /General Speakers’ List/ });
}

/** The speaker's country, written large on the floor. */
export function floorSpeaker(page: Page, seatName: string): Locator {
	return floorRegion(page).getByText(seatName, { exact: true });
}

/**
 * Press "Call {seat}" over an empty floor and wait until the seat has the
 * floor, its clock ready at the full time and not running, and the server
 * has answered.
 */
export async function callSpeaker(page: Page, seatName: string): Promise<void> {
	await page.getByRole('button', { name: `Call ${seatName}` }).click();
	await expect(floorSpeaker(page, seatName)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(page.getByRole('button', { name: 'Start' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitUntilAnswered(page);
}

/** The room's speaker clock, set straight in the database. */
export type ClockSeed =
	{ runsForSeconds: number } | { endedSecondsAgo: number } | { pausedAtSeconds: number };

/** The two moving timer columns of `committee_state` for `seed`, at the moment `now`. */
function timerColumnsOf(seed: ClockSeed, now: number) {
	if ('pausedAtSeconds' in seed) {
		return { timer_ends_at: null, timer_paused_remaining_seconds: seed.pausedAtSeconds };
	}

	const endsAt =
		'runsForSeconds' in seed ? now + seed.runsForSeconds * 1000 : now - seed.endedSecondsAgo * 1000;

	return { timer_ends_at: new Date(endsAt).toISOString(), timer_paused_remaining_seconds: null };
}

/**
 * Set the speaker's clock of a ninety-second speech: running with some
 * seconds left, run over by some seconds, or paused. A test of the clock's
 * look starts here rather than waiting for real time to pass.
 */
export async function setSpeakerClock(room: ChairedCommittee, seed: ClockSeed): Promise<void> {
	const admin = createServiceRoleClient();
	const { error } = await admin
		.from('committee_state')
		.update({ timer_total_seconds: 90, ...timerColumnsOf(seed, Date.now()) })
		.eq('committee_id', room.committeeId);

	if (error) throw new Error(`Could not set the clock: ${error.message}`);
}

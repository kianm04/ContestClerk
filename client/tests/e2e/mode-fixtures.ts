import { expect, test, type Locator, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	DATABASE_TIMEOUT_MS,
	readCommitteeState,
	waitForConsoleScript,
	type ChairedCommittee
} from './chair-room-fixtures';

// What the browser tests of the Mod, Unmod and Single speaker views
// (`chair-mod.spec.ts`, `chair-unmod.spec.ts`, `chair-single-speaker.spec.ts`)
// share: the views' addresses, a mode put in place straight in the database,
// and the rows read back to check what a press wrote.
//
// The service-role client writes these rows the way the chair's own presses
// would. It arranges the state a test begins in and is never used to show that
// something is allowed, which is what `tests/db/supabase-test-client.ts` warns
// against.

/** A view's own address, such as `…/chair/mod`. */
export function viewPath(room: ChairedCommittee, view: 'mod' | 'unmod' | 'single'): string {
	return `${room.roomPath}/${view}`;
}

/**
 * When the browser runs JavaScript, wait until the page's script has started
 * (`waitForConsoleScript`). Until then the page is the server's HTML: a field
 * typed into is set back to the server's value when the script takes the page
 * over, a seat picker ("Raised by", "Who", "Recognise a delegation") is still
 * the `<select>` drawn on the server, a press posts and reloads, and a key
 * reaches no listener. Without JavaScript there is nothing to wait for.
 */
export async function waitForPageScript(page: Page): Promise<void> {
	if (test.info().project.use.javaScriptEnabled === false) return;

	await waitForConsoleScript(page);
}

/** Open `path` and wait for the page's script (`waitForPageScript`). */
export async function openView(page: Page, path: string): Promise<void> {
	await page.goto(path);
	await waitForPageScript(page);
}

/** The seat ids of the committee, by name. */
export async function seatIdsByName(room: ChairedCommittee): Promise<Record<string, string>> {
	const admin = createServiceRoleClient();
	const { data, error } = await admin
		.from('seats')
		.select('id, name')
		.eq('committee_id', room.committeeId);

	if (error || !data) throw new Error(`Could not read the seats: ${error?.message}`);

	return Object.fromEntries(data.map((seat) => [seat.name, seat.id]));
}

/** What a moderated caucus is put in place with. */
export type CaucusSeed = {
	topic: string;
	totalSeconds: number;
	speakingSeconds: number;
	/** The caucus clock: running with this many seconds left, or paused at them. */
	caucusClock: { runsForSeconds: number } | { pausedAtSeconds: number };
};

/**
 * Run a moderated caucus straight in the database, as "Start caucus" leaves
 * it: a passed motion started without a vote, its own list, the room in
 * `moderated_caucus` with nobody on the floor. Answers the caucus list's id.
 */
export async function startModDirectly(room: ChairedCommittee, seed: CaucusSeed): Promise<string> {
	const admin = createServiceRoleClient();
	const state = await readCommitteeState(room.committeeId);
	const sessionId = state.current_session_id ?? '';
	const { data: motion, error: motionError } = await admin
		.from('motions')
		.insert({
			committee_id: room.committeeId,
			session_id: sessionId,
			kind: 'moderated_caucus',
			status: 'passed',
			topic: seed.topic,
			total_time_seconds: seed.totalSeconds,
			speaking_time_seconds: seed.speakingSeconds,
			started_without_vote: true,
			decided_at: new Date().toISOString()
		})
		.select('id')
		.single();

	if (motionError || !motion)
		throw new Error(`Could not record the caucus: ${motionError?.message}`);

	const { data: list, error: listError } = await admin
		.from('speakers_lists')
		.insert({
			committee_id: room.committeeId,
			session_id: sessionId,
			motion_id: motion.id,
			kind: 'caucus',
			name: seed.topic,
			speaking_time_seconds: seed.speakingSeconds
		})
		.select('id')
		.single();

	if (listError || !list) throw new Error(`Could not open the caucus list: ${listError?.message}`);

	const { error } = await admin
		.from('committee_state')
		.update({
			mode: 'moderated_caucus',
			current_motion_id: motion.id,
			active_speakers_list_id: list.id,
			current_speaker_entry_id: null,
			timer_total_seconds: null,
			timer_ends_at: null,
			timer_paused_remaining_seconds: null,
			caucus_total_seconds: seed.totalSeconds,
			...caucusClockColumnsOf(seed.caucusClock)
		})
		.eq('committee_id', room.committeeId);

	if (error) throw new Error(`Could not start the caucus: ${error.message}`);

	return list.id;
}

/** The two moving caucus clock columns for a seed, from now. */
function caucusClockColumnsOf(clock: CaucusSeed['caucusClock']) {
	if ('pausedAtSeconds' in clock) {
		return { caucus_ends_at: null, caucus_paused_remaining_seconds: clock.pausedAtSeconds };
	}

	const endsAt = new Date(Date.now() + clock.runsForSeconds * 1000).toISOString();

	return { caucus_ends_at: endsAt, caucus_paused_remaining_seconds: null };
}

/** Set the caucus clock straight in the database: running, or paused at some seconds. */
export async function setCaucusClock(
	room: ChairedCommittee,
	clock: CaucusSeed['caucusClock']
): Promise<void> {
	const admin = createServiceRoleClient();
	const { error } = await admin
		.from('committee_state')
		.update(caucusClockColumnsOf(clock))
		.eq('committee_id', room.committeeId);

	if (error) throw new Error(`Could not set the caucus clock: ${error.message}`);
}

/** Open a vote in the running session, as "Open vote" would, so every start waits for it. */
export async function openVoteDirectly(room: ChairedCommittee): Promise<void> {
	const admin = createServiceRoleClient();
	const state = await readCommitteeState(room.committeeId);
	const { data: vote, error } = await admin
		.from('votes')
		.insert({
			committee_id: room.committeeId,
			session_id: state.current_session_id ?? '',
			kind: 'substantive',
			subject: 'Draft Resolution 1.1',
			status: 'open'
		})
		.select('id')
		.single();

	if (error || !vote) throw new Error(`Could not open the vote: ${error?.message}`);

	await admin
		.from('committee_state')
		.update({ mode: 'voting', current_vote_id: vote.id })
		.eq('committee_id', room.committeeId);
}

/** Put a motion on the floor of the running session, still to be voted on. */
export async function proposeMotionDirectly(room: ChairedCommittee): Promise<string> {
	const admin = createServiceRoleClient();
	const state = await readCommitteeState(room.committeeId);
	const { data, error } = await admin
		.from('motions')
		.insert({
			committee_id: room.committeeId,
			session_id: state.current_session_id ?? '',
			kind: 'unmoderated_caucus',
			total_time_seconds: 900
		})
		.select('id')
		.single();

	if (error || !data) throw new Error(`Could not raise the motion: ${error?.message}`);

	return data.id;
}

/** One motion as the database holds it. */
export type StoredMotion = {
	id: string;
	kind: string;
	status: string;
	topic: string | null;
	total_time_seconds: number | null;
	speaking_time_seconds: number | null;
	proposed_by_seat_id: string | null;
	started_without_vote: boolean;
};

/** Every motion of the running session, oldest first. */
export async function readMotions(room: ChairedCommittee): Promise<StoredMotion[]> {
	const admin = createServiceRoleClient();
	const state = await readCommitteeState(room.committeeId);
	const { data, error } = await admin
		.from('motions')
		.select(
			'id, kind, status, topic, total_time_seconds, speaking_time_seconds, proposed_by_seat_id, started_without_vote'
		)
		.eq('session_id', state.current_session_id ?? '')
		.order('created_at', { ascending: true });

	if (error) throw new Error(`Could not read the motions: ${error.message}`);

	return data ?? [];
}

/** The list the room is working through, with its kind, purpose and speaking time. */
export async function readActiveList(room: ChairedCommittee) {
	const admin = createServiceRoleClient();
	const state = await readCommitteeState(room.committeeId);
	const { data, error } = await admin
		.from('speakers_lists')
		.select('id, kind, name, purpose, speaking_time_seconds')
		.eq('id', state.active_speakers_list_id ?? '')
		.single();

	if (error || !data) throw new Error(`Could not read the active list: ${error?.message}`);

	return data;
}

/** The entries of the list `listId` in position order, each with its seat's name or typed name. */
export async function readListEntries(listId: string) {
	const admin = createServiceRoleClient();
	const { data, error } = await admin
		.from('speakers_list_entries')
		.select('status, position, spoke_seconds, speaker_name, seats(name)')
		.eq('speakers_list_id', listId)
		.order('position')
		.order('created_at')
		.overrideTypes<
			{
				status: string;
				position: number;
				spoke_seconds: number | null;
				speaker_name: string | null;
				seats: { name: string } | null;
			}[],
			{ merge: false }
		>();

	if (error) throw new Error(`Could not read the entries: ${error.message}`);

	return (data ?? []).map((row) => ({
		name: row.seats?.name ?? row.speaker_name ?? '',
		status: row.status,
		spokeSeconds: row.spoke_seconds
	}));
}

/** The caucus clock line, the `role="timer"` named "Caucus time left". */
export function caucusTimer(page: Page): Locator {
	return page.getByRole('main').getByRole('timer', { name: 'Caucus time left', exact: true });
}

/**
 * The speaker's clock, "Time left". Named exactly, since a name is otherwise
 * matched as a part, and the caucus line's "Caucus time left" holds it.
 */
export function speakerClock(page: Page): Locator {
	return page.getByRole('main').getByRole('timer', { name: 'Time left', exact: true });
}

/**
 * The line of speeches under a list as the column shows it, "Spoken 1  France
 * 0:40". It is the `<summary>` of a `<details>` that opens to every speech
 * (`gsl.md`, "Spoken"), so the same words are on the page twice, the second
 * time hidden until the line is pressed.
 */
export function spokenLine(column: Locator): Locator {
	return column.locator('summary', { hasText: /^Spoken/ });
}

/** Wait until the chair has landed on the page at `path`. */
export async function expectLandedOn(page: Page, path: string): Promise<void> {
	await expect
		.poll(() => new URL(page.url()).pathname, { timeout: DATABASE_TIMEOUT_MS })
		.toBe(path);
}

/**
 * Post a form to a page's action from inside the page, as a stale page would,
 * and answer the action's reply as text: how a test shows that the server
 * refuses what the page no longer offers.
 */
export async function postFromPage(
	page: Page,
	address: string,
	fields: Record<string, string>
): Promise<string> {
	return page.evaluate(
		async ({ address, fields }) => {
			const body = new FormData();

			for (const [name, value] of Object.entries(fields)) body.set(name, value);

			const answer = await fetch(address, {
				method: 'POST',
				body,
				headers: { 'x-sveltekit-action': 'true' }
			});

			return answer.text();
		},
		{ address, fields }
	);
}

/** The floor, the `<section>` named by the view's title. */
export function modeFloor(page: Page, title: RegExp): Locator {
	return page.getByRole('region', { name: title });
}

/** Wait until the view's running floor is drawn, named by its title. */
export async function expectRunningView(page: Page, title: RegExp): Promise<void> {
	await expect(page.getByRole('heading', { name: title })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
}

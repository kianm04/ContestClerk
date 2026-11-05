/**
 * Reading and writing a session's roll calls for the chair's Roll call page.
 *
 * Files under `$lib/server` only ever run on the server. Every function takes
 * the reader's own Supabase client, so Row Level Security decides what they may
 * read and write: a chair of the committee, or an organiser of its conference.
 * The policies also pin `roll_calls.taken_by` to the chair asking, and refuse a
 * mark for a seat of another committee.
 *
 * The shapes and counts are in `$lib/roll-calls.ts`. The latest roll call's
 * marks, which every chair page's top strip counts, are read by
 * `getChairRoomFrame` in `./committee-room.ts`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AttendanceStatus } from '$lib/committee-room';
import type { RollCallSummary } from '$lib/roll-calls';

/** The code Postgres answers with when an id is not a valid uuid at all. */
const INVALID_ID_CODE = '22P02';

/** One `roll_calls` row with the answers of its entries. */
type RollCallRow = {
	id: string;
	taken_at: string;
	taken_by: string;
	roll_call_entries: { status: AttendanceStatus }[];
};

/**
 * The names of the chairs who took these roll calls, keyed by account id.
 *
 * A second query rather than a join: `taken_by` points at `auth.users`, not
 * at `profiles`, so PostgREST cannot follow it (the same reason
 * `./committee-room.ts` gives for the delegates' names).
 */
async function readChairNames(
	supabase: SupabaseClient,
	userIds: string[]
): Promise<Map<string, string>> {
	if (userIds.length === 0) return new Map();

	const { data, error } = await supabase
		.from('profiles')
		.select('id, full_name')
		.in('id', userIds)
		.overrideTypes<{ id: string; full_name: string | null }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the chairs' names: ${error.message}`);
	}

	const names = new Map<string, string>();

	for (const profile of data ?? []) {
		if (profile.full_name) names.set(profile.id, profile.full_name);
	}

	return names;
}

/** Every roll call of a session, newest first, with who took it and how many were present. */
export async function listRollCalls(
	supabase: SupabaseClient,
	sessionId: string
): Promise<RollCallSummary[]> {
	const { data, error } = await supabase
		.from('roll_calls')
		.select('id, taken_at, taken_by, roll_call_entries(status)')
		.eq('session_id', sessionId)
		.order('taken_at', { ascending: false })
		.overrideTypes<RollCallRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the session's roll calls: ${error.message}`);
	}

	const rows = data ?? [];
	const chairNames = await readChairNames(
		supabase,
		rows.map((row) => row.taken_by)
	);

	return rows.map((row) => {
		// Present and present-and-voting both count, as `countPresent` in
		// `$lib/committee-room.ts` counts them for the top strip.
		const presentEntries = row.roll_call_entries.filter((entry) => entry.status !== 'absent');

		return {
			id: row.id,
			takenAt: row.taken_at,
			takenByName: chairNames.get(row.taken_by) ?? null,
			presentCount: presentEntries.length
		};
	});
}

/** The marks of one roll call, keyed by seat id. */
export async function readRollCallAttendance(
	supabase: SupabaseClient,
	rollCallId: string
): Promise<Record<string, AttendanceStatus>> {
	const { data, error } = await supabase
		.from('roll_call_entries')
		.select('seat_id, status')
		.eq('roll_call_id', rollCallId)
		.overrideTypes<{ seat_id: string; status: AttendanceStatus }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the roll call's marks: ${error.message}`);
	}

	const attendance: Record<string, AttendanceStatus> = {};

	for (const entry of data ?? []) {
		attendance[entry.seat_id] = entry.status;
	}

	return attendance;
}

/**
 * The session a roll call belongs to, or null when there is no roll call with
 * that id the reader may see, or the id is not a uuid at all (a hand-made
 * form). The actions compare it with the current session.
 */
export async function readRollCallSessionId(
	supabase: SupabaseClient,
	rollCallId: string
): Promise<string | null> {
	const { data, error } = await supabase
		.from('roll_calls')
		.select('session_id')
		.eq('id', rollCallId)
		.maybeSingle();

	if (error?.code === INVALID_ID_CODE) return null;

	if (error) {
		throw new Error(`Could not read the roll call: ${error.message}`);
	}

	return data?.session_id ?? null;
}

/**
 * Start a roll call of a session: one `roll_calls` row, and one entry per seat
 * with every seat marked absent. Answers the new roll call's id.
 *
 * `taken_by` and `taken_at` are left to their defaults, the chair asking and
 * now. The two inserts are two requests, so when the entries fail the new roll
 * call is taken away again rather than left behind with nobody in it.
 */
export async function startRollCall(
	supabase: SupabaseClient,
	sessionId: string,
	seatIds: string[]
): Promise<string> {
	const { data, error } = await supabase
		.from('roll_calls')
		.insert({ session_id: sessionId })
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not start the roll call: ${error?.message}`);
	}

	if (seatIds.length === 0) return data.id;

	const entries = seatIds.map((seatId) => ({
		roll_call_id: data.id,
		seat_id: seatId,
		status: 'absent'
	}));
	const { error: entriesError } = await supabase.from('roll_call_entries').insert(entries);

	if (entriesError) {
		await supabase.from('roll_calls').delete().eq('id', data.id);
		throw new Error(`Could not add the seats to the roll call: ${entriesError.message}`);
	}

	return data.id;
}

/**
 * The session's latest roll call, or a new one when it has none yet (T160,
 * R2). This is what a press that names no roll call gets: the Room page's
 * "Mark all present" and each seat's first answer there. Answers its id.
 *
 * The chair's screen sends its presses one at a time (T140), so a second
 * press finds the roll call the first one made. Two screens whose first
 * presses reach the server at the same instant could each make one; that is
 * accepted as rare and visible (`05-pages/chair/roll-call.md`), and the later
 * one simply becomes the current roll call.
 */
export async function getOrCreateRollCall(
	supabase: SupabaseClient,
	sessionId: string,
	seatIds: string[]
): Promise<string> {
	const { data, error } = await supabase
		.from('roll_calls')
		.select('id')
		.eq('session_id', sessionId)
		.order('taken_at', { ascending: false })
		.limit(1)
		.maybeSingle();

	if (error) {
		throw new Error(`Could not read the session's roll call: ${error.message}`);
	}

	if (data) return data.id;

	return startRollCall(supabase, sessionId, seatIds);
}

/**
 * Mark one seat in a roll call.
 *
 * An upsert rather than an update, so a seat made available after the roll
 * call started can still be marked: it has no entry yet, and gets one.
 */
export async function setRollCallStatus(
	supabase: SupabaseClient,
	rollCallId: string,
	seatId: string,
	status: AttendanceStatus
): Promise<void> {
	const { error } = await supabase
		.from('roll_call_entries')
		.upsert({ roll_call_id: rollCallId, seat_id: seatId, status });

	if (error) {
		throw new Error(`Could not mark the seat: ${error.message}`);
	}
}

/**
 * Mark every absent seat of a roll call present. A seat already present and
 * voting stays so, because only the absent entries are changed.
 */
export async function markAllPresent(supabase: SupabaseClient, rollCallId: string): Promise<void> {
	const { error } = await supabase
		.from('roll_call_entries')
		.update({ status: 'present' })
		.eq('roll_call_id', rollCallId)
		.eq('status', 'absent');

	if (error) {
		throw new Error(`Could not mark every seat present: ${error.message}`);
	}
}

/**
 * Reading what the Mod and Unmod views draw besides the chair layout's frame
 * (`specs/05-pages/chair/mod.md` and `unmod.md`, "Data"): the caucus the room
 * runs, with who raised it and whether it was started without a vote, and
 * the list beside it, the caucus's own for Mod and the General Speakers' List
 * ("After the caucus") for Unmod.
 *
 * Files under `$lib/server` only ever run on the server. Both pages that draw
 * each view, its own route and `chair` while its mode is live, call these
 * readers, so the two cannot drift apart.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isSessionRunning, type CommitteeSession, type CommitteeStateView } from '$lib/chair-room';
import type { CaucusMotion, ModViewData, UnmodViewData } from '$lib/caucus-view';
import type { RoomSeat } from '$lib/committee-room';
import { isModeRunning } from '$lib/mode-start';
import { readListWithEntries } from '$lib/server/active-list';
import { readGslList } from '$lib/server/gsl-view';

/** What the readers take from the chair layout's data. */
export type CaucusViewFrame = {
	committeeState: CommitteeStateView;
	currentSession: CommitteeSession | null;
	seats: RoomSeat[];
};

/** One `motions` row of a caucus, with the name of the seat that raised it. */
type CaucusMotionRow = {
	id: string;
	kind: string;
	topic: string | null;
	total_time_seconds: number | null;
	speaking_time_seconds: number | null;
	started_without_vote: boolean;
	proposer: { name: string } | null;
};

/** The motion columns, with the proposing seat followed through `proposed_by_seat_id`. */
const CAUCUS_MOTION_COLUMNS =
	'id, kind, topic, total_time_seconds, speaking_time_seconds, started_without_vote, proposer:seats!motions_proposed_by_seat_id_fkey(name)';

/** A caucus's motion row, in the shape the views draw, or null for a motion of any other kind. */
function toCaucusMotion(row: CaucusMotionRow): CaucusMotion | null {
	if (row.kind !== 'moderated_caucus' && row.kind !== 'unmoderated_caucus') return null;

	return {
		id: row.id,
		kind: row.kind,
		topic: row.topic,
		totalTimeSeconds: row.total_time_seconds,
		speakingTimeSeconds: row.speaking_time_seconds,
		raisedByName: row.proposer?.name ?? null,
		startedWithoutVote: row.started_without_vote
	};
}

/** The caucus motion `motionId` names, or null for none or a motion that is not a caucus. */
export async function readCaucusMotion(
	supabase: SupabaseClient,
	motionId: string | null
): Promise<CaucusMotion | null> {
	if (motionId === null) return null;

	const { data, error } = await supabase
		.from('motions')
		.select(CAUCUS_MOTION_COLUMNS)
		.eq('id', motionId)
		.maybeSingle()
		.overrideTypes<CaucusMotionRow, { merge: false }>();

	if (error) {
		throw new Error(`Could not read the caucus: ${error.message}`);
	}

	return data ? toCaucusMotion(data) : null;
}

/**
 * The Mod view's running caucus: its list with every entry, and its motion.
 * Null while the room runs no moderated caucus (or is not suspended from
 * one), when the view draws its start form instead.
 */
export async function readModView(
	supabase: SupabaseClient,
	frame: CaucusViewFrame
): Promise<ModViewData | null> {
	const state = frame.committeeState;

	if (!isModeRunning(state, 'moderated_caucus')) return null;

	const listId = state.activeSpeakersListId;
	const [list, motion] = await Promise.all([
		listId === null ? null : readListWithEntries(supabase, listId, frame.seats),
		readCaucusMotion(supabase, state.currentMotionId)
	]);

	return { list, motion };
}

/**
 * What the Unmod view draws: the General Speakers' List with every entry,
 * which stays the active list during the caucus and is read whenever a
 * session runs (so the running view can draw it the moment "Start caucus" is
 * pressed), and the caucus's motion while one runs. Null while no session
 * runs.
 */
export async function readUnmodView(
	supabase: SupabaseClient,
	frame: CaucusViewFrame
): Promise<UnmodViewData | null> {
	const state = frame.committeeState;
	const session = frame.currentSession;

	if (session === null || !isSessionRunning(session)) return null;

	const motionId = isModeRunning(state, 'unmoderated_caucus') ? state.currentMotionId : null;
	const [gsl, motion] = await Promise.all([
		readGslList(supabase, session.id, frame.seats),
		readCaucusMotion(supabase, motionId)
	]);

	return { gsl, motion };
}

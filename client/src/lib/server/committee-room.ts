/**
 * Reading the committee room for the chair pages, and writing its one
 * `committee_state` row.
 *
 * Files under `$lib/server` only ever run on the server. Every function takes
 * the reader's own Supabase client, so Row Level Security decides what they may
 * read and write: a chair of this committee, or an organiser of its conference
 * (`has_committee_permission(id, 'run_room')` answers yes for both). Sessions are started and ended in
 * `./committee-sessions.ts`, and the speakers' turns are moved on in
 * `./speakers-lists.ts`; both write the state through `updateCommitteeState`
 * below, or through one of the SQL functions that move the room in one
 * transaction (`supabase/migrations/20261001120500_room_press_functions.sql`).
 *
 * The shapes are in `$lib/chair-room.ts` and the room's rules in
 * `$lib/committee-room.ts`, so this file only fetches and writes.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import {
	type ChairCommittee,
	type ChairMotion,
	type ChairRoomFrame,
	type ChairVote,
	type CommitteeRoom,
	type CommitteeSession,
	type CommitteeStateView,
	type MotionStatus,
	type RoomSpeaker,
	type SessionStatus,
	type SpeakersListSummary,
	type VoteStatus
} from '$lib/chair-room';
import {
	CLEARED_TIMER,
	pausedTimer,
	remainingSeconds,
	spokeSeconds,
	type AttendanceStatus,
	type CommitteeMode,
	type MotionKind,
	type RoomSeat,
	type SpeakerStatus,
	type TimerSetting
} from '$lib/committee-room';

/**
 * The `committee_state` columns every read asks for: the room, its speaker's
 * timer, a moderated caucus's own clock (D4) and the suspension (D6).
 */
const STATE_COLUMNS =
	'current_session_id, mode, current_motion_id, active_speakers_list_id, current_speaker_entry_id, current_vote_id, agenda_topic, timer_total_seconds, timer_ends_at, timer_paused_remaining_seconds, caucus_total_seconds, caucus_ends_at, caucus_paused_remaining_seconds, suspended_at, suspended_until, mode_before_suspension';

/** One `committee_state` row as the database returns it. */
type StateRow = {
	current_session_id: string | null;
	mode: CommitteeMode;
	current_motion_id: string | null;
	active_speakers_list_id: string | null;
	current_speaker_entry_id: string | null;
	current_vote_id: string | null;
	agenda_topic: string | null;
	timer_total_seconds: number | null;
	timer_ends_at: string | null;
	timer_paused_remaining_seconds: number | null;
	caucus_total_seconds: number | null;
	caucus_ends_at: string | null;
	caucus_paused_remaining_seconds: number | null;
	suspended_at: string | null;
	suspended_until: string | null;
	mode_before_suspension: CommitteeMode | null;
};

/**
 * The columns of `committee_state` a chair's action may write: any of them,
 * the caucus clock and the suspension included, taken from the generated
 * types so a column added by a migration is writable here at once.
 */
export type CommitteeStateChanges = Omit<
	Database['public']['Tables']['committee_state']['Update'],
	'committee_id' | 'updated_at'
>;

/** No caucus clock, which is what leaving a moderated caucus writes (S7). */
export const CLEARED_CAUCUS_CLOCK = {
	caucus_total_seconds: null,
	caucus_ends_at: null,
	caucus_paused_remaining_seconds: null
} satisfies CommitteeStateChanges;

/**
 * No suspension. The database only lets these be set while the room is
 * suspended (`committee_state_suspension_matches_mode`, S11), so every write
 * that moves the room to another mode clears them too.
 */
export const CLEARED_SUSPENSION = {
	suspended_at: null,
	suspended_until: null,
	mode_before_suspension: null
} satisfies CommitteeStateChanges;

/**
 * An entry's seat as the database embeds it, or null for an entry that names
 * somebody who holds no seat (a single speaker such as "Secretary-General", S9).
 */
type EmbeddedSeat = { id: string; name: string; country_code: string | null } | null;

/** One `committee_sessions` row. */
type SessionRow = {
	id: string;
	name: string;
	status: SessionStatus;
	started_at: string | null;
	ended_at: string | null;
};

/** One seat, as the room reads it. */
type SeatRow = {
	id: string;
	name: string;
	country_code: string | null;
	user_id: string | null;
};

/** One motion, with the name of the seat that proposed it. */
type MotionRow = {
	id: string;
	kind: MotionKind;
	status: MotionStatus;
	topic: string | null;
	total_time_seconds: number | null;
	speaking_time_seconds: number | null;
	votes_for: number | null;
	votes_against: number | null;
	created_at: string;
	proposer: { name: string } | null;
};

/** The motion columns, with the proposing seat followed through `proposed_by_seat_id`. */
const MOTION_COLUMNS =
	'id, kind, status, topic, total_time_seconds, speaking_time_seconds, votes_for, votes_against, created_at, proposer:seats!motions_proposed_by_seat_id_fkey(name)';

/** How many motions the "Recent motions" list shows. */
const RECENT_MOTION_COUNT = 3;

/** The three timer columns, from a `TimerSetting`. */
export function timerColumns(setting: TimerSetting): CommitteeStateChanges {
	return {
		timer_total_seconds: setting.totalSeconds,
		timer_ends_at: setting.endsAt,
		timer_paused_remaining_seconds: setting.pausedRemainingSeconds
	};
}

/**
 * The committee a chair page is about, found by its conference and its slug,
 * or null when there is none this reader may see.
 */
export async function getChairCommittee(
	supabase: SupabaseClient,
	conferenceId: string,
	committeeSlug: string
): Promise<ChairCommittee | null> {
	const { data, error } = await supabase
		.from('committees')
		.select('id, slug, name, abbreviation, room, default_speaking_time_seconds, topics')
		.eq('conference_id', conferenceId)
		.eq('slug', committeeSlug)
		.maybeSingle()
		.overrideTypes<
			{
				id: string;
				slug: string;
				name: string;
				abbreviation: string | null;
				room: string | null;
				default_speaking_time_seconds: number;
				topics: string[];
			},
			{ merge: false }
		>();

	if (error) {
		throw new Error(`Could not read the committee: ${error.message}`);
	}

	if (!data) return null;

	return {
		id: data.id,
		slug: data.slug,
		name: data.name,
		abbreviation: data.abbreviation,
		room: data.room,
		defaultSpeakingTimeSeconds: data.default_speaking_time_seconds,
		topics: data.topics
	};
}

/**
 * Whether the reader is named as one of this committee's chairs.
 *
 * `has_committee_permission(id, 'run_room')` also answers yes for an organiser of the conference, so
 * it cannot tell the two apart. The page needs to, for its "Viewing as
 * organiser" note.
 */
export async function isNamedChair(
	supabase: SupabaseClient,
	committeeId: string,
	userId: string
): Promise<boolean> {
	const { data, error } = await supabase
		.from('committee_chairs')
		.select('user_id')
		.eq('committee_id', committeeId)
		.eq('user_id', userId)
		.maybeSingle();

	if (error) {
		throw new Error(`Could not read the committee's chairs: ${error.message}`);
	}

	return data !== null;
}

/** The committee's `committee_state` row, which `create_committee_state` always wrote. */
export async function readCommitteeState(
	supabase: SupabaseClient,
	committeeId: string
): Promise<CommitteeStateView> {
	const { data, error } = await supabase
		.from('committee_state')
		.select(STATE_COLUMNS)
		.eq('committee_id', committeeId)
		.single()
		.overrideTypes<StateRow, { merge: false }>();

	if (error || !data) {
		throw new Error(`Could not read the committee's state: ${error?.message}`);
	}

	return {
		currentSessionId: data.current_session_id,
		mode: data.mode,
		currentMotionId: data.current_motion_id,
		activeSpeakersListId: data.active_speakers_list_id,
		currentSpeakerEntryId: data.current_speaker_entry_id,
		currentVoteId: data.current_vote_id,
		agendaTopic: data.agenda_topic,
		timer: {
			totalSeconds: data.timer_total_seconds,
			endsAt: data.timer_ends_at,
			pausedRemainingSeconds: data.timer_paused_remaining_seconds
		},
		// `?? null`: a stand-in row in a test written before D4 and D6 leaves these out.
		caucusClock: {
			totalSeconds: data.caucus_total_seconds ?? null,
			endsAt: data.caucus_ends_at ?? null,
			pausedRemainingSeconds: data.caucus_paused_remaining_seconds ?? null
		},
		suspendedAt: data.suspended_at ?? null,
		suspendedUntil: data.suspended_until ?? null,
		modeBeforeSuspension: data.mode_before_suspension ?? null
	};
}

/** Every session of the committee, newest first. */
async function readSessions(
	supabase: SupabaseClient,
	committeeId: string
): Promise<CommitteeSession[]> {
	const { data, error } = await supabase
		.from('committee_sessions')
		.select('id, name, status, started_at, ended_at')
		.eq('committee_id', committeeId)
		.order('created_at', { ascending: false })
		.overrideTypes<SessionRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the committee's sessions: ${error.message}`);
	}

	return (data ?? []).map((row) => ({
		id: row.id,
		name: row.name,
		status: row.status,
		startedAt: row.started_at,
		endedAt: row.ended_at
	}));
}

/**
 * The names of the people in these seats, keyed by their account id.
 *
 * A second query rather than a join: `seats.user_id` points at `auth.users`,
 * not at `profiles`, so PostgREST cannot follow it (the same reason
 * `$lib/server/seats.ts` gives).
 */
async function readDelegateNames(
	supabase: SupabaseClient,
	seats: SeatRow[]
): Promise<Map<string, string>> {
	const userIds = seats.flatMap((seat) => (seat.user_id === null ? [] : [seat.user_id]));

	if (userIds.length === 0) return new Map();

	const { data, error } = await supabase
		.from('profiles')
		.select('id, full_name')
		.in('id', userIds)
		.overrideTypes<{ id: string; full_name: string | null }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the delegates' names: ${error.message}`);
	}

	const names = new Map<string, string>();

	for (const profile of data ?? []) {
		if (profile.full_name) names.set(profile.id, profile.full_name);
	}

	return names;
}

/** Every seat the committee offers, in display order, with the delegate's name. */
async function readRoomSeats(supabase: SupabaseClient, committeeId: string): Promise<RoomSeat[]> {
	const { data, error } = await supabase
		.from('seats')
		.select('id, name, country_code, user_id')
		.eq('committee_id', committeeId)
		.eq('is_available', true)
		.order('position', { ascending: true })
		.overrideTypes<SeatRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the committee's seats: ${error.message}`);
	}

	const seats = data ?? [];
	const delegateNames = await readDelegateNames(supabase, seats);

	return seats.map((seat) => ({
		id: seat.id,
		name: seat.name,
		countryCode: seat.country_code,
		delegateName: seat.user_id === null ? null : (delegateNames.get(seat.user_id) ?? null)
	}));
}

/** The latest roll call of a session and its marks, or nothing before the first one. */
async function readLatestAttendance(
	supabase: SupabaseClient,
	sessionId: string | null
): Promise<{ rollCallId: string | null; attendance: Record<string, AttendanceStatus> }> {
	if (sessionId === null) return { rollCallId: null, attendance: {} };

	const { data: rollCall, error: rollCallError } = await supabase
		.from('roll_calls')
		.select('id')
		.eq('session_id', sessionId)
		.order('taken_at', { ascending: false })
		.limit(1)
		.maybeSingle();

	if (rollCallError) {
		throw new Error(`Could not read the latest roll call: ${rollCallError.message}`);
	}

	if (!rollCall) return { rollCallId: null, attendance: {} };

	const { data: entries, error: entriesError } = await supabase
		.from('roll_call_entries')
		.select('seat_id, status')
		.eq('roll_call_id', rollCall.id)
		.overrideTypes<{ seat_id: string; status: AttendanceStatus }[], { merge: false }>();

	if (entriesError) {
		throw new Error(`Could not read the roll call's marks: ${entriesError.message}`);
	}

	const attendance: Record<string, AttendanceStatus> = {};

	for (const entry of entries ?? []) {
		attendance[entry.seat_id] = entry.status;
	}

	return { rollCallId: rollCall.id, attendance };
}

/**
 * Everything the chair layout hands to every chair page: the state, the
 * sessions, the seats and the attendance. The state is read first because the
 * attendance belongs to the session it points at.
 */
export async function getChairRoomFrame(
	supabase: SupabaseClient,
	committeeId: string
): Promise<ChairRoomFrame> {
	const [committeeState, sessions, seats] = await Promise.all([
		readCommitteeState(supabase, committeeId),
		readSessions(supabase, committeeId),
		readRoomSeats(supabase, committeeId)
	]);

	const currentSession =
		sessions.find((session) => session.id === committeeState.currentSessionId) ?? null;
	const [{ rollCallId, attendance }, currentMotion] = await Promise.all([
		readLatestAttendance(supabase, currentSession?.id ?? null),
		readMotion(supabase, committeeState.currentMotionId)
	]);

	return {
		committeeState,
		sessions,
		currentSession,
		currentMotion,
		seats,
		attendance,
		latestRollCallId: rollCallId
	};
}

/** A motion row, in the shape the page draws. */
function toChairMotion(row: MotionRow): ChairMotion {
	return {
		id: row.id,
		kind: row.kind,
		status: row.status,
		topic: row.topic,
		totalTimeSeconds: row.total_time_seconds,
		speakingTimeSeconds: row.speaking_time_seconds,
		proposedBySeatName: row.proposer?.name ?? null,
		votesFor: row.votes_for,
		votesAgainst: row.votes_against,
		createdAt: row.created_at
	};
}

/**
 * The seat a speakers list entry is drawn with. `seatsById` is the layout's,
 * which carries each delegate's name; a seat taken off offer since falls back
 * to what the entry itself says about it.
 *
 * An entry may name somebody who holds no seat (a single speaker such as
 * "Secretary-General", S9). Until the pages draw such an entry their own way,
 * the typed name stands in a seat of its own whose id is the entry's, so it
 * matches no real seat: nobody's "You are 2nd", and no seat's notes.
 */
export function entrySeat(
	entryId: string,
	seat: EmbeddedSeat,
	speakerName: string | null,
	seatsById: Map<string, RoomSeat>
): RoomSeat {
	if (seat === null) return { id: entryId, name: speakerName ?? '', countryCode: null };

	return seatsById.get(seat.id) ?? { id: seat.id, name: seat.name, countryCode: seat.country_code };
}

/**
 * The active speakers list and its entries in speaking order, each with its
 * seat. `seats` is the layout's, which already carries each delegate's name.
 * No list is `{ speakersList: null, speakers: [] }`.
 */
export async function getActiveSpeakersList(
	supabase: SupabaseClient,
	committeeState: CommitteeStateView,
	seats: RoomSeat[]
): Promise<{ speakersList: SpeakersListSummary | null; speakers: RoomSpeaker[] }> {
	const listId = committeeState.activeSpeakersListId;

	if (listId === null) return { speakersList: null, speakers: [] };

	const [listResult, entriesResult] = await Promise.all([
		supabase
			.from('speakers_lists')
			.select('id, name, speaking_time_seconds, is_open')
			.eq('id', listId)
			.maybeSingle()
			.overrideTypes<
				{ id: string; name: string; speaking_time_seconds: number; is_open: boolean },
				{ merge: false }
			>(),
		supabase
			.from('speakers_list_entries')
			.select('id, position, status, speaker_name, seat:seats(id, name, country_code)')
			.eq('speakers_list_id', listId)
			.order('position', { ascending: true })
			.overrideTypes<
				{
					id: string;
					position: number;
					status: SpeakerStatus;
					speaker_name: string | null;
					seat: EmbeddedSeat;
				}[],
				{ merge: false }
			>()
	]);

	if (listResult.error || entriesResult.error) {
		const message = listResult.error?.message ?? entriesResult.error?.message;
		throw new Error(`Could not read the speakers list: ${message}`);
	}

	const list = listResult.data;

	if (!list) return { speakersList: null, speakers: [] };

	// The layout already knows who sits in each seat, so the names come from there.
	const seatsById = new Map(seats.map((seat) => [seat.id, seat]));

	const speakers = (entriesResult.data ?? []).map((entry) => ({
		id: entry.id,
		position: entry.position,
		status: entry.status,
		seat: entrySeat(entry.id, entry.seat, entry.speaker_name, seatsById)
	}));

	return {
		speakersList: {
			id: list.id,
			name: list.name,
			speakingTimeSeconds: list.speaking_time_seconds,
			isOpen: list.is_open
		},
		speakers
	};
}

/** One motion by its id, or null. */
async function readMotion(
	supabase: SupabaseClient,
	motionId: string | null
): Promise<ChairMotion | null> {
	if (motionId === null) return null;

	const { data, error } = await supabase
		.from('motions')
		.select(MOTION_COLUMNS)
		.eq('id', motionId)
		.maybeSingle()
		.overrideTypes<MotionRow, { merge: false }>();

	if (error) {
		throw new Error(`Could not read the current motion: ${error.message}`);
	}

	return data ? toChairMotion(data) : null;
}

/** The last few motions of a session, newest first. */
async function readRecentMotions(
	supabase: SupabaseClient,
	sessionId: string | null
): Promise<ChairMotion[]> {
	if (sessionId === null) return [];

	const { data, error } = await supabase
		.from('motions')
		.select(MOTION_COLUMNS)
		.eq('session_id', sessionId)
		.order('created_at', { ascending: false })
		.limit(RECENT_MOTION_COUNT)
		.overrideTypes<MotionRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the session's motions: ${error.message}`);
	}

	return (data ?? []).map(toChairMotion);
}

/** The vote the room is on, or null. */
async function readVote(
	supabase: SupabaseClient,
	voteId: string | null
): Promise<ChairVote | null> {
	if (voteId === null) return null;

	const { data, error } = await supabase
		.from('votes')
		.select('id, subject, status')
		.eq('id', voteId)
		.maybeSingle()
		.overrideTypes<{ id: string; subject: string | null; status: VoteStatus }, { merge: false }>();

	if (error) {
		throw new Error(`Could not read the current vote: ${error.message}`);
	}

	return data;
}

/**
 * What the room page adds to the layout's frame: the active speakers list with
 * its entries, the current vote, and the last three motions of the session.
 * `seats` is the frame's, which already carries each delegate's name.
 */
export async function getCommitteeRoom(
	supabase: SupabaseClient,
	committeeState: CommitteeStateView,
	seats: RoomSeat[]
): Promise<CommitteeRoom> {
	const [list, currentVote, recentMotions] = await Promise.all([
		getActiveSpeakersList(supabase, committeeState, seats),
		readVote(supabase, committeeState.currentVoteId),
		readRecentMotions(supabase, committeeState.currentSessionId)
	]);

	return {
		speakersList: list.speakersList,
		speakers: list.speakers,
		currentVote,
		recentMotions
	};
}

/**
 * What the chair console's frame shows besides the room itself
 * (`05-pages/chair/committee-room.md`, "Data"), read by the chair layout for
 * every chair page.
 */
export type ConsoleFacts = {
	/** How many of the current session's motions are still proposed: "Motions 2" in the mode bar. */
	motionsOnFloorCount: number;
	/** Whether anyone has been called to speak in the current session, on any of its lists. */
	hasAnyoneSpoken: boolean;
	/**
	 * The session's General Speakers' List, which realtime hears as well as the
	 * active list, so a co-chair's addition to it during a caucus shows at once.
	 */
	generalSpeakersListId: string | null;
	/**
	 * The list the live mode works through (the GSL, a moderated caucus's or a
	 * single speaker's), with its entries, for the live strip. No list while
	 * the live mode has none, or no session runs.
	 */
	liveList: { speakersList: SpeakersListSummary | null; speakers: RoomSpeaker[] };
};

/** The live modes whose view works through a speakers list. */
const LIST_MODES: CommitteeMode[] = ['formal_debate', 'moderated_caucus', 'single_speaker'];

/** How many of a session's motions are still on the floor, waiting for a decision. */
async function countMotionsOnFloor(
	supabase: SupabaseClient,
	sessionId: string | null
): Promise<number> {
	if (sessionId === null) return 0;

	const { data, error } = await supabase
		.from('motions')
		.select('id')
		.eq('session_id', sessionId)
		.eq('status', 'proposed')
		.overrideTypes<{ id: string }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not count the motions on the floor: ${error.message}`);
	}

	return (data ?? []).length;
}

/**
 * Whether any entry of any of a session's speakers lists has been called to
 * speak: one that is speaking or has spoken. The room's opening ends with the
 * first one (`roomState` in `$lib/chair-room.ts`). `!inner` makes the list's
 * session a condition on the entries, so one short query answers it.
 */
async function hasSessionHadASpeaker(
	supabase: SupabaseClient,
	sessionId: string | null
): Promise<boolean> {
	if (sessionId === null) return false;

	const { data, error } = await supabase
		.from('speakers_list_entries')
		.select('id, list:speakers_lists!inner(session_id)')
		.eq('list.session_id', sessionId)
		.in('status', ['speaking', 'spoken'])
		.limit(1)
		.overrideTypes<{ id: string }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read whether anyone has spoken: ${error.message}`);
	}

	return (data ?? []).length > 0;
}

/**
 * Everything the console's frame reads besides the layout's room: the
 * motions on the floor, whether anyone has spoken yet, the live list, and the
 * session's General Speakers' List for realtime to hear.
 * `seats` is the layout's, which already carries each delegate's name.
 */
export async function getConsoleFacts(
	supabase: SupabaseClient,
	committeeState: CommitteeStateView,
	seats: RoomSeat[]
): Promise<ConsoleFacts> {
	const sessionId = committeeState.currentSessionId;
	const hasLiveList = LIST_MODES.includes(committeeState.mode);
	const noList = { speakersList: null, speakers: [] };

	const [motionsOnFloorCount, hasAnyoneSpoken, liveList, generalSpeakersListId] = await Promise.all(
		[
			countMotionsOnFloor(supabase, sessionId),
			hasSessionHadASpeaker(supabase, sessionId),
			hasLiveList ? getActiveSpeakersList(supabase, committeeState, seats) : noList,
			sessionId === null ? null : readGeneralSpeakersListId(supabase, sessionId)
		]
	);

	return { motionsOnFloorCount, hasAnyoneSpoken, liveList, generalSpeakersListId };
}

/**
 * Write some columns of the committee's `committee_state` row.
 *
 * Row Level Security answers a refused update with no rows rather than an
 * error, so "nothing changed" is checked for and thrown as well: the page has
 * already made sure the reader chairs this committee, so it means something is
 * wrong on our side.
 */
export async function updateCommitteeState(
	supabase: SupabaseClient,
	committeeId: string,
	changes: CommitteeStateChanges
): Promise<void> {
	const { data, error } = await supabase
		.from('committee_state')
		.update(changes)
		.eq('committee_id', committeeId)
		.select('committee_id');

	if (error) {
		throw new Error(`Could not change the committee's state: ${error.message}`);
	}

	if (!data || data.length === 0) {
		throw new Error('The committee state was not changed.');
	}
}

/**
 * The General Speakers' List of a session: its one list of kind `general`, or
 * null. A list with no motion is no longer always this one, because a single
 * speaker's list has none either (S9). Opening a substantive vote
 * (`./votes.ts`) also puts the room back on it.
 */
export async function readGeneralSpeakersListId(
	supabase: SupabaseClient,
	sessionId: string
): Promise<string | null> {
	const { data, error } = await supabase
		.from('speakers_lists')
		.select('id')
		.eq('session_id', sessionId)
		.eq('kind', 'general')
		.order('created_at', { ascending: true })
		.limit(1)
		.maybeSingle();

	if (error) {
		throw new Error(`Could not find the General Speakers' List: ${error.message}`);
	}

	return data?.id ?? null;
}

/**
 * The sentence one of the room's SQL functions refused with, or null for any
 * other error. The functions raise their refusals with `raise exception`,
 * which Postgres reports under the code `P0001`, and word them the way the
 * pages already do ("That motion is no longer on the floor."), so an action
 * can show one to the chair as it is. A refusal for not chairing the
 * committee is `42501` instead, and is not one of these: the page has already
 * checked that, so meeting it means something is wrong on our side.
 */
export function roomRefusal(error: { code?: string; message: string } | null): string | null {
	if (error === null || error.code !== 'P0001') return null;

	return error.message;
}

/**
 * End the speech in progress, the way "End speech" does: the entry that has
 * the floor becomes `spoken`, with when it ended and how long it lasted
 * (`spokeSeconds`). Every press that moves the room to another mode calls it
 * first, so a speaker is never left `speaking` once the floor has moved on;
 * the caller clears `current_speaker_entry_id` in its own update straight
 * after. Does nothing when nobody has the floor, or when the entry is no
 * longer speaking.
 */
export async function finishSpeechInProgress(
	supabase: SupabaseClient,
	committeeState: Pick<CommitteeStateView, 'currentSpeakerEntryId' | 'timer'>,
	now: Date
): Promise<void> {
	const entryId = committeeState.currentSpeakerEntryId;

	if (entryId === null) return;

	const { data, error } = await supabase
		.from('speakers_list_entries')
		.select('status, list:speakers_lists(speaking_time_seconds)')
		.eq('id', entryId)
		.maybeSingle()
		.overrideTypes<
			{ status: SpeakerStatus; list: { speaking_time_seconds: number } },
			{ merge: false }
		>();

	if (error) {
		throw new Error(`Could not read the speech in progress: ${error.message}`);
	}

	if (!data || data.status !== 'speaking') return;

	const secondsLeft = remainingSeconds(committeeState.timer, now) ?? 0;

	const { error: updateError } = await supabase
		.from('speakers_list_entries')
		.update({
			status: 'spoken',
			finished_at: now.toISOString(),
			spoke_seconds: spokeSeconds(data.list.speaking_time_seconds, secondsLeft)
		})
		.eq('id', entryId)
		.eq('status', 'speaking');

	if (updateError) {
		throw new Error(`Could not end the speech: ${updateError.message}`);
	}
}

/** The columns of `committee_state` suspending and resuming read beyond `CommitteeStateView`. */
type SuspensionRow = {
	mode_before_suspension: CommitteeMode | null;
	caucus_ends_at: string | null;
	caucus_paused_remaining_seconds: number | null;
};

/** The caucus clock and the mode a suspension will put back. */
async function readSuspensionRow(
	supabase: SupabaseClient,
	committeeId: string
): Promise<SuspensionRow> {
	const { data, error } = await supabase
		.from('committee_state')
		.select('mode_before_suspension, caucus_ends_at, caucus_paused_remaining_seconds')
		.eq('committee_id', committeeId)
		.single()
		.overrideTypes<SuspensionRow, { merge: false }>();

	if (error || !data) {
		throw new Error(`Could not read the committee's state: ${error?.message}`);
	}

	return data;
}

/**
 * Suspend the room in one update (data-model.md, "Suspending and resuming"):
 * the mode becomes `suspended` and remembers the one it leaves, and whichever
 * clock is running, the speaker's or the caucus's, is paused at what it has
 * left. The session, the motion, the list, the speaker and the vote are kept,
 * so resuming finds them all. A room already suspended is left as it is.
 * `now` is the moment of the press: the live room's `suspend` sends the one
 * the chair's screen already shows (`pressedAt`, T139).
 */
export async function suspendRoom(
	supabase: SupabaseClient,
	committeeId: string,
	committeeState: CommitteeStateView,
	now: Date
): Promise<void> {
	if (committeeState.mode === 'suspended') return;

	const row = await readSuspensionRow(supabase, committeeId);
	const speakerClock = pausedTimer(committeeState.timer, now) ?? committeeState.timer;
	const caucusClock = {
		endsAt: row.caucus_ends_at,
		pausedRemainingSeconds: row.caucus_paused_remaining_seconds
	};

	await updateCommitteeState(supabase, committeeId, {
		mode: 'suspended',
		mode_before_suspension: committeeState.mode,
		suspended_at: now.toISOString(),
		suspended_until: null,
		...timerColumns(speakerClock),
		caucus_ends_at: null,
		caucus_paused_remaining_seconds: remainingSeconds(caucusClock, now)
	});
}

/**
 * Resume a suspended room in one update: the mode it was suspended from comes
 * back, and the suspension is cleared. Both clocks stay paused, so the chair
 * starts the speaker's clock again when the room is ready. A room suspended
 * before the suspension was remembered was given formal debate by its
 * migration, which is where resuming always went then.
 */
export async function resumeRoom(supabase: SupabaseClient, committeeId: string): Promise<void> {
	const row = await readSuspensionRow(supabase, committeeId);

	await updateCommitteeState(supabase, committeeId, {
		mode: row.mode_before_suspension ?? 'formal_debate',
		...CLEARED_SUSPENSION
	});
}

/**
 * When the suspended room is due back: the suspended screen's 10, 15, 30 or
 * 60 minute buttons and its time field write this one column (D6). The
 * action has already made sure the room is suspended, which the database
 * insists on too (`committee_state_suspension_matches_mode`).
 */
export async function setSuspensionReturn(
	supabase: SupabaseClient,
	committeeId: string,
	suspendedUntil: string
): Promise<void> {
	await updateCommitteeState(supabase, committeeId, { suspended_until: suspendedUntil });
}

/**
 * Why the room is suspended, when a passed suspend motion suspended it: the
 * motion's `topic`, "for lunch", or null for a suspension from the mode bar,
 * or a motion that gave none. The reason is not stored on the room. It is the
 * topic of the session's passed suspend motion decided at the very moment the
 * room was suspended, the one moment `apply_passed_motion` writes into both
 * (`02-architecture/data-model.md`, "Suspending and resuming").
 */
export async function readSuspensionReason(
	supabase: SupabaseClient,
	sessionId: string,
	suspendedAt: string
): Promise<string | null> {
	const { data, error } = await supabase
		.from('motions')
		.select('topic')
		.eq('session_id', sessionId)
		.eq('kind', 'suspend_meeting')
		.eq('status', 'passed')
		.eq('decided_at', suspendedAt)
		.limit(1)
		.maybeSingle()
		.overrideTypes<{ topic: string | null }, { merge: false }>();

	if (error) {
		throw new Error(`Could not read why the room is suspended: ${error.message}`);
	}

	const topic = data?.topic?.trim() ?? '';

	return topic === '' ? null : topic;
}

/**
 * "End caucus" and "Return to GSL": back to formal debate on the session's
 * General Speakers' List. The speech in progress ends with its time recorded,
 * and the caucus's or single speaker's motion, speaker and both clocks are
 * cleared, because they belonged to it.
 */
async function returnToGeneralList(
	supabase: SupabaseClient,
	committeeId: string,
	committeeState: CommitteeStateView,
	now: Date
): Promise<void> {
	await finishSpeechInProgress(supabase, committeeState, now);

	const sessionId = committeeState.currentSessionId;
	const generalListId = sessionId ? await readGeneralSpeakersListId(supabase, sessionId) : null;

	await updateCommitteeState(supabase, committeeId, {
		mode: 'formal_debate',
		current_motion_id: null,
		active_speakers_list_id: generalListId,
		current_speaker_entry_id: null,
		...timerColumns(CLEARED_TIMER),
		...CLEARED_CAUCUS_CLOCK
	});
}

/**
 * Suspend the meeting, or go back to formal debate.
 *
 * Going back to formal debate from a suspension is "Resume session", which
 * puts back the mode that was suspended. From a caucus or a single speaker it
 * is "End caucus" or "Return to GSL", which ends that mode and its speech and
 * puts the General Speakers' List back. From any other mode only the mode
 * changes. The moment written is the server's own, as it always was here.
 */
export async function setRoomMode(
	supabase: SupabaseClient,
	committeeId: string,
	committeeState: CommitteeStateView,
	mode: CommitteeMode
): Promise<void> {
	const now = new Date();

	if (mode === 'suspended') {
		await suspendRoom(supabase, committeeId, committeeState, now);
		return;
	}

	if (committeeState.mode === 'suspended') {
		await resumeRoom(supabase, committeeId);
		return;
	}

	const isLeavingItsOwnList =
		committeeState.currentMotionId !== null || committeeState.mode === 'single_speaker';

	if (mode === 'formal_debate' && isLeavingItsOwnList) {
		await returnToGeneralList(supabase, committeeId, committeeState, now);
		return;
	}

	await updateCommitteeState(supabase, committeeId, { mode });
}

/**
 * Put one of the committee's topics on the floor. The action has already made
 * sure `topic` is one of them, and `check_committee_agenda_topic` in the
 * database refuses anything else. Sessions never touch this column, so the
 * agenda stays until the chair changes it.
 */
export async function setAgendaTopic(
	supabase: SupabaseClient,
	committeeId: string,
	topic: string
): Promise<void> {
	await updateCommitteeState(supabase, committeeId, { agenda_topic: topic });
}

/**
 * Add `topic` to the committee's topics, after the ones it has: a quick
 * session's "Add a topic", whose chair is its organiser too
 * (`chair/quick-session.md`), so Row Level Security lets them change the
 * committee. `topics` is the list the action read; a topic already on it is
 * not added twice.
 */
export async function addCommitteeTopic(
	supabase: SupabaseClient,
	committeeId: string,
	topics: string[],
	topic: string
): Promise<void> {
	if (topics.includes(topic)) return;

	const { error } = await supabase
		.from('committees')
		.update({ topics: [...topics, topic] })
		.eq('id', committeeId);

	if (error) {
		throw new Error(`Could not add the topic: ${error.message}`);
	}
}

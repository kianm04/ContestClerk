/**
 * What the conference dashboard's Rooms table reads on a conference day: every
 * committee, the session each is sitting in, its latest roll call (with who it
 * marked absent) and how many delegates it seats (T173).
 *
 * Files under `$lib/server` only ever run on the server. `$lib/dashboard-rooms.ts`
 * turns what this file returns into the card's sentences.
 *
 * Row Level Security decides what comes back: the conference's team reads every
 * committee's state, sessions and roll calls, which is who reads this page.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SessionStatus } from '$lib/chair-room';
import type { AttendanceStatus, CommitteeMode } from '$lib/committee-room';
import type { AbsentDelegate, DashboardRoom } from '$lib/dashboard-rooms';
import { readFullNames } from '$lib/server/dashboard-people';

/** One committee of the conference, in the organiser's own order. */
type CommitteeRow = {
	id: string;
	slug: string;
	name: string;
	abbreviation: string | null;
};

/** A committee's state and the session it points at, when it points at one. */
type StateRow = {
	committee_id: string;
	mode: CommitteeMode;
	current_session_id: string | null;
	committee_sessions: { name: string; status: SessionStatus } | null;
};

/** A session that has ended, for "last: Session 1 ended 16:58". */
type EndedSessionRow = {
	committee_id: string;
	name: string;
	ended_at: string | null;
};

/** A seat somebody sits in. Only its committee is needed, to count them. */
type SeatedRow = {
	committee_id: string;
};

/** One answer of a roll call, with the seat it was given for. */
type RollCallEntryRow = {
	status: AttendanceStatus;
	/** The seat's name ("Nigeria") and who sits in it, for "Zoe Adams is marked absent". */
	seats: { name: string; user_id: string | null } | null;
};

/** A roll call of a session in progress, with every answer given in it. */
type RollCallRow = {
	session_id: string;
	/** An ISO timestamp, for "since roll call at 11:02". */
	taken_at: string;
	roll_call_entries: RollCallEntryRow[];
};

/** A seat marked absent before its holder's name has been looked up. */
type AbsentSeat = {
	seatName: string;
	userId: string | null;
	markedAt: string;
};

/** The answers that count as being in the room. */
const PRESENT_STATUSES: AttendanceStatus[] = ['present', 'present_and_voting'];

/** Every committee of the conference, in the order the organiser put them. */
async function readCommittees(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<CommitteeRow[]> {
	const { data, error } = await supabase
		.from('committees')
		.select('id, slug, name, abbreviation')
		.eq('conference_id', conferenceId)
		.order('position', { ascending: true })
		.order('id', { ascending: true })
		.overrideTypes<CommitteeRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the committees for the rooms: ${error.message}`);
	}

	return data ?? [];
}

/**
 * The state of every committee of the conference, each with the session it
 * points at. `committees!inner(...)` joins the committee so the filter can be
 * on its conference; `committee_sessions(...)` follows `current_session_id`.
 */
async function readStates(supabase: SupabaseClient, conferenceId: string): Promise<StateRow[]> {
	const { data, error } = await supabase
		.from('committee_state')
		.select(
			'committee_id, mode, current_session_id, committees!inner(conference_id), committee_sessions(name, status)'
		)
		.eq('committees.conference_id', conferenceId)
		.overrideTypes<StateRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the committee rooms: ${error.message}`);
	}

	return data ?? [];
}

/** Every session of the conference that has ended, the latest first. */
async function readEndedSessions(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<EndedSessionRow[]> {
	const { data, error } = await supabase
		.from('committee_sessions')
		.select('committee_id, name, ended_at, committees!inner(conference_id)')
		.eq('committees.conference_id', conferenceId)
		.eq('status', 'ended')
		.order('ended_at', { ascending: false })
		.overrideTypes<EndedSessionRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the ended sessions: ${error.message}`);
	}

	return data ?? [];
}

/** Every seat of the conference with a delegate in it. */
async function readSeatedSeats(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<SeatedRow[]> {
	const { data, error } = await supabase
		.from('seats')
		.select('committee_id, committees!inner(conference_id)')
		.eq('committees.conference_id', conferenceId)
		.not('user_id', 'is', null)
		.overrideTypes<SeatedRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not count the seated delegates: ${error.message}`);
	}

	return data ?? [];
}

/** Every roll call of these sessions, the latest first, with its answers. */
async function readRollCalls(
	supabase: SupabaseClient,
	sessionIds: string[]
): Promise<RollCallRow[]> {
	// An empty list would have to be written as `in.()`, which PostgREST refuses.
	if (sessionIds.length === 0) {
		return [];
	}

	const { data, error } = await supabase
		.from('roll_calls')
		.select('session_id, taken_at, roll_call_entries(status, seats(name, user_id))')
		.in('session_id', sessionIds)
		.order('taken_at', { ascending: false })
		.overrideTypes<RollCallRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the roll calls: ${error.message}`);
	}

	return data ?? [];
}

/** The id of the session a committee is sitting in, or `null` when it is not sitting. */
function sittingSessionId(state: StateRow | undefined): string | null {
	if (state === undefined || state.committee_sessions?.status !== 'in_progress') {
		return null;
	}

	return state.current_session_id;
}

/** The session a committee is sitting in, as the Rooms card names it. */
function sittingSession(state: StateRow | undefined): DashboardRoom['session'] {
	if (
		state === undefined ||
		sittingSessionId(state) === null ||
		state.committee_sessions === null
	) {
		return null;
	}

	return { name: state.committee_sessions.name, mode: state.mode };
}

/**
 * The latest roll call of each session. The rows come latest first, so the
 * first one met for a session is its latest.
 */
function latestRollCallBySession(rollCalls: RollCallRow[]): Map<string, RollCallRow> {
	const latest = new Map<string, RollCallRow>();

	for (const rollCall of rollCalls) {
		if (!latest.has(rollCall.session_id)) {
			latest.set(rollCall.session_id, rollCall);
		}
	}

	return latest;
}

/** How many seats answered present at this roll call. */
function countPresent(rollCall: RollCallRow): number {
	const present = rollCall.roll_call_entries.filter((entry) =>
		PRESENT_STATUSES.includes(entry.status)
	);

	return present.length;
}

/** The seats this roll call marked absent, in the order the answers came back. */
function absentSeats(rollCall: RollCallRow): AbsentSeat[] {
	const seats: AbsentSeat[] = [];

	for (const entry of rollCall.roll_call_entries) {
		if (entry.status !== 'absent' || entry.seats === null) {
			continue;
		}

		seats.push({
			seatName: entry.seats.name,
			userId: entry.seats.user_id,
			markedAt: rollCall.taken_at
		});
	}

	return seats;
}

/** The absent seats with their holders' names, which `names` has looked up. */
function withNames(seats: AbsentSeat[], names: Map<string, string>): AbsentDelegate[] {
	return seats.map((seat) => ({
		fullName: seat.userId === null ? null : (names.get(seat.userId) ?? null),
		seatName: seat.seatName,
		markedAt: seat.markedAt
	}));
}

/** The latest ended session of each committee. The rows come latest first. */
function lastSessionByCommittee(
	sessions: EndedSessionRow[]
): Map<string, DashboardRoom['lastSession']> {
	const lastSessions = new Map<string, DashboardRoom['lastSession']>();

	for (const session of sessions) {
		if (lastSessions.has(session.committee_id) || session.ended_at === null) {
			continue;
		}

		lastSessions.set(session.committee_id, { name: session.name, endedAt: session.ended_at });
	}

	return lastSessions;
}

/** How many seated delegates each committee has. */
function seatedCountByCommittee(seats: SeatedRow[]): Map<string, number> {
	const counts = new Map<string, number>();

	for (const seat of seats) {
		counts.set(seat.committee_id, (counts.get(seat.committee_id) ?? 0) + 1);
	}

	return counts;
}

/**
 * Every committee room of the conference, in the organiser's order, with its
 * session, its latest roll call and its seated delegates.
 *
 * Three waves: the committees, their states, their ended sessions and their
 * seated seats at once; then the roll calls of the sessions the first wave
 * found in progress; then the names of anybody those roll calls marked absent.
 */
export async function loadDashboardRooms(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<DashboardRoom[]> {
	const [committees, states, endedSessions, seatedSeats] = await Promise.all([
		readCommittees(supabase, conferenceId),
		readStates(supabase, conferenceId),
		readEndedSessions(supabase, conferenceId),
		readSeatedSeats(supabase, conferenceId)
	]);

	const statesByCommittee = new Map(states.map((state) => [state.committee_id, state]));
	const sittingSessionIds: string[] = [];

	for (const state of states) {
		const sessionId = sittingSessionId(state);

		if (sessionId !== null) {
			sittingSessionIds.push(sessionId);
		}
	}

	const rollCalls = await readRollCalls(supabase, sittingSessionIds);
	const latestRollCalls = latestRollCallBySession(rollCalls);
	const absentSeatsBySession = new Map<string, AbsentSeat[]>();
	const absentUserIds: string[] = [];

	for (const [sessionId, rollCall] of latestRollCalls) {
		const seats = absentSeats(rollCall);

		absentSeatsBySession.set(sessionId, seats);

		for (const seat of seats) {
			if (seat.userId !== null) {
				absentUserIds.push(seat.userId);
			}
		}
	}

	const names = await readFullNames(supabase, absentUserIds);
	const lastSessions = lastSessionByCommittee(endedSessions);
	const seatedCounts = seatedCountByCommittee(seatedSeats);

	return committees.map((committee) => {
		const state = statesByCommittee.get(committee.id);
		const sessionId = sittingSessionId(state);
		const latestRollCall = sessionId === null ? undefined : latestRollCalls.get(sessionId);
		const absent = sessionId === null ? [] : (absentSeatsBySession.get(sessionId) ?? []);

		return {
			committeeId: committee.id,
			committeeSlug: committee.slug,
			committeeName: committee.abbreviation ?? committee.name,
			session: sittingSession(state),
			presentCount: latestRollCall === undefined ? null : countPresent(latestRollCall),
			lastSession: lastSessions.get(committee.id) ?? null,
			seatedCount: seatedCounts.get(committee.id) ?? 0,
			absentees: withNames(absent, names)
		};
	});
}

/**
 * Reading the committee room for the people watching it: the delegate live
 * view (`05-pages/delegate/committee-live.md`) and the projector
 * (`05-pages/chair/display.md`). Both pages call `loadWatchedRoom`, so they
 * always read, and show, the same room.
 *
 * Files under `$lib/server` only ever run on the server. Every function takes
 * the reader's own Supabase client, so Row Level Security decides what it may
 * read: a delegate of the committee or somebody on the conference's staff may
 * read every table of the room (`specs/02-architecture/permissions.md`).
 *
 * The chair pages read the same rows through `./committee-room.ts`,
 * `./active-list.ts`, `./motions.ts` and `./votes.ts`, and this file puts those
 * reads together for the two pages that are not a chair's, so every screen in
 * the room sees the same thing.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChairCommittee, ChairRoomFrame, SpeakersListSummary } from '$lib/chair-room';
import { countPresent } from '$lib/committee-room';
import type { Conference } from '$lib/conferences';
import { dayInTimezone } from '$lib/dates';
import type { GslEntry } from '$lib/gsl-floor';
import { floorMotion, type SessionMotion } from '$lib/motions';
import { nextCommitteeEvent } from '$lib/room-ready';
import type { ScheduleEvent } from '$lib/schedule';
import type { OpenVote, VoteChoice } from '$lib/votes';
import { readListWithEntries } from './active-list';
import { getChairRoomFrame, readSuspensionReason } from './committee-room';
import { listMotions } from './motions';
import { readIsQuickSession } from './room-screens';
import { listScheduleEvents } from './schedule';
import { getCurrentVote } from './votes';

/** Everything the live view and the projector draw of the room itself. */
export type LiveRoom = Pick<
	ChairRoomFrame,
	| 'committeeState'
	| 'currentSession'
	| 'sessions'
	| 'seats'
	| 'attendance'
	| 'latestRollCallId'
	| 'currentMotion'
> & {
	/** The list the live mode works through (the GSL, a caucus's or a single speaker's), or null. */
	speakersList: SpeakersListSummary | null;
	/** That list's entries in `position` order, every status included. */
	speakers: GslEntry[];
	/** "Right of reply": the purpose a single speaker's list carries, or null. */
	listPurpose: string | null;
	/** The motion being run, or else the one that goes to the vote first. */
	floorMotion: SessionMotion | null;
	/** The vote the room is on: open, or closed and on show until the chair ends voting. */
	currentVote: OpenVote | null;
	/** The reader's own seat in this committee, or null for staff watching. */
	mySeatId: string | null;
	/** The reader's answer in the current roll call vote, or null. */
	myChoice: VoteChoice | null;
	/** Seats present at the latest roll call of the session, or null before one. */
	presentCount: number | null;
	/** Whether anyone has been called to speak in the current session, on any of its lists. */
	hasAnyoneSpoken: boolean;
	/** "for lunch", from the suspend motion that suspended the room, or null. */
	suspensionReason: string | null;
};

/** The reader's own seat in the committee, or null when they hold none. */
async function readMySeatId(
	supabase: SupabaseClient,
	committeeId: string,
	userId: string
): Promise<string | null> {
	const { data, error } = await supabase
		.from('seats')
		.select('id')
		.eq('committee_id', committeeId)
		.eq('user_id', userId)
		.maybeSingle();

	if (error) {
		throw new Error(`Could not read your seat: ${error.message}`);
	}

	return data?.id ?? null;
}

/**
 * Whether any entry of any of a session's speakers lists has been called to
 * speak: one that is speaking or has spoken. The room's opening ends with the
 * first one. It is the question the chair layout asks (`getConsoleFacts`), so
 * the watchers' opening ends when the chair's does. `!inner` makes the list's
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
 * The whole room as its watchers see it. The state is read first, with the
 * sessions, seats and attendance, because every other read follows one of
 * its pointers.
 */
export async function loadCommitteeRoom(
	supabase: SupabaseClient,
	committeeId: string,
	userId: string
): Promise<LiveRoom> {
	const [frame, mySeatId] = await Promise.all([
		getChairRoomFrame(supabase, committeeId),
		readMySeatId(supabase, committeeId, userId)
	]);

	const { committeeState, currentSession } = frame;
	const sessionId = currentSession?.id ?? null;
	const listId = committeeState.activeSpeakersListId;
	const suspendedAt = committeeState.suspendedAt ?? null;
	const isSuspended = committeeState.mode === 'suspended' && suspendedAt !== null;

	const [list, motions, currentVote, hasAnyoneSpoken, suspensionReason] = await Promise.all([
		listId === null ? null : readListWithEntries(supabase, listId, frame.seats),
		sessionId === null ? [] : listMotions(supabase, sessionId),
		getCurrentVote(supabase, committeeState.currentVoteId),
		hasSessionHadASpeaker(supabase, sessionId),
		isSuspended && sessionId !== null
			? readSuspensionReason(supabase, sessionId, suspendedAt)
			: null
	]);

	const myChoice = currentVote && mySeatId ? (currentVote.entries[mySeatId] ?? null) : null;

	return {
		committeeState,
		currentSession,
		sessions: frame.sessions,
		currentMotion: frame.currentMotion,
		seats: frame.seats,
		attendance: frame.attendance,
		latestRollCallId: frame.latestRollCallId,
		speakersList: list?.speakersList ?? null,
		speakers: list?.speakers ?? [],
		listPurpose: list?.purpose ?? null,
		floorMotion: floorMotion(motions, committeeState.currentMotionId),
		currentVote,
		mySeatId,
		myChoice,
		presentCount: frame.latestRollCallId === null ? null : countPresent(frame.attendance),
		hasAnyoneSpoken,
		suspensionReason
	};
}

/** What the live view and the projector both hand their page. */
export type WatchedRoomPage = LiveRoom & {
	conference: {
		slug: string;
		name: string;
		timezone: string;
		endDate: string;
		/** A quick session (D7) has no conference to name, no schedule and no awards. */
		isQuickSession: boolean;
	};
	committee: ChairCommittee;
	/** The next event on the schedule the committee can see, or null. */
	nextScheduleEvent: ScheduleEvent | null;
	/** The conference's own date in its timezone, `YYYY-MM-DD`. */
	today: string;
	/** The server's time as the answer leaves, from which the browser learns its clock's offset. */
	serverTime: string;
};

/**
 * Everything both watching pages draw: the room, the conference and the
 * committee, and the schedule's next event for the lobby and the ended
 * screen. Row Level Security returns only the schedule events addressed to
 * the reader, and `nextCommitteeEvent` keeps those the committee can see.
 */
export async function loadWatchedRoom(
	supabase: SupabaseClient,
	conference: Conference,
	committee: ChairCommittee,
	userId: string
): Promise<WatchedRoomPage> {
	const [room, events, isQuickSession] = await Promise.all([
		loadCommitteeRoom(supabase, committee.id, userId),
		listScheduleEvents(supabase, conference.id),
		readIsQuickSession(supabase, conference.id)
	]);
	const now = new Date();

	return {
		...room,
		conference: {
			slug: conference.slug,
			name: conference.name,
			timezone: conference.timezone,
			endDate: conference.endDate,
			isQuickSession
		},
		committee,
		nextScheduleEvent: nextCommitteeEvent(events, committee.id, now),
		// Decides whether a session ended today and whether it was the conference's last.
		today: dayInTimezone(now, conference.timezone),
		// Read last, as the answer leaves (`+page.ts` and `$lib/clock-offset.ts`).
		serverTime: new Date().toISOString()
	};
}

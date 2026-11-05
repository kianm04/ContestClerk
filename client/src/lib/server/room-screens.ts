/**
 * What the live room's own screens read besides the chair layout's frame
 * (`05-pages/chair/committee-room.md`, "Data"): whether the committee is a
 * quick session's, and for the lobby and the ended screen how many seats have
 * a delegate, the last session's record and the next event on the schedule.
 *
 * Files under `$lib/server` only ever run on the server. Every function takes
 * the reader's own Supabase client, so Row Level Security decides what they
 * may read.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommitteeSession, CommitteeStateView, RoomSpeaker } from '$lib/chair-room';
import type { RoomSeat } from '$lib/committee-room';
import { latestEndedSession, nextCommitteeEvent, type LobbyFacts } from '$lib/room-ready';
import { getCommitteeRoom, readSuspensionReason } from '$lib/server/committee-room';
import { readSessionRecord } from '$lib/server/committee-sessions';
import { listPaperSeats } from '$lib/server/paper-reviews';
import { listScheduleEvents } from '$lib/server/schedule';

/**
 * Whether the conference is a quick session (D7, `chair/quick-session.md`):
 * one committee run without a conference around it, which has no practice
 * sessions, no awards and no schedule.
 */
export async function readIsQuickSession(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<boolean> {
	const { data, error } = await supabase
		.from('conferences')
		.select('kind')
		.eq('id', conferenceId)
		.maybeSingle()
		.overrideTypes<{ kind: 'conference' | 'quick_session' }, { merge: false }>();

	if (error) {
		throw new Error(`Could not read what kind of conference this is: ${error.message}`);
	}

	return data?.kind === 'quick_session';
}

/** Whom `readLobbyFacts` reads for: the conference, the committee and its sessions, newest first. */
export type LobbyReading = {
	conferenceId: string;
	committeeId: string;
	sessions: CommitteeSession[];
	/** Whether a session is in progress: then only what the ended screen needs at once is read. */
	isSessionRunning: boolean;
	now: Date;
};

/**
 * What the lobby and the ended screen show besides the layout's rows. The
 * next event on the schedule and whether this is a quick session are read in
 * every state, so the ended screen can show them the moment "End session" is
 * pressed; the seats with a delegate and the last session's record only while
 * no session runs, since only those two screens show them.
 */
export async function readLobbyFacts(
	supabase: SupabaseClient,
	reading: LobbyReading
): Promise<LobbyFacts> {
	const lastEnded = latestEndedSession(reading.sessions);
	const readsLobby = !reading.isSessionRunning;

	const [events, isQuickSession, paperSeats, lastSessionRecord] = await Promise.all([
		listScheduleEvents(supabase, reading.conferenceId),
		readIsQuickSession(supabase, reading.conferenceId),
		// `listPaperSeats` returns only the seats that have a delegate.
		readsLobby ? listPaperSeats(supabase, reading.conferenceId, reading.committeeId) : [],
		readsLobby && lastEnded !== null ? readSessionRecord(supabase, lastEnded.id) : null
	]);

	return {
		filledSeatCount: paperSeats.length,
		lastSessionRecord,
		nextScheduleEvent: nextCommitteeEvent(events, reading.committeeId, reading.now),
		isQuickSession
	};
}

/** What the suspended screen reads: what "Resume session" brings back, and why the room stopped. */
export type SuspendedRoom = {
	/** The entries of the list the room was working through, every status included. */
	speakers: RoomSpeaker[];
	/** The subject of the vote the room was on, or null. */
	voteSubject: string | null;
	/** "for lunch", from a passed suspend motion, or null. */
	reason: string | null;
};

/**
 * What the suspended screen needs besides the frame: the active list with
 * its speaker and who waits, the vote the room was on, and the suspend
 * motion's reason (`readSuspensionReason`). `seats` is the layout's, which
 * already carries each delegate's name.
 */
export async function readSuspendedRoom(
	supabase: SupabaseClient,
	committeeState: CommitteeStateView,
	seats: RoomSeat[]
): Promise<SuspendedRoom> {
	const sessionId = committeeState.currentSessionId;
	const suspendedAt = committeeState.suspendedAt ?? null;
	const hasReasonToRead = sessionId !== null && suspendedAt !== null;

	const [room, reason] = await Promise.all([
		getCommitteeRoom(supabase, committeeState, seats),
		hasReasonToRead ? readSuspensionReason(supabase, sessionId, suspendedAt) : null
	]);

	return {
		speakers: room.speakers,
		voteSubject: room.currentVote?.subject ?? null,
		reason
	};
}

/**
 * What the conference dashboard's Rooms table says on a conference day: each
 * committee's session and who is present, and the total over every room
 * (`specs/05-pages/organiser/dashboard.md`, "Conference days", T173).
 *
 * Nothing here talks to Supabase or knows any Svelte. `$lib/server/dashboard-rooms.ts`
 * reads the rows; this file turns them into the table's words.
 */

import type { CommitteeMode } from '$lib/committee-room';
import type { ManagedCommittee } from '$lib/committees';
import { chairText, committeeCode } from '$lib/dashboard-committees';
import { formatTimeOfDay } from '$lib/dates';
import { statusLabel } from '$lib/status';

/** A delegate the latest roll call of a sitting room marked absent. */
export type AbsentDelegate = {
	/** Who sits in the seat, or `null` when nobody does or their name cannot be read. */
	fullName: string | null;
	/** The seat's own name, such as "Nigeria". */
	seatName: string;
	/** When that roll call was taken, an ISO timestamp. */
	markedAt: string;
};

/** One committee room as the dashboard reads it. */
export type DashboardRoom = {
	committeeId: string;
	/** The committee's slug, which its chair room's address is built from. */
	committeeSlug: string;
	/** The short name when it has one ("UNSC"), otherwise the full name. */
	committeeName: string;
	/** The session in progress, or `null` when the room is not sitting. */
	session: { name: string; mode: CommitteeMode } | null;
	/**
	 * How many seats answered "present" or "present and voting" at the latest
	 * roll call of the session in progress, or `null` when none has been taken
	 * in it yet (or the room is not sitting).
	 */
	presentCount: number | null;
	/** The room's last session to end, for a room that is not sitting. */
	lastSession: { name: string; endedAt: string } | null;
	/** Seats with a delegate in them, whether or not a roll call has been taken. */
	seatedCount: number;
	/** Who the latest roll call of the session in progress marked absent. */
	absentees: AbsentDelegate[];
};

/** One line of the Rooms table, every word already written. */
export type LiveRoomRow = {
	committeeId: string;
	committeeSlug: string;
	/** The committee's full name. */
	name: string;
	/** "HRC · Room 1", or `null` when the committee has neither. */
	code: string | null;
	/** "Session 2 · Formal debate", or "Not in session · last: Session 1 ended 16:58". */
	activity: string;
	/** "38 of 42", "No roll call yet", or `null` for a room that is not sitting. */
	presence: string | null;
	/** "Samuel Osei", or "No chair yet". */
	chair: string;
};

/** The sum over every room that is sitting, for the card's last line. */
export type RoomsTotal = {
	present: number;
	seated: number;
	/** How many rooms are sitting. */
	roomCount: number;
};

/** Whether the room has a session in progress. */
export function isRoomInSession(room: DashboardRoom): boolean {
	return room.session !== null;
}

/** How many of the rooms have a session in progress, for the live panel's "2 of 3 committees in session". */
export function countRoomsInSession(rooms: DashboardRoom[]): number {
	return rooms.filter(isRoomInSession).length;
}

/**
 * What the room is doing: "Session 2 · Formal debate" while it sits, and
 * "Not in session · last: Session 1 ended 16:58" when it does not.
 *
 * A sitting room between modes is `idle`, whose label is "Not in session", so
 * the mode is left out then rather than contradicting the session's name.
 */
export function roomActivity(room: DashboardRoom, timezone: string): string {
	if (room.session === null) {
		if (room.lastSession === null) {
			return 'Not in session';
		}

		const endedAt = formatTimeOfDay(room.lastSession.endedAt, timezone);

		return `Not in session · last: ${room.lastSession.name} ended ${endedAt}`;
	}

	if (room.session.mode === 'idle') {
		return room.session.name;
	}

	return `${room.session.name} · ${statusLabel('committee_mode', room.session.mode)}`;
}

/** "38 of 42" at the latest roll call, "No roll call yet", or `null` when the room is not sitting. */
export function roomPresence(room: DashboardRoom): string | null {
	if (room.session === null) {
		return null;
	}

	if (room.presentCount === null) {
		return 'No roll call yet';
	}

	return `${room.presentCount} of ${room.seatedCount}`;
}

/**
 * Each room as the Rooms table draws it, in the rooms' order. The committee's
 * full name, room and chairs come from `committees`, which the dashboard reads
 * in every phase; a room whose committee is missing there keeps its short name.
 */
export function liveRoomRows(
	rooms: DashboardRoom[],
	committees: ManagedCommittee[],
	timezone: string
): LiveRoomRow[] {
	const committeesById = new Map(committees.map((committee) => [committee.id, committee]));

	return rooms.map((room) => {
		const committee = committeesById.get(room.committeeId);

		return {
			committeeId: room.committeeId,
			committeeSlug: room.committeeSlug,
			name: committee?.name ?? room.committeeName,
			code: committee === undefined ? null : committeeCode(committee),
			activity: roomActivity(room, timezone),
			presence: roomPresence(room),
			chair: chairText(committee?.chairNames ?? [])
		};
	});
}

/**
 * Who is present over every sitting room. A room whose session has had no roll
 * call yet counts its delegates as not present, since nobody has said they are.
 */
export function roomsTotal(rooms: DashboardRoom[]): RoomsTotal {
	const sittingRooms = rooms.filter(isRoomInSession);
	let present = 0;
	let seated = 0;

	for (const room of sittingRooms) {
		present += room.presentCount ?? 0;
		seated += room.seatedCount;
	}

	return { present, seated, roomCount: sittingRooms.length };
}

/** "Present: 78 of 84 delegates in 2 rooms · As of 13:02", before the table's "Refresh" link. */
export function roomsTotalSentence(
	total: RoomsTotal,
	generatedAt: string,
	timezone: string
): string {
	const rooms = total.roomCount === 1 ? '1 room' : `${total.roomCount} rooms`;
	const asOf = formatTimeOfDay(generatedAt, timezone);

	return `Present: ${total.present} of ${total.seated} delegates in ${rooms} · As of ${asOf}`;
}

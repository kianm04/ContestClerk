/**
 * The room links on a conference's schedule page (T171): "Your room: UNSC · Open
 * chair room" under today's heading, and the same link on that committee's own
 * events.
 *
 * `05-pages/delegate/schedule.md` ("Room links on a conference day") is the
 * contract. A reader gets a line for each committee they chair or sit in, but
 * only while its conference is running: on a day of the conference, in the
 * conference's own timezone. Four days before, the schedule links no room;
 * `/home`'s "My committees" is the way in then.
 *
 * `$lib/server/schedule-rooms.ts` reads the reader's committees. Nothing here
 * reads the clock: the moment is handed in, so a test can choose it.
 */

import type { ResolvedPathname } from '$app/types';
import { dayInTimezone } from '$lib/dates';
import { isRunningToday, type TodayConference } from '$lib/home-today';
import type { ScheduleEvent } from '$lib/schedule';
import { chairRoomUrl, committeeLiveUrl } from '$lib/urls';

/** A committee the reader chairs or sits in, with the conference it belongs to. */
export type ScheduleRoom = {
	committeeId: string;
	/** Its short name when it has one, its full name otherwise: "UNSC". */
	heading: string;
	committeeSlug: string;
	conference: TodayConference;
	/** `true` for a committee the reader chairs, `false` for one they hold a seat in. */
	isChair: boolean;
};

/** One room link: the committee it is for and the button that opens its room. */
export type RoomLink = {
	committeeId: string;
	heading: string;
	label: 'Open chair room' | 'Open live room';
	href: ResolvedPathname;
};

/** The link of one room: the chair room for its chair, the live room for a delegate. */
export function roomLink(room: ScheduleRoom): RoomLink {
	if (room.isChair) {
		return {
			committeeId: room.committeeId,
			heading: room.heading,
			label: 'Open chair room',
			href: chairRoomUrl(room.conference.slug, room.committeeSlug)
		};
	}

	return {
		committeeId: room.committeeId,
		heading: room.heading,
		label: 'Open live room',
		href: committeeLiveUrl(room.conference.slug, room.committeeSlug)
	};
}

/**
 * The rooms whose conference runs today, each committee once.
 *
 * A committee the reader both chairs and sits in is kept as the chair's,
 * because the chair room is where the day needs them, as on `/home`.
 */
export function roomsOpenToday(rooms: ScheduleRoom[], now: Date): ScheduleRoom[] {
	const openRooms: ScheduleRoom[] = [];

	for (const room of rooms) {
		if (!isRunningToday(room.conference, now)) {
			continue;
		}

		const listedIndex = openRooms.findIndex((listed) => listed.committeeId === room.committeeId);

		if (listedIndex === -1) {
			openRooms.push(room);
		} else if (room.isChair) {
			openRooms[listedIndex] = room;
		}
	}

	return openRooms;
}

/**
 * The "Your room" lines under one day's heading: a line for each open room
 * whose conference is on that day today. Any other day, such as tomorrow's
 * tab, has none.
 */
export function yourRoomLinks(rooms: ScheduleRoom[], day: string, now: Date): RoomLink[] {
	const roomsToday = roomsOpenToday(rooms, now).filter(
		(room) => dayInTimezone(now, room.conference.timezone) === day
	);

	return roomsToday.map(roomLink);
}

/**
 * The room link each event carries, by event id. Only an event for one
 * committee (`audience = 'committee'`) of an open room carries one, and only
 * when it falls on one of its conference's days. An `everyone` event carries
 * none: nothing tells "Committee session I" from "Lunch".
 */
export function eventRoomLinks(
	events: ScheduleEvent[],
	rooms: ScheduleRoom[],
	now: Date
): Record<string, RoomLink> {
	const openRooms = roomsOpenToday(rooms, now);
	const links: Record<string, RoomLink> = {};

	for (const event of events) {
		if (event.audience !== 'committee') {
			continue;
		}

		const room = openRooms.find((openRoom) => openRoom.committeeId === event.committeeId);

		if (room === undefined) {
			continue;
		}

		const conference = room.conference;
		const eventDay = dayInTimezone(new Date(event.startsAt), conference.timezone);

		// `YYYY-MM-DD` strings sort the way the days they name do.
		if (eventDay >= conference.startDate && eventDay <= conference.endDate) {
			links[event.id] = roomLink(room);
		}
	}

	return links;
}

import { describe, expect, it } from 'vitest';
import type { TodayConference } from '$lib/home-today';
import type { ScheduleEvent } from '$lib/schedule';
import {
	eventRoomLinks,
	roomLink,
	roomsOpenToday,
	yourRoomLinks,
	type ScheduleRoom
} from './schedule-rooms';
import { chairRoomUrl, committeeLiveUrl } from './urls';

// Which reader gets "Your room" on which day, for which committee
// (`05-pages/delegate/schedule.md`, "Room links on a conference day").

/** Midday in London on day 2 of 3 of Northbridge MUN. */
const DAY_TWO = new Date('2026-09-28T11:00:00Z');

/** Four days before Northbridge MUN's first day. */
const FOUR_DAYS_BEFORE = new Date('2026-09-23T11:00:00Z');

const NORTHBRIDGE: TodayConference = {
	id: 'conference-northbridge',
	slug: 'northbridge-mun',
	name: 'Northbridge MUN',
	startDate: '2026-09-27',
	endDate: '2026-09-29',
	timezone: 'Europe/London'
};

/** A committee of Northbridge's that the reader chairs, which a test changes as it needs. */
function makeRoom(overrides: Partial<ScheduleRoom> = {}): ScheduleRoom {
	return {
		committeeId: 'committee-unsc',
		heading: 'UNSC',
		committeeSlug: 'unsc',
		conference: NORTHBRIDGE,
		isChair: true,
		...overrides
	};
}

/** A UNSC event on day 2 at ten in the morning, London time, which a test changes as it needs. */
function makeEvent(overrides: Partial<ScheduleEvent> = {}): ScheduleEvent {
	return {
		id: 'event-session',
		conferenceId: NORTHBRIDGE.id,
		title: 'Security Council session',
		description: null,
		location: 'Council Chamber',
		startsAt: '2026-09-28T09:00:00Z',
		endsAt: '2026-09-28T16:00:00Z',
		audience: 'committee',
		committeeId: 'committee-unsc',
		committeeAbbreviation: 'UNSC',
		...overrides
	};
}

describe('roomLink', () => {
	it('opens the chair room for a chair', () => {
		expect(roomLink(makeRoom())).toEqual({
			committeeId: 'committee-unsc',
			heading: 'UNSC',
			label: 'Open chair room',
			href: chairRoomUrl('northbridge-mun', 'unsc')
		});
	});

	it('opens the live room for a delegate', () => {
		const link = roomLink(makeRoom({ isChair: false }));

		expect(link.label).toBe('Open live room');
		expect(link.href).toBe(committeeLiveUrl('northbridge-mun', 'unsc'));
	});
});

describe('roomsOpenToday', () => {
	it('keeps the rooms of a conference running today, on its first and last day too', () => {
		const firstDay = new Date('2026-09-27T08:00:00Z');
		const lastDay = new Date('2026-09-29T20:00:00Z');

		expect(roomsOpenToday([makeRoom()], firstDay)).toHaveLength(1);
		expect(roomsOpenToday([makeRoom()], lastDay)).toHaveLength(1);
	});

	it('keeps none four days before the conference, or the day after it', () => {
		const dayAfter = new Date('2026-09-30T11:00:00Z');

		expect(roomsOpenToday([makeRoom()], FOUR_DAYS_BEFORE)).toEqual([]);
		expect(roomsOpenToday([makeRoom()], dayAfter)).toEqual([]);
	});

	it('asks which day it is in the conference timezone, not in UTC', () => {
		// 23:30 UTC on the last day is already the day after in Tokyo.
		const tokyo = { ...NORTHBRIDGE, timezone: 'Asia/Tokyo' };
		const lateOnTheLastDay = new Date('2026-09-29T23:30:00Z');

		expect(roomsOpenToday([makeRoom({ conference: tokyo })], lateOnTheLastDay)).toEqual([]);
	});

	it('lists a committee the reader both chairs and sits in once, as the chair', () => {
		const seat = makeRoom({ isChair: false });
		const chair = makeRoom({ isChair: true });

		expect(roomsOpenToday([seat, chair], DAY_TWO)).toEqual([chair]);
		expect(roomsOpenToday([chair, seat], DAY_TWO)).toEqual([chair]);
	});
});

describe('yourRoomLinks', () => {
	it('gives a chair "Open chair room" under today\'s heading on day 2 of 3', () => {
		const links = yourRoomLinks([makeRoom()], '2026-09-28', DAY_TWO);

		expect(links.map((link) => `${link.heading} · ${link.label}`)).toEqual([
			'UNSC · Open chair room'
		]);
	});

	it('gives a delegate "Open live room"', () => {
		const links = yourRoomLinks([makeRoom({ isChair: false })], '2026-09-28', DAY_TWO);

		expect(links.map((link) => link.label)).toEqual(['Open live room']);
	});

	it('gives nothing under another day of the conference, such as tomorrow', () => {
		expect(yourRoomLinks([makeRoom()], '2026-09-29', DAY_TWO)).toEqual([]);
	});

	it('gives nothing four days before, even under the first day of the conference', () => {
		expect(yourRoomLinks([makeRoom()], '2026-09-23', FOUR_DAYS_BEFORE)).toEqual([]);
		expect(yourRoomLinks([makeRoom()], '2026-09-27', FOUR_DAYS_BEFORE)).toEqual([]);
	});

	it('gives a reader with no committee, such as a volunteer, nothing', () => {
		expect(yourRoomLinks([], '2026-09-28', DAY_TWO)).toEqual([]);
	});

	it('gives one line for each committee the reader chairs or sits in', () => {
		const rooms = [
			makeRoom(),
			makeRoom({
				committeeId: 'committee-hrc',
				heading: 'HRC',
				committeeSlug: 'hrc',
				isChair: false
			})
		];

		const labels = yourRoomLinks(rooms, '2026-09-28', DAY_TWO).map((link) => link.heading);

		expect(labels).toEqual(['UNSC', 'HRC']);
	});
});

describe('eventRoomLinks', () => {
	it("links a committee event of the reader's room on the conference's days", () => {
		const links = eventRoomLinks([makeEvent()], [makeRoom()], DAY_TWO);

		expect(links['event-session']?.label).toBe('Open chair room');
	});

	it("links tomorrow's committee event too, while the conference runs", () => {
		const tomorrow = makeEvent({ startsAt: '2026-09-29T09:00:00Z' });

		expect(eventRoomLinks([tomorrow], [makeRoom()], DAY_TWO)['event-session']).toBeDefined();
	});

	it('links no everyone event, and no event of another committee', () => {
		const everyone = makeEvent({ id: 'event-lunch', audience: 'everyone', committeeId: null });
		const otherCommittee = makeEvent({ id: 'event-hrc', committeeId: 'committee-hrc' });

		expect(eventRoomLinks([everyone, otherCommittee], [makeRoom()], DAY_TWO)).toEqual({});
	});

	it("links nothing four days before, nor an event outside the conference's days", () => {
		const dayAfter = makeEvent({ startsAt: '2026-09-30T09:00:00Z' });

		expect(eventRoomLinks([makeEvent()], [makeRoom()], FOUR_DAYS_BEFORE)).toEqual({});
		expect(eventRoomLinks([dayAfter], [makeRoom()], DAY_TWO)).toEqual({});
	});
});

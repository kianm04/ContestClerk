import { describe, expect, it } from 'vitest';
import {
	eventsOfToday,
	isEventGoingOn,
	todayRows,
	type TodayScheduleEvent
} from './dashboard-today';

/** An hour-long event starting at `startsAt`, named after it. */
function event(startsAt: string, changes: Partial<TodayScheduleEvent> = {}): TodayScheduleEvent {
	const endsAt = new Date(new Date(startsAt).getTime() + 60 * 60 * 1000).toISOString();

	return {
		id: startsAt,
		title: `Event at ${startsAt}`,
		startsAt,
		endsAt,
		location: null,
		committeeName: null,
		...changes
	};
}

describe('eventsOfToday', () => {
	it('keeps every event of today, soonest first, including those already over', () => {
		const morning = event('2026-10-02T08:00:00Z');
		const noon = event('2026-10-02T12:00:00Z');
		const evening = event('2026-10-02T18:00:00Z');

		expect(
			eventsOfToday([evening, morning, noon], new Date('2026-10-02T13:00:00Z'), 'UTC')
		).toEqual([morning, noon, evening]);
	});

	it('leaves out what starts tomorrow, and what started yesterday and runs on', () => {
		const yesterday = event('2026-10-01T20:00:00Z');
		const today = event('2026-10-02T12:00:00Z');
		const tomorrow = event('2026-10-03T08:00:00Z');

		expect(
			eventsOfToday([yesterday, today, tomorrow], new Date('2026-10-02T10:00:00Z'), 'UTC')
		).toEqual([today]);
	});

	it('decides which day is today where the conference is', () => {
		// At 14:00 UTC it is 23:00 in Tokyo, and an event at 15:30 UTC starts at
		// 00:30 on the next day there, while in UTC it is still the same day.
		const now = new Date('2026-10-01T14:00:00Z');
		const afterMidnightInTokyo = event('2026-10-01T15:30:00Z');

		expect(eventsOfToday([afterMidnightInTokyo], now, 'Asia/Tokyo')).toEqual([]);
		expect(eventsOfToday([afterMidnightInTokyo], now, 'UTC')).toEqual([afterMidnightInTokyo]);
	});
});

describe('isEventGoingOn', () => {
	const session = event('2026-10-02T09:00:00Z');

	it('is true from the start up to, but not at, the end', () => {
		expect(isEventGoingOn(session, new Date('2026-10-02T09:00:00Z'))).toBe(true);
		expect(isEventGoingOn(session, new Date('2026-10-02T09:59:00Z'))).toBe(true);
		expect(isEventGoingOn(session, new Date('2026-10-02T10:00:00Z'))).toBe(false);
		expect(isEventGoingOn(session, new Date('2026-10-02T08:59:00Z'))).toBe(false);
	});
});

describe('todayRows', () => {
	it('writes the time, the place and whether the event is on now', () => {
		const session = event('2026-10-02T09:00:00Z', {
			id: 'session',
			title: 'Committee session III',
			committeeName: 'UNSC',
			location: 'Council Chamber'
		});
		const lunch = event('2026-10-02T11:30:00Z', { id: 'lunch', title: 'Lunch' });

		expect(todayRows([session, lunch], new Date('2026-10-02T09:30:00Z'), 'UTC')).toEqual([
			{
				id: 'session',
				time: '09:00 – 10:00',
				title: 'Committee session III',
				place: 'UNSC · Council Chamber',
				isCurrent: true
			},
			{ id: 'lunch', time: '11:30 – 12:30', title: 'Lunch', place: null, isCurrent: false }
		]);
	});
});

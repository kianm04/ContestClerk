import { describe, expect, it } from 'vitest';
import type { ScheduleEvent } from '$lib/schedule';
import {
	calendarColumns,
	calendarDayLabels,
	calendarHours,
	eventAudienceText,
	eventDetailDate,
	eventState,
	hourLabels,
	hoursFromTop,
	isListView,
	isShortEvent,
	minuteOfDay,
	nowMinute,
	nowUntilText,
	placeEventsOnDay,
	roomStatusText
} from './schedule-calendar';

// London is an hour ahead of UTC in October, so 09:00Z reads as 10:00 there.
const LONDON = 'Europe/London';
const FRIDAY = '2026-10-02';
const DEFAULT_HOURS = { firstHour: 8, lastHour: 23 };

/** An event with every field filled in, which the tests below change one field of. */
function makeEvent(overrides: Partial<ScheduleEvent> = {}): ScheduleEvent {
	return {
		id: 'event-1',
		conferenceId: 'conference-1',
		title: 'Opening ceremony',
		description: null,
		location: 'Main hall',
		startsAt: '2026-10-02T09:00:00Z',
		endsAt: '2026-10-02T10:00:00Z',
		audience: 'everyone',
		committeeId: null,
		committeeAbbreviation: null,
		...overrides
	};
}

describe('minuteOfDay', () => {
	it('counts the minutes after midnight on the conference clock', () => {
		expect(minuteOfDay('2026-10-02T09:30:00Z', FRIDAY, LONDON)).toBe(10 * 60 + 30);
	});

	it('reads a moment on a later day as the end of this one, and an earlier day as its start', () => {
		expect(minuteOfDay('2026-10-03T00:30:00Z', FRIDAY, LONDON)).toBe(24 * 60);
		expect(minuteOfDay('2026-10-01T12:00:00Z', FRIDAY, LONDON)).toBe(0);
	});
});

describe('calendarHours', () => {
	it('shows 08:00 to 23:00 when every event fits inside them', () => {
		expect(calendarHours([makeEvent()], LONDON)).toEqual(DEFAULT_HOURS);
	});

	it('stretches to an early start and a late finish, but never past midnight', () => {
		const breakfast = makeEvent({
			startsAt: '2026-10-02T05:30:00Z',
			endsAt: '2026-10-02T06:00:00Z'
		});
		const party = makeEvent({ startsAt: '2026-10-02T21:00:00Z', endsAt: '2026-10-03T01:00:00Z' });

		expect(calendarHours([breakfast, party], LONDON)).toEqual({ firstHour: 6, lastHour: 24 });
	});
});

describe('hourLabels', () => {
	it('labels every hour from the first to the last', () => {
		expect(hourLabels({ firstHour: 8, lastHour: 10 })).toEqual(['08:00', '09:00', '10:00']);
	});
});

describe('placeEventsOnDay', () => {
	it('gives an event the whole column when nothing shares its time', () => {
		const [placed] = placeEventsOnDay([makeEvent()], FRIDAY, LONDON);

		expect(placed).toMatchObject({ startMinute: 600, endMinute: 660, column: 0, columnCount: 1 });
	});

	it('sets overlapping events side by side, and leaves a later one the full width', () => {
		const unsc = makeEvent({ id: 'unsc', endsAt: '2026-10-02T11:00:00Z' });
		const disec = makeEvent({
			id: 'disec',
			startsAt: '2026-10-02T09:30:00Z',
			endsAt: '2026-10-02T10:30:00Z'
		});
		const lunch = makeEvent({
			id: 'lunch',
			startsAt: '2026-10-02T11:00:00Z',
			endsAt: '2026-10-02T12:00:00Z'
		});

		const placed = placeEventsOnDay([lunch, disec, unsc], FRIDAY, LONDON);

		expect(placed.map(({ event, column, columnCount }) => [event.id, column, columnCount])).toEqual(
			[
				['unsc', 0, 2],
				['disec', 1, 2],
				['lunch', 0, 1]
			]
		);
	});

	it('draws a five-minute event twenty minutes tall so it can be read and pressed', () => {
		const rollCall = makeEvent({ endsAt: '2026-10-02T09:05:00Z' });
		const [placed] = placeEventsOnDay([rollCall], FRIDAY, LONDON);

		expect(placed.endMinute - placed.startMinute).toBe(20);
		expect(isShortEvent(placed)).toBe(true);
	});

	it('draws an hour-long event as a tall block', () => {
		const [placed] = placeEventsOnDay([makeEvent()], FRIDAY, LONDON);

		expect(isShortEvent(placed)).toBe(false);
	});
});

describe('hoursFromTop', () => {
	it('measures from the first hour shown', () => {
		expect(hoursFromTop(10 * 60 + 30, DEFAULT_HOURS)).toBe(2.5);
	});
});

describe('eventState', () => {
	it('tells an event that is over from one that is on and one to come', () => {
		const event = makeEvent();

		expect(eventState(event, new Date('2026-10-02T10:30:00Z'))).toBe('past');
		expect(eventState(event, new Date('2026-10-02T09:30:00Z'))).toBe('now');
		expect(eventState(event, new Date('2026-10-02T08:30:00Z'))).toBe('upcoming');
	});
});

describe('nowMinute', () => {
	const now = new Date('2026-10-02T13:15:00Z');

	it('marks now on today only', () => {
		expect(nowMinute(FRIDAY, now, LONDON, DEFAULT_HOURS)).toBe(14 * 60 + 15);
		expect(nowMinute('2026-10-03', now, LONDON, DEFAULT_HOURS)).toBeNull();
	});

	it('leaves the line out before the first hour shown', () => {
		const early = new Date('2026-10-02T05:00:00Z');

		expect(nowMinute(FRIDAY, early, LONDON, DEFAULT_HOURS)).toBeNull();
	});
});

describe('calendarDayLabels', () => {
	it('numbers the days of the conference and says which one is today', () => {
		expect(calendarDayLabels('2026-10-03', '2026-10-03', FRIDAY, '2026-10-04')).toEqual({
			weekday: 'Saturday',
			shortWeekday: 'Sat',
			dayOfMonth: '3',
			note: 'Today · Day 2'
		});
	});

	it('names the month of a day outside the conference dates', () => {
		expect(calendarDayLabels('2026-10-05', '2026-10-03', FRIDAY, '2026-10-04').note).toBe(
			'October'
		);
	});
});

describe('event words', () => {
	it('writes the date and time out in full for the details', () => {
		expect(eventDetailDate(makeEvent(), LONDON)).toBe('Friday 2 October · 10:00 – 11:00');
	});

	it('says until when the event on now runs', () => {
		expect(nowUntilText(makeEvent(), LONDON)).toBe('Now, until 11:00');
	});

	it('says who an event is for, naming a committee by its abbreviation', () => {
		expect(eventAudienceText(makeEvent())).toBe('For everyone');
		expect(eventAudienceText(makeEvent({ audience: 'staff' }))).toBe('For staff');
		expect(
			eventAudienceText(
				makeEvent({ audience: 'committee', committeeId: 'unsc', committeeAbbreviation: 'UNSC' })
			)
		).toBe('For UNSC');
	});
});

describe('roomStatusText', () => {
	const session = makeEvent({
		title: 'Committee session II',
		audience: 'committee',
		committeeId: 'unsc',
		startsAt: '2026-10-02T12:00:00Z',
		endsAt: '2026-10-02T14:00:00Z'
	});

	it('says until when the session that is on runs', () => {
		const now = new Date('2026-10-02T13:00:00Z');

		expect(roomStatusText('unsc', [session], now, LONDON)).toBe(
			'Committee session II is on until 15:00'
		);
	});

	it('says when the next session today starts', () => {
		const now = new Date('2026-10-02T09:00:00Z');

		expect(roomStatusText('unsc', [session], now, LONDON)).toBe(
			'Committee session II starts at 13:00'
		);
	});

	it('says nothing once the committee has nothing more today, or for another committee', () => {
		const evening = new Date('2026-10-02T18:00:00Z');
		const morning = new Date('2026-10-02T09:00:00Z');

		expect(roomStatusText('unsc', [session], evening, LONDON)).toBeNull();
		expect(roomStatusText('disec', [session], morning, LONDON)).toBeNull();
	});
});

describe('calendarColumns', () => {
	it('builds one column per day, holding the events that start on it', () => {
		const saturday = makeEvent({
			id: 'saturday',
			startsAt: '2026-10-03T09:00:00Z',
			endsAt: '2026-10-03T10:00:00Z'
		});
		const now = new Date('2026-10-03T09:30:00Z');

		const columns = calendarColumns([FRIDAY, '2026-10-03'], [makeEvent(), saturday], {
			timezone: LONDON,
			today: '2026-10-03',
			activeDay: FRIDAY,
			startDate: FRIDAY,
			endDate: '2026-10-04',
			now,
			hours: DEFAULT_HOURS
		});

		expect(
			columns.map((column) => ({
				day: column.day,
				ids: column.events.map((placed) => placed.event.id),
				isToday: column.isToday,
				isActive: column.isActive,
				nowMinute: column.nowMinute
			}))
		).toEqual([
			{ day: FRIDAY, ids: ['event-1'], isToday: false, isActive: true, nowMinute: null },
			{ day: '2026-10-03', ids: ['saturday'], isToday: true, isActive: false, nowMinute: 630 }
		]);
	});
});

describe('isListView', () => {
	it('shows the list only for ?view=list', () => {
		expect(isListView('list')).toBe(true);
		expect(isListView(null)).toBe(false);
		expect(isListView('calendar')).toBe(false);
	});
});

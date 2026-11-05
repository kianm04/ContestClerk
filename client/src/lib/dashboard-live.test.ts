import { describe, expect, it } from 'vitest';
import { livePanel } from './dashboard-live';
import type { DashboardRoom } from './dashboard-rooms';
import type { TodayScheduleEvent } from './dashboard-today';

/** A room, sitting or not. */
function room(isSitting: boolean): DashboardRoom {
	return {
		committeeId: 'hrc-id',
		committeeSlug: 'hrc',
		committeeName: 'HRC',
		session: isSitting ? { name: 'Session 3', mode: 'moderated_caucus' } : null,
		presentCount: null,
		lastSession: null,
		seatedCount: 4,
		absentees: []
	};
}

/** Committee session III until 12:30 London time, then lunch in the Front hall. */
const EVENTS: TodayScheduleEvent[] = [
	{
		id: 'session-3',
		title: 'Committee session III',
		startsAt: '2026-11-15T09:30:00Z',
		endsAt: '2026-11-15T12:30:00Z',
		location: null,
		committeeName: null
	},
	{
		id: 'lunch',
		title: 'Lunch',
		startsAt: '2026-11-15T12:30:00Z',
		endsAt: '2026-11-15T13:30:00Z',
		location: 'Front hall',
		committeeName: null
	}
];

describe('livePanel', () => {
	it('counts the rooms sitting, and names what is on now and what comes next', () => {
		const now = new Date('2026-11-15T11:00:00Z');

		expect(livePanel([room(true), room(false)], EVENTS, now, 'Europe/London')).toEqual({
			dotText: '1 of 2 committees in session',
			dotTone: 'brand',
			headline: 'Committee session III, until 12:30',
			nextLine: 'Next: Lunch in Front hall at 12:30'
		});
	});

	it('says how long until the next event when nothing is on', () => {
		const now = new Date('2026-11-15T08:00:00Z');
		const panel = livePanel([room(false)], EVENTS, now, 'Europe/London');

		expect(panel.dotText).toBe('No committee in session');
		expect(panel.dotTone).toBe('neutral');
		expect(panel.headline).toBe('Nothing on the programme until 09:30');
		expect(panel.nextLine).toBe('Next: Committee session III at 09:30');
	});

	it('says nothing more is on once the last event has ended', () => {
		const now = new Date('2026-11-15T15:00:00Z');
		const panel = livePanel([room(true)], EVENTS, now, 'Europe/London');

		expect(panel.dotText).toBe('1 of 1 committee in session');
		expect(panel.headline).toBe('Nothing more on the programme today');
		expect(panel.nextLine).toBeNull();
	});
});

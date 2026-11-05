import { describe, expect, it } from 'vitest';
import type { TodayConference } from '$lib/home-today';
import { pickScheduleConference, scheduleSwitchItems } from './schedule-conference';

// Which conference's schedule the top bar's "Schedule" opens, and what the
// "Switch conference" menu offers (Trello card Lq9cSUET).

/** Midday in London on 28 September 2026. */
const NOW = new Date('2026-09-28T11:00:00Z');

/** A conference of the reader's, which a test changes as it needs. */
function makeConference(overrides: Partial<TodayConference> = {}): TodayConference {
	return {
		id: 'conference-northbridge',
		slug: 'northbridge-mun',
		name: 'Northbridge MUN',
		startDate: '2026-09-27',
		endDate: '2026-09-29',
		timezone: 'Europe/London',
		...overrides
	};
}

const RUNNING_TODAY = makeConference();

const NEXT_MONTH = makeConference({
	id: 'conference-geneva',
	slug: 'geneva-mun',
	name: 'Geneva MUN',
	startDate: '2026-10-20',
	endDate: '2026-10-22'
});

const IN_TWO_MONTHS = makeConference({
	id: 'conference-oslo',
	slug: 'oslo-mun',
	name: 'Oslo MUN',
	startDate: '2026-11-20',
	endDate: '2026-11-21'
});

const LAST_SPRING = makeConference({
	id: 'conference-hague',
	slug: 'hague-mun',
	name: 'Hague MUN',
	startDate: '2026-04-10',
	endDate: '2026-04-12'
});

const LAST_SUMMER = makeConference({
	id: 'conference-paris',
	slug: 'paris-mun',
	name: 'Paris MUN',
	startDate: '2026-07-01',
	endDate: '2026-07-03'
});

describe('pickScheduleConference', () => {
	it('picks a conference running today over every other', () => {
		const conferences = [LAST_SUMMER, NEXT_MONTH, RUNNING_TODAY];

		expect(pickScheduleConference(conferences, NOW)).toBe(RUNNING_TODAY);
	});

	it('reads "today" in the conference\'s own timezone', () => {
		// 23:30 in London on the 26th is already the 27th, its first day, in Tokyo.
		const lateEvening = new Date('2026-09-26T23:30:00Z');
		const tokyo = makeConference({ timezone: 'Asia/Tokyo' });

		expect(pickScheduleConference([NEXT_MONTH, tokyo], lateEvening)).toBe(tokyo);
	});

	it('picks the next to start when none is running', () => {
		const conferences = [IN_TWO_MONTHS, LAST_SUMMER, NEXT_MONTH];

		expect(pickScheduleConference(conferences, NOW)).toBe(NEXT_MONTH);
	});

	it('picks the one that ended last when all of them are over', () => {
		expect(pickScheduleConference([LAST_SUMMER, LAST_SPRING], NOW)).toBe(LAST_SUMMER);
	});

	it('settles two that start on the same day by name', () => {
		const alpha = makeConference({ ...NEXT_MONTH, slug: 'alpha-mun', name: 'Alpha MUN' });

		expect(pickScheduleConference([NEXT_MONTH, alpha], NOW)).toBe(alpha);
	});

	it('settles two that ended on the same day by name', () => {
		const alpha = makeConference({ ...LAST_SUMMER, slug: 'alpha-mun', name: 'Alpha MUN' });

		expect(pickScheduleConference([LAST_SUMMER, alpha], NOW)).toBe(alpha);
	});

	it('is null for a reader who is part of no conference', () => {
		expect(pickScheduleConference([], NOW)).toBeNull();
	});
});

describe('scheduleSwitchItems', () => {
	it('offers every other conference, earliest first, each with its dates', () => {
		const conferences = [IN_TWO_MONTHS, RUNNING_TODAY, LAST_SUMMER];

		expect(scheduleSwitchItems(conferences, RUNNING_TODAY.slug)).toEqual([
			{ label: 'Paris MUN · 1 – 3 Jul 2026', href: '/conferences/paris-mun/schedule' },
			{ label: 'Oslo MUN · 20 – 21 Nov 2026', href: '/conferences/oslo-mun/schedule' }
		]);
	});

	it('offers nothing when the open conference is the only one', () => {
		expect(scheduleSwitchItems([RUNNING_TODAY], RUNNING_TODAY.slug)).toEqual([]);
	});
});

import { describe, expect, it } from 'vitest';
import {
	conferenceDayLabel,
	isRunningToday,
	todayItemKey,
	todayItems,
	type TodayCommittee,
	type TodayConference,
	type TodayFacts
} from './home-today';

// Which "Today" items a reader has and in which order, as the hero of
// `docs/home.md` reads them on a conference day: its button is the first link
// of the item of the reader's own role, its first figure the item's title.

/** Midday in London on the second of a three-day conference. */
const NOW = new Date('2026-09-28T11:00:00Z');

/** Northbridge MUN, running from yesterday to tomorrow. */
const NORTHBRIDGE: TodayConference = {
	id: 'conference-northbridge',
	slug: 'northbridge-mun',
	name: 'Northbridge MUN',
	startDate: '2026-09-27',
	endDate: '2026-09-29',
	timezone: 'Europe/London'
};

/** A committee of Northbridge's, sitting idle, which each test changes as it needs. */
function makeCommittee(overrides: Partial<TodayCommittee> = {}): TodayCommittee {
	return {
		id: 'committee-unsc',
		heading: 'UNSC',
		committeeSlug: 'unsc',
		conference: NORTHBRIDGE,
		isChair: false,
		currentSession: null,
		nextEvent: null,
		...overrides
	};
}

/** Facts with nothing in them, which each test fills in. */
function makeFacts(overrides: Partial<TodayFacts> = {}): TodayFacts {
	return {
		committees: [],
		organisedConferences: [],
		volunteerConferences: [],
		delegations: [],
		events: [],
		...overrides
	};
}

describe('isRunningToday', () => {
	it('counts the first day and the last day as running', () => {
		expect(isRunningToday({ ...NORTHBRIDGE, endDate: '2026-09-28' }, NOW)).toBe(true);
		expect(isRunningToday({ ...NORTHBRIDGE, startDate: '2026-09-28' }, NOW)).toBe(true);
	});

	it('is false before the first day and after the last', () => {
		const later = { ...NORTHBRIDGE, startDate: '2026-10-02', endDate: '2026-10-04' };
		const earlier = { ...NORTHBRIDGE, startDate: '2026-09-20', endDate: '2026-09-27' };

		expect(isRunningToday(later, NOW)).toBe(false);
		expect(isRunningToday(earlier, NOW)).toBe(false);
	});

	it('reads the day in the conference’s own timezone', () => {
		// 23:30 in London on the 27th is already the 28th in Tokyo.
		const lateEvening = new Date('2026-09-27T22:30:00Z');
		const inTokyo = {
			...NORTHBRIDGE,
			startDate: '2026-09-28',
			endDate: '2026-09-28',
			timezone: 'Asia/Tokyo'
		};

		expect(isRunningToday(inTokyo, lateEvening)).toBe(true);
		expect(isRunningToday({ ...inTokyo, timezone: 'Europe/London' }, lateEvening)).toBe(false);
	});
});

describe('conferenceDayLabel', () => {
	it('says which day of how many today is', () => {
		expect(conferenceDayLabel(NORTHBRIDGE, NOW)).toBe('day 2 of 3');
		expect(conferenceDayLabel({ ...NORTHBRIDGE, startDate: '2026-09-28' }, NOW)).toBe('day 1 of 2');
	});
});

describe('todayItems', () => {
	it('words each of the seven kinds as home.md does, with its links', () => {
		const items = todayItems(
			makeFacts({
				committees: [
					makeCommittee({
						id: 'chaired-running',
						isChair: true,
						currentSession: { name: 'Session 1', status: 'in_progress' }
					}),
					makeCommittee({
						id: 'seated-running',
						currentSession: { name: 'Session 1', status: 'in_progress' }
					}),
					makeCommittee({
						id: 'chaired-idle',
						heading: 'HRC',
						committeeSlug: 'hrc',
						isChair: true
					}),
					makeCommittee({
						id: 'seated-idle',
						nextEvent: { title: 'Committee session II', startsAt: '2026-09-28T12:00:00Z' }
					})
				],
				organisedConferences: [{ conference: NORTHBRIDGE, committeeCount: 4, inSessionCount: 3 }],
				volunteerConferences: [NORTHBRIDGE],
				delegations: [{ delegationId: 'delegation-1', conference: NORTHBRIDGE }]
			}),
			NOW
		);

		expect(items.map((item) => [item.title, item.detail])).toEqual([
			['UNSC · Session 1 in progress', null],
			['UNSC · Session 1 in progress', null],
			['Northbridge MUN · day 2 of 3', '3 of 4 committees in session'],
			['HRC · no session yet', null],
			// 12:00 UTC is 13:00 in London in September.
			['UNSC · next: Committee session II, 13:00', null],
			['Northbridge MUN · volunteering', null],
			['Northbridge MUN · your delegation', null]
		]);
		expect(items.map((item) => item.links)).toEqual([
			[{ label: 'Open chair room', href: '/conferences/northbridge-mun/committees/unsc/chair' }],
			[{ label: 'Open live room', href: '/conferences/northbridge-mun/committees/unsc/live' }],
			[{ label: 'Open dashboard', href: '/manage/northbridge-mun' }],
			[{ label: 'Open chair room', href: '/conferences/northbridge-mun/committees/hrc/chair' }],
			[{ label: 'Open live room', href: '/conferences/northbridge-mun/committees/unsc/live' }],
			[
				{ label: 'Schedule', href: '/conferences/northbridge-mun/schedule' },
				{ label: 'Announcements', href: '/conferences/northbridge-mun/announcements' }
			],
			[
				{ label: 'Delegation', href: '/delegations/delegation-1' },
				{ label: 'Announcements', href: '/conferences/northbridge-mun/announcements' }
			]
		]);
		// Every key is different, so a list of them can be keyed on it, and every
		// item names its conference, so the hero can find its own.
		expect(new Set(items.map((item) => item.key)).size).toBe(items.length);
		expect(items.every((item) => item.conferenceId === NORTHBRIDGE.id)).toBe(true);
	});

	it('keys each item by its kind and what it is about, as todayItemKey builds it', () => {
		const items = todayItems(
			makeFacts({
				committees: [makeCommittee({ isChair: true }), makeCommittee({ id: 'committee-hrc' })],
				organisedConferences: [{ conference: NORTHBRIDGE, committeeCount: 4, inSessionCount: 0 }],
				volunteerConferences: [NORTHBRIDGE],
				delegations: [{ delegationId: 'delegation-1', conference: NORTHBRIDGE }]
			}),
			NOW
		);

		expect(items.map((item) => item.key)).toEqual([
			todayItemKey('organise', NORTHBRIDGE.id),
			todayItemKey('chair', 'committee-unsc'),
			todayItemKey('seat', 'committee-hrc'),
			todayItemKey('volunteer', NORTHBRIDGE.id),
			todayItemKey('delegation', 'delegation-1')
		]);
		expect(todayItemKey('chair', 'committee-unsc')).toBe('chair-committee-unsc');
	});

	it('puts the most urgent kind first, whatever order the facts came in', () => {
		const items = todayItems(
			makeFacts({
				delegations: [{ delegationId: 'delegation-1', conference: NORTHBRIDGE }],
				organisedConferences: [{ conference: NORTHBRIDGE, committeeCount: 4, inSessionCount: 0 }],
				committees: [
					makeCommittee({ isChair: true }),
					makeCommittee({
						id: 'running',
						heading: 'HRC',
						isChair: true,
						currentSession: { name: 'Session 2', status: 'in_progress' }
					})
				]
			}),
			NOW
		);

		expect(items.map((item) => item.title)).toEqual([
			'HRC · Session 2 in progress',
			'Northbridge MUN · day 2 of 3',
			'UNSC · no session yet',
			'Northbridge MUN · your delegation'
		]);
	});

	it('names the running session on a seat’s line as on a chair’s, so the hero reads it off either', () => {
		const items = todayItems(
			makeFacts({
				committees: [
					makeCommittee({ currentSession: { name: 'Session 3', status: 'in_progress' } })
				]
			}),
			NOW
		);

		expect(items.map((item) => item.title)).toEqual(['UNSC · Session 3 in progress']);
	});

	it('says a session ended rather than "no session yet" once the chair has ended it', () => {
		const items = todayItems(
			makeFacts({
				committees: [
					makeCommittee({ isChair: true, currentSession: { name: 'Session 1', status: 'ended' } }),
					makeCommittee({ id: 'seat', currentSession: { name: 'Session 1', status: 'ended' } })
				]
			}),
			NOW
		);

		expect(items.map((item) => item.title)).toEqual([
			'UNSC · Session 1 ended',
			'UNSC · not in session'
		]);
	});

	it('lists nothing for a reader with no part in a conference running today', () => {
		expect(todayItems(makeFacts(), NOW)).toEqual([]);
	});
});

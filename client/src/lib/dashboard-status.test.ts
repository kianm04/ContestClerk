import { describe, expect, it } from 'vitest';
import {
	dashboardStatusSentence,
	type StatusConference,
	type StatusFacts
} from './dashboard-status';

/** A three-day conference in London, 1 to 3 October 2026, applications closing on 24 September. */
const CONFERENCE: StatusConference = {
	status: 'published',
	startDate: '2026-10-01',
	endDate: '2026-10-03',
	timezone: 'Europe/London',
	applicationsOpenAt: '2026-09-01T08:00:00Z',
	applicationsCloseAt: '2026-09-24T22:00:00Z'
};

/** Nine delegates in two committees. */
const FACTS: StatusFacts = {
	delegateCount: 9,
	committeeCount: 2
};

describe('dashboardStatusSentence', () => {
	it('says when applications close and how soon, in the conference timezone', () => {
		// 22:00 UTC on 24 September is 23:00 in London, still the 24th there.
		const now = new Date('2026-09-10T12:00:00Z');

		expect(dashboardStatusSentence('applications', CONFERENCE, now, FACTS)).toBe(
			'Applications are open. They close on Thursday 24 September, in 14 days.'
		);
	});

	it('says only that applications are open when nothing says when they close', () => {
		const open = { ...CONFERENCE, applicationsCloseAt: null };
		const now = new Date('2026-09-10T12:00:00Z');

		expect(dashboardStatusSentence('applications', open, now, FACTS)).toBe(
			'Applications are open.'
		);
	});

	it('says when applications open while that is still ahead', () => {
		const now = new Date('2026-08-31T12:00:00Z');

		expect(dashboardStatusSentence('applications', CONFERENCE, now, FACTS)).toBe(
			'Applications open on Tuesday 1 September, tomorrow.'
		);
	});

	it('gives the opening day where the conference is, not in UTC', () => {
		// 23:30 UTC on 4 October is already 5 October in Amsterdam.
		const amsterdam = {
			...CONFERENCE,
			timezone: 'Europe/Amsterdam',
			applicationsOpenAt: '2026-10-04T23:30:00Z'
		};
		const now = new Date('2026-10-02T10:00:00Z');

		expect(dashboardStatusSentence('applications', amsterdam, now, FACTS)).toBe(
			'Applications open on Monday 5 October, in 3 days.'
		);
	});

	it('says when applications closed and how soon the first day is', () => {
		const now = new Date('2026-09-28T12:00:00Z');

		expect(dashboardStatusSentence('allocation', CONFERENCE, now, FACTS)).toBe(
			'Applications closed on 24 September. The conference starts on Thursday 1 October, in 3 days.'
		);
	});

	it('says tomorrow the day before the conference', () => {
		const now = new Date('2026-09-30T12:00:00Z');

		expect(dashboardStatusSentence('allocation', CONFERENCE, now, FACTS)).toContain(
			'The conference starts on Thursday 1 October, tomorrow.'
		);
	});

	it('names the day of the conference and its date', () => {
		const now = new Date('2026-10-02T10:00:00Z');

		expect(dashboardStatusSentence('conference-days', CONFERENCE, now, FACTS)).toBe(
			'Day 2 of 3 · Friday 2 October'
		);
	});

	it('says when it ended and how many took part', () => {
		const now = new Date('2026-10-10T10:00:00Z');

		expect(dashboardStatusSentence('after', CONFERENCE, now, FACTS)).toBe(
			'The conference ended on Saturday 3 October. 9 delegates took part in 2 committees.'
		);
	});

	it('says only when it ended when nobody held a seat, archived or not', () => {
		const archived = { ...CONFERENCE, status: 'archived' as const };
		const now = new Date('2026-10-10T10:00:00Z');
		const nobody = { delegateCount: 0, committeeCount: 2 };

		expect(dashboardStatusSentence('after', archived, now, nobody)).toBe(
			'The conference ended on Saturday 3 October.'
		);
	});
});

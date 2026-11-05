import { describe, expect, it } from 'vitest';
import { conferencePhase, type ConferencePhaseFields } from './conference-phase';

/**
 * A published conference in Amsterdam, 1 to 3 October 2026, whose applications
 * close at 23:59 on 24 September, Amsterdam time (21:59 UTC in summer time).
 */
const PUBLISHED: ConferencePhaseFields = {
	status: 'published',
	startDate: '2026-10-01',
	endDate: '2026-10-03',
	timezone: 'Europe/Amsterdam',
	applicationsCloseAt: '2026-09-24T21:59:00Z'
};

/** `PUBLISHED` apart from the fields a test names. */
function makeConference(overrides: Partial<ConferencePhaseFields> = {}): ConferencePhaseFields {
	return { ...PUBLISHED, ...overrides };
}

describe('conferencePhase', () => {
	it('calls a draft Setup, whatever the date', () => {
		const draft = makeConference({ status: 'draft' });

		expect(conferencePhase(draft, new Date('2026-09-01T12:00:00Z'))).toBe('setup');
		expect(conferencePhase(draft, new Date('2026-10-02T12:00:00Z'))).toBe('setup');
		expect(conferencePhase(draft, new Date('2027-01-01T12:00:00Z'))).toBe('setup');
	});

	it('calls a published conference Applications while the window is open', () => {
		expect(conferencePhase(PUBLISHED, new Date('2026-09-10T12:00:00Z'))).toBe('applications');
	});

	it('keeps a published conference with no closing moment in Applications until it starts', () => {
		const noWindow = makeConference({ applicationsCloseAt: null });

		expect(conferencePhase(noWindow, new Date('2026-09-30T12:00:00Z'))).toBe('applications');
	});

	it('calls it Allocation from the moment the window closes until the first day', () => {
		expect(conferencePhase(PUBLISHED, new Date('2026-09-24T21:58:00Z'))).toBe('applications');
		expect(conferencePhase(PUBLISHED, new Date('2026-09-24T21:59:00Z'))).toBe('allocation');
		expect(conferencePhase(PUBLISHED, new Date('2026-09-30T12:00:00Z'))).toBe('allocation');
	});

	it('calls every day from the first to the last Conference days', () => {
		expect(conferencePhase(PUBLISHED, new Date('2026-10-01T08:00:00Z'))).toBe('conference-days');
		expect(conferencePhase(PUBLISHED, new Date('2026-10-02T12:00:00Z'))).toBe('conference-days');
		expect(conferencePhase(PUBLISHED, new Date('2026-10-03T20:00:00Z'))).toBe('conference-days');
	});

	it('calls the days after the last one After', () => {
		expect(conferencePhase(PUBLISHED, new Date('2026-10-04T12:00:00Z'))).toBe('after');
	});

	it('calls an archived conference After, whatever the date', () => {
		const archived = makeConference({ status: 'archived' });

		expect(conferencePhase(archived, new Date('2026-09-10T12:00:00Z'))).toBe('after');
	});

	it("reads today in the conference's own timezone, not in UTC", () => {
		// 22:30 UTC on 30 September is already 00:30 on 1 October in Amsterdam
		// (UTC+2 in summer time), so the conference's first day has begun there.
		expect(conferencePhase(PUBLISHED, new Date('2026-09-30T22:30:00Z'))).toBe('conference-days');

		// 21:30 UTC on 3 October is 23:30 on the last day in Amsterdam, and 22:30
		// UTC is 00:30 on the day after it.
		expect(conferencePhase(PUBLISHED, new Date('2026-10-03T21:30:00Z'))).toBe('conference-days');
		expect(conferencePhase(PUBLISHED, new Date('2026-10-03T22:30:00Z'))).toBe('after');
	});

	it('moves the day boundary with the timezone', () => {
		// The same moment is still 30 September in New York (UTC−4), so the same
		// dates there are not a conference day yet.
		const newYork = makeConference({ timezone: 'America/New_York' });

		expect(conferencePhase(newYork, new Date('2026-09-30T22:30:00Z'))).toBe('allocation');
		expect(conferencePhase(newYork, new Date('2026-10-01T04:30:00Z'))).toBe('conference-days');
	});
});

import { describe, expect, it } from 'vitest';
import {
	addDays,
	collectMemberships,
	audienceBadgeLabel,
	showsAudienceBadge,
	dayTabLabel,
	eventsForAudience,
	eventsOnDay,
	formatEventTime,
	groupEventsByDay,
	isConferenceMember,
	isHappeningNow,
	nextEvent,
	NO_MEMBERSHIP,
	pickScheduleDay,
	scheduleDays,
	shiftByDays,
	willNotifyAudience,
	type AudienceMembership,
	type ScheduleEvent
} from './schedule';

const GENEVA = 'Europe/Zurich';

/** An event with every field filled in, which the tests below change one field of. */
function makeEvent(overrides: Partial<ScheduleEvent> = {}): ScheduleEvent {
	return {
		id: 'event-1',
		conferenceId: 'conference-1',
		title: 'Opening ceremony',
		description: null,
		location: 'Main hall',
		startsAt: '2026-02-12T08:00:00Z',
		endsAt: '2026-02-12T09:00:00Z',
		audience: 'everyone',
		committeeId: null,
		committeeAbbreviation: null,
		...overrides
	};
}

const DELEGATE_IN_UNSC: AudienceMembership = {
	isOrganiser: false,
	isParticipant: true,
	isStaff: false,
	committeeIds: ['unsc']
};

const CHAIR_OF_UNSC: AudienceMembership = {
	isOrganiser: false,
	isParticipant: false,
	isStaff: true,
	committeeIds: ['unsc']
};

const ORGANISER: AudienceMembership = { ...NO_MEMBERSHIP, isOrganiser: true };

const PROGRAMME = [
	makeEvent({ id: 'everyone', audience: 'everyone' }),
	makeEvent({ id: 'delegates', audience: 'delegates' }),
	makeEvent({ id: 'staff', audience: 'staff' }),
	makeEvent({ id: 'unsc', audience: 'committee', committeeId: 'unsc' }),
	makeEvent({ id: 'disec', audience: 'committee', committeeId: 'disec' })
];

/** The ids of the events somebody sees, which is all a test needs to compare. */
function visibleIds(membership: AudienceMembership): string[] {
	return eventsForAudience(PROGRAMME, membership).map((event) => event.id);
}

describe('eventsForAudience', () => {
	it('shows a delegate everything for everyone, for delegates and for their own committee', () => {
		expect(visibleIds(DELEGATE_IN_UNSC)).toEqual(['everyone', 'delegates', 'unsc']);
	});

	it('shows a chair everything for everyone, for staff and for the committee they chair', () => {
		expect(visibleIds(CHAIR_OF_UNSC)).toEqual(['everyone', 'staff', 'unsc']);
	});

	it('shows an organiser the whole programme', () => {
		expect(visibleIds(ORGANISER)).toEqual(['everyone', 'delegates', 'staff', 'unsc', 'disec']);
	});

	it('shows somebody with no role nothing', () => {
		expect(visibleIds(NO_MEMBERSHIP)).toEqual([]);
	});
});

describe('groupEventsByDay', () => {
	it('puts an event that runs past midnight on the day it starts', () => {
		const late = makeEvent({
			id: 'late',
			startsAt: '2026-02-12T22:00:00Z',
			endsAt: '2026-02-13T00:30:00Z'
		});
		const next = makeEvent({ id: 'next', startsAt: '2026-02-13T08:00:00Z' });

		const groups = groupEventsByDay([late, next], GENEVA);

		expect(groups.map((group) => group.day)).toEqual(['2026-02-12', '2026-02-13']);
		expect(groups[0].items.map((event) => event.id)).toEqual(['late']);
	});

	it('reads the day in the conference timezone, not in UTC', () => {
		// 23:30 UTC on the 12th is already 00:30 on the 13th in Geneva.
		const event = makeEvent({ startsAt: '2026-02-12T23:30:00Z', endsAt: '2026-02-13T00:30:00Z' });

		expect(groupEventsByDay([event], GENEVA)[0].day).toBe('2026-02-13');
	});
});

describe('nextEvent', () => {
	const now = new Date('2026-02-12T10:00:00Z');

	it('picks the soonest event that has not started', () => {
		const events = [
			makeEvent({ id: 'past', startsAt: '2026-02-12T09:00:00Z' }),
			makeEvent({ id: 'later', startsAt: '2026-02-12T15:00:00Z' }),
			makeEvent({ id: 'soon', startsAt: '2026-02-12T11:00:00Z' })
		];

		expect(nextEvent(events, now)?.id).toBe('soon');
	});

	it('is null when everything has started', () => {
		expect(nextEvent([makeEvent({ startsAt: '2026-02-12T09:00:00Z' })], now)).toBeNull();
	});
});

describe('formatEventTime', () => {
	it('writes a range within one day', () => {
		expect(formatEventTime(makeEvent(), GENEVA)).toBe('09:00 – 10:00');
	});

	it('says when the end is on the next day', () => {
		const late = makeEvent({ startsAt: '2026-02-12T22:00:00Z', endsAt: '2026-02-13T00:30:00Z' });

		expect(formatEventTime(late, GENEVA)).toBe('23:00 → 01:30 (next day)');
	});

	it('names the day of an end further away', () => {
		const long = makeEvent({ startsAt: '2026-02-12T22:00:00Z', endsAt: '2026-02-14T08:00:00Z' });

		expect(formatEventTime(long, GENEVA)).toBe('23:00 → 09:00 (Sat 14 Feb)');
	});
});

describe('audienceBadgeLabel', () => {
	it('names a committee event by its abbreviation', () => {
		const event = makeEvent({
			audience: 'committee',
			committeeId: 'unsc',
			committeeAbbreviation: 'UNSC'
		});

		expect(audienceBadgeLabel(event)).toBe('UNSC');
	});

	it('names a staff event "Staff"', () => {
		expect(audienceBadgeLabel(makeEvent({ audience: 'staff' }))).toBe('Staff');
	});
});

describe('day labels', () => {
	it('writes a tab as the weekday, day and month', () => {
		expect(dayTabLabel('2026-02-12')).toBe('Thu 12 Feb');
	});

	it('adds days across the end of a month', () => {
		expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
	});
});

describe('scheduleDays', () => {
	it('has a tab for every conference day and for any other day with events', () => {
		const events = [
			makeEvent({ startsAt: '2026-02-12T08:00:00Z' }),
			makeEvent({ startsAt: '2026-02-12T10:00:00Z' }),
			makeEvent({ startsAt: '2026-02-15T08:00:00Z' })
		];

		expect(scheduleDays('2026-02-12', '2026-02-13', events, GENEVA)).toEqual([
			{ day: '2026-02-12', count: 2, isOutsideDates: false },
			{ day: '2026-02-13', count: 0, isOutsideDates: false },
			{ day: '2026-02-15', count: 1, isOutsideDates: true }
		]);
	});
});

describe('pickScheduleDay', () => {
	const days = scheduleDays('2026-02-12', '2026-02-14', [], GENEVA);

	it('opens the requested day when it is a tab', () => {
		expect(pickScheduleDay('2026-02-13', days, '2026-01-01', '2026-02-12', '2026-02-14')).toBe(
			'2026-02-13'
		);
	});

	it('opens today while the conference is on', () => {
		expect(pickScheduleDay(null, days, '2026-02-14', '2026-02-12', '2026-02-14')).toBe(
			'2026-02-14'
		);
	});

	it('opens the first day otherwise, including for a day that is not a tab', () => {
		expect(pickScheduleDay('2027-01-01', days, '2026-01-01', '2026-02-12', '2026-02-14')).toBe(
			'2026-02-12'
		);
	});
});

describe('isHappeningNow', () => {
	// The event runs from 08:00 to 09:00 UTC.
	it('is true from the moment an event starts until the moment it ends', () => {
		expect(isHappeningNow(makeEvent(), new Date('2026-02-12T08:00:00Z'))).toBe(true);
		expect(isHappeningNow(makeEvent(), new Date('2026-02-12T08:59:00Z'))).toBe(true);
	});

	it('is false before the start and from the end on', () => {
		expect(isHappeningNow(makeEvent(), new Date('2026-02-12T07:59:00Z'))).toBe(false);
		expect(isHappeningNow(makeEvent(), new Date('2026-02-12T09:00:00Z'))).toBe(false);
	});
});

describe('eventsOnDay', () => {
	it('keeps the events that start on one day', () => {
		const events = [
			makeEvent({ id: 'a' }),
			makeEvent({ id: 'b', startsAt: '2026-02-13T08:00:00Z' })
		];

		expect(eventsOnDay(events, '2026-02-13', GENEVA).map((event) => event.id)).toEqual(['b']);
	});
});

describe('shiftByDays', () => {
	it('keeps the wall-clock time across a change to summer time', () => {
		// Clocks in Geneva go forward on 29 March 2026, so 09:00 moves from 08:00 to 07:00 UTC.
		expect(shiftByDays('2026-03-28T08:00:00Z', 1, GENEVA)).toBe('2026-03-29T07:00:00.000Z');
	});
});

describe('willNotifyAudience', () => {
	const now = new Date('2026-02-12T08:00:00Z');
	const soon = { startsAt: '2026-02-12T10:00:00Z', endsAt: '2026-02-12T11:00:00Z', location: 'A' };

	it('is true for a change of room within the next day', () => {
		expect(willNotifyAudience(soon, { ...soon, location: 'B' }, now)).toBe(true);
	});

	it('is false when nothing it watches has changed', () => {
		expect(willNotifyAudience(soon, { ...soon }, now)).toBe(false);
	});

	it('is false for a change to an event a week away', () => {
		const later = { ...soon, startsAt: '2026-02-19T10:00:00Z', endsAt: '2026-02-19T11:00:00Z' };

		expect(willNotifyAudience(later, { ...later, location: 'B' }, now)).toBe(false);
	});

	it('is true when an event moves into the next day', () => {
		const later = { ...soon, startsAt: '2026-02-19T10:00:00Z', endsAt: '2026-02-19T11:00:00Z' };

		expect(willNotifyAudience(later, soon, now)).toBe(true);
	});
});

describe('collectMemberships', () => {
	it('makes one membership per conference out of seats, delegations, staff rows and chairs', () => {
		const memberships = collectMemberships({
			seats: [{ conferenceId: 'geneva', committeeId: 'unsc' }],
			delegationConferenceIds: ['delft'],
			staffRows: [
				{ conferenceId: 'oslo', isAdministrator: false },
				{ conferenceId: 'rome', isAdministrator: true }
			],
			chairedCommittees: [{ conferenceId: 'oslo', committeeId: 'disec' }]
		});

		expect(memberships.get('geneva')).toEqual({ ...DELEGATE_IN_UNSC });
		expect(memberships.get('delft')).toEqual({ ...NO_MEMBERSHIP, isParticipant: true });
		expect(memberships.get('oslo')).toEqual({ ...CHAIR_OF_UNSC, committeeIds: ['disec'] });
		expect(memberships.get('rome')).toEqual({ ...ORGANISER, isStaff: true });
	});
});

describe('audience badges', () => {
	it('shows a delegate the committee and staff badges only, and staff every badge', () => {
		const everyone = makeEvent({ audience: 'everyone' });
		const staff = makeEvent({ audience: 'staff' });

		expect(showsAudienceBadge(everyone, false)).toBe(false);
		expect(showsAudienceBadge(staff, false)).toBe(true);
		expect(showsAudienceBadge(everyone, true)).toBe(true);
	});
});

describe('isConferenceMember', () => {
	it('is false for somebody with no role at the conference', () => {
		expect(isConferenceMember(NO_MEMBERSHIP)).toBe(false);
	});

	it('is true for an organiser, a participant or a member of staff', () => {
		expect(isConferenceMember({ ...NO_MEMBERSHIP, isOrganiser: true })).toBe(true);
		expect(isConferenceMember({ ...NO_MEMBERSHIP, isParticipant: true })).toBe(true);
		expect(isConferenceMember({ ...NO_MEMBERSHIP, isStaff: true })).toBe(true);
	});
});

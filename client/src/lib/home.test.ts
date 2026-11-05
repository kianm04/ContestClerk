import { describe, expect, it } from 'vitest';
import type {
	ApplicationListConference,
	ApplicationListEntry,
	MyApplicationListItem,
	MyDelegationListItem
} from './applications';
import {
	eventWhen,
	EXPLORE_CONFERENCE_LIMIT,
	greeting,
	homeApplicationHref,
	homeApplicationLine,
	MY_APPLICATION_LIMIT,
	UPCOMING_EVENT_LIMIT,
	type UpcomingEvent
} from './home';

describe('greeting', () => {
	it('greets the morning at midnight', () => {
		expect(greeting(0, 'Daniel Perez')).toBe('Good morning, Daniel.');
	});

	it('greets the morning in the last hour before noon', () => {
		expect(greeting(11, 'Daniel Perez')).toBe('Good morning, Daniel.');
	});

	it('greets the afternoon from noon', () => {
		expect(greeting(12, 'Daniel Perez')).toBe('Good afternoon, Daniel.');
	});

	it('greets the afternoon in the last hour before six', () => {
		expect(greeting(17, 'Daniel Perez')).toBe('Good afternoon, Daniel.');
	});

	it('greets the evening from six', () => {
		expect(greeting(18, 'Daniel Perez')).toBe('Good evening, Daniel.');
	});

	it('greets the evening in the last hour of the day', () => {
		expect(greeting(23, 'Daniel Perez')).toBe('Good evening, Daniel.');
	});

	it('uses only the first word of a long name', () => {
		expect(greeting(9, 'Daniel Perez de la Cruz')).toBe('Good morning, Daniel.');
	});

	it('leaves out the name and the comma when the account has no name yet', () => {
		expect(greeting(13, '')).toBe('Good afternoon.');
	});
});

describe('the section limits', () => {
	it('shows three conferences to explore, three applications and five events', () => {
		expect(EXPLORE_CONFERENCE_LIMIT).toBe(3);
		expect(MY_APPLICATION_LIMIT).toBe(3);
		expect(UPCOMING_EVENT_LIMIT).toBe(5);
	});
});

/** A moment in the middle of a day, which every event below is written against. */
const NOW = new Date('2026-09-17T12:00:00Z');

/** One event on the dashboard's list, in a timezone two hours ahead of UTC. */
function makeEvent(overrides: Partial<UpcomingEvent> = {}): UpcomingEvent {
	return {
		id: 'event-1',
		title: 'Opening ceremony',
		startsAt: '2026-09-17T11:30:00Z',
		endsAt: '2026-09-17T13:00:00Z',
		location: 'Main hall',
		conferenceName: 'DelftMUN 2026',
		conferenceSlug: 'delftmun-2026',
		conferenceTimezone: 'Europe/Amsterdam',
		...overrides
	};
}

describe('eventWhen', () => {
	it('names the day and the time in the conference’s own timezone', () => {
		// 11:30 UTC is 13:30 in Amsterdam in September, which is the time the
		// programme says and the time the reader should see.
		expect(eventWhen(makeEvent(), NOW)).toBe('Today · 13:30 – 15:00');
	});

	it('says "Tomorrow" for the next day', () => {
		const event = makeEvent({
			startsAt: '2026-09-18T07:00:00Z',
			endsAt: '2026-09-18T08:30:00Z'
		});

		expect(eventWhen(event, NOW)).toBe('Tomorrow · 09:00 – 10:30');
	});

	it('writes the date out once the event is further off', () => {
		const event = makeEvent({
			startsAt: '2026-11-20T08:00:00Z',
			endsAt: '2026-11-20T09:00:00Z'
		});

		expect(eventWhen(event, NOW)).toBe('20 Nov 2026 · 09:00 – 10:00');
	});

	it('counts the day in the conference’s timezone and not the reader’s', () => {
		// 23:30 UTC on the 17th is half past one in the morning of the 18th in
		// Amsterdam, so the conference calls this one tomorrow.
		const event = makeEvent({
			startsAt: '2026-09-17T23:30:00Z',
			endsAt: '2026-09-18T00:30:00Z'
		});

		expect(eventWhen(event, NOW)).toBe('Tomorrow · 01:30 – 02:30');
	});
});

/** The conference an application row or a delegation row names. */
function makeApplicationConference(
	overrides: Partial<ApplicationListConference> = {}
): ApplicationListConference {
	return {
		id: 'conference-1',
		slug: 'delftmun-2026',
		name: 'DelftMUN 2026',
		organizationName: 'Delft MUN Society',
		logoPath: null,
		bannerPath: null,
		startDate: '2026-11-20',
		endDate: '2026-11-22',
		timezone: 'Europe/Amsterdam',
		isArchived: false,
		applicationsCloseAt: '2026-10-01T22:00:00Z',
		city: 'Delft',
		venueName: null,
		locationMode: 'in_person',
		...overrides
	};
}

/** One application of the reader's own, as an entry on the merged list. */
function makeApplicationEntry(
	overrides: Partial<MyApplicationListItem> = {}
): ApplicationListEntry {
	const application: MyApplicationListItem = {
		id: 'application-1',
		status: 'submitted',
		submittedAt: '2026-09-08T09:00:00Z',
		updatedAt: '2026-09-08T09:00:00Z',
		conference: makeApplicationConference(),
		seat: null,
		...overrides
	};

	return { kind: 'individual', id: application.id, application };
}

/** One delegation the reader belongs to, as an entry on the same list. */
function makeDelegationEntry(overrides: Partial<MyDelegationListItem> = {}): ApplicationListEntry {
	const membership: MyDelegationListItem = {
		id: 'delegation-1',
		name: 'LSE Team',
		status: 'accepted',
		conference: makeApplicationConference(),
		seat: null,
		...overrides
	};

	return { kind: 'delegation', id: membership.id, membership };
}

describe('the "Applications" row helpers', () => {
	it('dates an application of the reader’s own by when they submitted it', () => {
		expect(homeApplicationLine(makeApplicationEntry(), NOW)).toBe('Submitted 8 Sept 2026');
	});

	it('names the delegation on a delegation row', () => {
		expect(homeApplicationLine(makeDelegationEntry(), NOW)).toBe('Delegation · LSE Team');
	});

	it('sends each kind of row to its own page', () => {
		expect(homeApplicationHref(makeApplicationEntry())).toBe('/applications/application-1');
		expect(homeApplicationHref(makeDelegationEntry())).toBe('/delegations/delegation-1');
	});
});

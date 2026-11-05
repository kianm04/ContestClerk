import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in event below is exactly the shape `load` is given.
import type { PageServerLoadEvent } from './$types';
// The real rules, not copies of them: renaming a field or changing who counts
// as "for this reader" in `$lib/schedule.ts` has to fail here too.
import { NO_MEMBERSHIP, type AudienceMembership, type ScheduleEvent } from '$lib/schedule';
import { roomLink, type RoomLink, type ScheduleRoom } from '$lib/schedule-rooms';
import { loginUrl } from '$lib/urls';
import type { Conference } from '$lib/conferences';

// The two queries that decide who this reader is, and the three that decide
// what they see, are all stood in for, so these tests are about the choice
// `load` itself makes between them. What the database allows is tested in
// `tests/db/`.
//
// `$lib/schedule` is deliberately not stood in for: `eventsForAudience`,
// `eventsOnDay`, `scheduleDays` and `pickScheduleDay` are pure, and running the
// real ones is what proves this page agrees with them about which events and
// which day tab a reader with a given membership sees.
vi.mock('$lib/server/conferences', () => ({ getConferenceBySlug: vi.fn() }));

vi.mock('$lib/server/schedule', () => ({
	listPublicProgramme: vi.fn(),
	listScheduleEvents: vi.fn(),
	readMyMembership: vi.fn(),
	readSchedulePublicity: vi.fn()
}));

// The reader's committees are stood in for too; `$lib/schedule-rooms`, which
// picks the ones to link, runs for real.
vi.mock('$lib/server/schedule-rooms', () => ({ readMyRooms: vi.fn() }));

// The reader's conferences, for the "Switch conference" menu.
vi.mock('$lib/server/my-conferences', () => ({ listMyConferences: vi.fn() }));

import { getConferenceBySlug } from '$lib/server/conferences';
import { listMyConferences } from '$lib/server/my-conferences';
import { readMyRooms } from '$lib/server/schedule-rooms';
import {
	listPublicProgramme,
	listScheduleEvents,
	readMyMembership,
	readSchedulePublicity
} from '$lib/server/schedule';

/** The Supabase client. `load` only hands it on. */
const SUPABASE = {};

/** The conference every test reads, three days in January 2027. */
const CONFERENCE = {
	id: 'conf-1',
	slug: 'riverside-mun-2027',
	name: 'Riverside MUN 2027',
	timezone: 'Europe/Amsterdam',
	startDate: '2027-01-22',
	endDate: '2027-01-24'
} as unknown as Conference;

/** For everybody taking part or on the staff, on the conference's first day. */
const EVENT_EVERYONE: ScheduleEvent = {
	id: 'event-everyone',
	conferenceId: CONFERENCE.id,
	title: 'Opening Ceremony',
	description: null,
	location: 'Main Hall',
	startsAt: '2027-01-22T08:00:00.000Z',
	endsAt: '2027-01-22T09:00:00.000Z',
	audience: 'everyone',
	committeeId: null,
	committeeAbbreviation: null
};

/** For the staff only, the same day. */
const EVENT_STAFF: ScheduleEvent = {
	id: 'event-staff',
	conferenceId: CONFERENCE.id,
	title: 'Chair Briefing',
	description: null,
	location: 'Green Room',
	startsAt: '2027-01-22T07:00:00.000Z',
	endsAt: '2027-01-22T07:30:00.000Z',
	audience: 'staff',
	committeeId: null,
	committeeAbbreviation: null
};

/** For delegates only, the conference's second day. */
const EVENT_DELEGATES: ScheduleEvent = {
	id: 'event-delegates',
	conferenceId: CONFERENCE.id,
	title: 'Delegate Social',
	description: null,
	location: 'Rooftop Terrace',
	startsAt: '2027-01-23T18:00:00.000Z',
	endsAt: '2027-01-23T20:00:00.000Z',
	audience: 'delegates',
	committeeId: null,
	committeeAbbreviation: null
};

/** A session of the committee the reader chairs, on the conference's second day. */
const EVENT_COMMITTEE: ScheduleEvent = {
	id: 'event-committee',
	conferenceId: CONFERENCE.id,
	title: 'Session II',
	description: null,
	location: 'Committee Room 1',
	startsAt: '2027-01-23T09:00:00.000Z',
	endsAt: '2027-01-23T11:00:00.000Z',
	audience: 'committee',
	committeeId: 'committee-unsc',
	committeeAbbreviation: 'UNSC'
};

/** The committee the reader chairs at this conference. */
const CHAIRED_ROOM: ScheduleRoom = {
	committeeId: 'committee-unsc',
	heading: 'UNSC',
	committeeSlug: 'unsc',
	conference: {
		id: CONFERENCE.id,
		slug: CONFERENCE.slug,
		name: CONFERENCE.name,
		startDate: '2027-01-22',
		endDate: '2027-01-24',
		timezone: 'Europe/Amsterdam'
	},
	isChair: true
};

/** A delegate: taking part, but not staff. */
const DELEGATE_MEMBERSHIP: AudienceMembership = {
	isOrganiser: false,
	isParticipant: true,
	isStaff: false,
	committeeIds: []
};

/** A chair or volunteer: staff, but not taking part as a delegate. */
const STAFF_MEMBERSHIP: AudienceMembership = {
	isOrganiser: false,
	isParticipant: false,
	isStaff: true,
	committeeIds: []
};

/** Somebody with no role here at all: a stranger to the conference. */
const NON_MEMBER: AudienceMembership = NO_MEMBERSHIP;

/**
 * The few pieces of a request that `load` here actually reads.
 *
 * `claims` is what `getVerifiedClaims` answers: the signed-in account's claims,
 * or `null` for a visitor. SvelteKit hands `load` a great many more properties
 * than these, so the cast says "this is enough"; anything the code reaches for
 * that is missing fails the test loudly.
 */
function makeLoadEvent(search: string = '', claims: unknown = null): PageServerLoadEvent {
	return {
		params: { slug: CONFERENCE.slug },
		url: new URL(`http://localhost/conferences/${CONFERENCE.slug}/schedule${search}`),
		locals: { supabase: SUPABASE, getVerifiedClaims: async () => claims }
	} as unknown as PageServerLoadEvent;
}

/**
 * Run something that is expected to redirect, and give back the redirect.
 *
 * SvelteKit's `redirect` works by throwing rather than by returning, so
 * catching it is the only way to see where it was sending the reader.
 */
async function catchRedirect(run: () => unknown): Promise<{ status: number; location: string }> {
	try {
		await run();
	} catch (thrown) {
		return thrown as { status: number; location: string };
	}

	throw new Error('Nothing was thrown, so nothing redirected.');
}

/** What `load` answered, as much of it as these tests look at. */
type LoadedProgramme = {
	activeDay: string;
	today: string;
	myConferences: { slug: string }[];
	events: ScheduleEvent[];
	isList: boolean;
	openEventId: string | null;
	hasEvents: boolean;
	showsEveryAudience: boolean;
	yourRooms: RoomLink[];
	eventRoomLinks: Record<string, RoomLink>;
};

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(getConferenceBySlug).mockResolvedValue(CONFERENCE);
	vi.mocked(readMyMembership).mockResolvedValue(DELEGATE_MEMBERSHIP);
	vi.mocked(listScheduleEvents).mockResolvedValue([EVENT_STAFF, EVENT_EVERYONE, EVENT_DELEGATES]);
	vi.mocked(listPublicProgramme).mockResolvedValue([]);
	vi.mocked(readSchedulePublicity).mockResolvedValue(false);
	vi.mocked(readMyRooms).mockResolvedValue([]);
	vi.mocked(listMyConferences).mockResolvedValue([CONFERENCE]);
});

afterEach(() => {
	vi.useRealTimers();
});

describe('load', () => {
	it('answers 404 when there is no conference of this slug', async () => {
		vi.mocked(getConferenceBySlug).mockResolvedValue(null);

		await expect(load(makeLoadEvent())).rejects.toMatchObject({ status: 404 });
		expect(readMyMembership).not.toHaveBeenCalled();
	});

	it('shows a member every event their own membership lets through, and excludes the rest', async () => {
		const result = (await load(
			makeLoadEvent('?day=2027-01-22', { sub: 'user-1' })
		)) as LoadedProgramme;

		// A delegate sees the `everyone` and `delegates` events but not the
		// staff-only one, which falls on the same day.
		expect(result.events).toEqual([EVENT_EVERYONE, EVENT_DELEGATES]);
		expect(result.hasEvents).toBe(true);
	});

	it('shows staff and organisers an audience badge on every event', async () => {
		vi.mocked(readMyMembership).mockResolvedValue(STAFF_MEMBERSHIP);

		const result = (await load(makeLoadEvent('', { sub: 'user-1' }))) as LoadedProgramme;

		expect(result.showsEveryAudience).toBe(true);
	});

	it('does not badge every event for a delegate, who is not staff', async () => {
		const result = (await load(makeLoadEvent('', { sub: 'user-1' }))) as LoadedProgramme;

		expect(result.showsEveryAudience).toBe(false);
	});

	it('gives a non-member the public programme while it is shown publicly', async () => {
		vi.mocked(readMyMembership).mockResolvedValue(NON_MEMBER);
		vi.mocked(readSchedulePublicity).mockResolvedValue(true);
		vi.mocked(listPublicProgramme).mockResolvedValue([EVENT_EVERYONE]);

		// A signed-out visitor: `load` never even asks who they are a member of.
		const result = (await load(makeLoadEvent())) as LoadedProgramme;

		expect(listPublicProgramme).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id);
		expect(readMyMembership).not.toHaveBeenCalled();
		expect(result.hasEvents).toBe(true);
	});

	it('sends a signed-out visitor to sign in when the programme is private', async () => {
		vi.mocked(readSchedulePublicity).mockResolvedValue(false);

		const redirect = await catchRedirect(() => load(makeLoadEvent('?day=2027-01-22')));

		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(
			loginUrl(`/conferences/${CONFERENCE.slug}/schedule?day=2027-01-22`)
		);
	});

	it('answers 404 for somebody signed in who is not a member, while the programme is private', async () => {
		vi.mocked(readMyMembership).mockResolvedValue(NON_MEMBER);
		vi.mocked(readSchedulePublicity).mockResolvedValue(false);

		await expect(load(makeLoadEvent('', { sub: 'user-1' }))).rejects.toMatchObject({
			status: 404
		});
	});

	it('picks the day ?day= names, for the one column a phone shows', async () => {
		const result = (await load(
			makeLoadEvent('?day=2027-01-23', { sub: 'user-1' })
		)) as LoadedProgramme;

		expect(result.activeDay).toBe('2027-01-23');
	});

	it('opens the details of an event the reader can see, and of no other', async () => {
		const open = (await load(
			makeLoadEvent(`?event=${EVENT_EVERYONE.id}`, { sub: 'user-1' })
		)) as LoadedProgramme;
		const hidden = (await load(
			makeLoadEvent(`?event=${EVENT_STAFF.id}`, { sub: 'user-1' })
		)) as LoadedProgramme;

		expect(open.openEventId).toBe(EVENT_EVERYONE.id);
		expect(hidden.openEventId).toBeNull();
	});

	it('shows the list only when ?view=list asks for it', async () => {
		const calendar = (await load(makeLoadEvent('', { sub: 'user-1' }))) as LoadedProgramme;
		const list = (await load(makeLoadEvent('?view=list', { sub: 'user-1' }))) as LoadedProgramme;

		expect(calendar.isList).toBe(false);
		expect(list.isList).toBe(true);
	});

	it('says there are no events when the conference has none this reader may see', async () => {
		vi.mocked(listScheduleEvents).mockResolvedValue([]);

		const result = (await load(makeLoadEvent('', { sub: 'user-1' }))) as LoadedProgramme;

		expect(result.hasEvents).toBe(false);
	});

	it('gives a chair "Your room" and a link on their committee\'s event, on a day of the conference', async () => {
		// Midday in Amsterdam on the conference's second day.
		vi.useFakeTimers({ now: new Date('2027-01-23T11:00:00.000Z'), toFake: ['Date'] });
		// A chair is staff, and the committee they chair is theirs on the programme.
		vi.mocked(readMyMembership).mockResolvedValue({
			...STAFF_MEMBERSHIP,
			committeeIds: ['committee-unsc']
		});
		vi.mocked(listScheduleEvents).mockResolvedValue([EVENT_COMMITTEE, EVENT_DELEGATES]);
		vi.mocked(readMyRooms).mockResolvedValue([
			CHAIRED_ROOM,
			{
				...CHAIRED_ROOM,
				committeeId: 'committee-elsewhere',
				conference: { ...CHAIRED_ROOM.conference, id: 'conf-2' }
			}
		]);

		const result = (await load(makeLoadEvent('', { sub: 'user-1' }))) as LoadedProgramme;

		expect(result.activeDay).toBe('2027-01-23');
		expect(result.yourRooms).toEqual([roomLink(CHAIRED_ROOM)]);
		expect(result.eventRoomLinks).toEqual({ 'event-committee': roomLink(CHAIRED_ROOM) });
	});

	it('gives "Your room" for today whichever day is open, and none before the conference', async () => {
		vi.useFakeTimers({ now: new Date('2027-01-23T11:00:00.000Z'), toFake: ['Date'] });
		vi.mocked(readMyRooms).mockResolvedValue([CHAIRED_ROOM]);

		// The calendar shows the whole conference at once, so the room is today's
		// even while a phone has tomorrow open.
		const tomorrow = (await load(
			makeLoadEvent('?day=2027-01-24', { sub: 'user-1' })
		)) as LoadedProgramme;
		expect(tomorrow.yourRooms).toEqual([roomLink(CHAIRED_ROOM)]);

		vi.setSystemTime(new Date('2027-01-18T11:00:00.000Z'));
		const fourDaysBefore = (await load(makeLoadEvent('', { sub: 'user-1' }))) as LoadedProgramme;
		expect(fourDaysBefore.activeDay).toBe('2027-01-22');
		expect(fourDaysBefore.yourRooms).toEqual([]);
	});

	it('reads no rooms and no conferences for a visitor', async () => {
		vi.mocked(readSchedulePublicity).mockResolvedValue(true);
		vi.mocked(listPublicProgramme).mockResolvedValue([EVENT_EVERYONE]);

		const result = (await load(makeLoadEvent())) as LoadedProgramme;

		expect(readMyRooms).not.toHaveBeenCalled();
		expect(listMyConferences).not.toHaveBeenCalled();
		expect(result.yourRooms).toEqual([]);
		expect(result.myConferences).toEqual([]);
	});

	it('names today in the conference timezone', async () => {
		// Midday in Amsterdam on the conference's second day.
		vi.useFakeTimers({ now: new Date('2027-01-23T11:00:00.000Z'), toFake: ['Date'] });

		const result = (await load(makeLoadEvent('', { sub: 'user-1' }))) as LoadedProgramme;

		expect(result.today).toBe('2027-01-23');
	});

	it("hands on the reader's conferences, for the switch menu", async () => {
		const other = { ...CONFERENCE, id: 'conf-2', slug: 'harbour-mun-2027' };
		vi.mocked(listMyConferences).mockResolvedValue([CONFERENCE, other]);

		const result = (await load(makeLoadEvent('', { sub: 'user-1' }))) as LoadedProgramme;

		expect(listMyConferences).toHaveBeenCalledWith(SUPABASE, 'user-1');
		expect(result.myConferences.map((conference) => conference.slug)).toEqual([
			'riverside-mun-2027',
			'harbour-mun-2027'
		]);
	});
});

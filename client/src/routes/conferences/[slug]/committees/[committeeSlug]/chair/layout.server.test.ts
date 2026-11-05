import { error } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { load } from './+layout.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in event below is exactly the shape this `load` is given.
import type { LayoutServerLoadEvent } from './$types';
import type { ChairCommittee, ChairRoomFrame } from '$lib/chair-room';
import type { Conference } from '$lib/conferences';

// The gate and the room lookup are both stood in for, so these tests are about
// the three things this `load` itself decides: which slug and committee slug
// it checks the reader against, what it asks the room for, and what it hands
// down to every chair page underneath. `requireCommitteePermission` has its own tests in
// `src/lib/server/access`, and `getChairRoomFrame` and `isNamedChair` have
// theirs in `src/lib/server/committee-room.test.ts`.
vi.mock('$lib/server/access', () => ({
	requireCommitteePermission: vi.fn()
}));
vi.mock('$lib/server/my-permissions', () => ({ readMyPermissions: vi.fn() }));

vi.mock('$lib/server/committee-room', () => ({
	getChairRoomFrame: vi.fn(),
	getConsoleFacts: vi.fn(),
	isNamedChair: vi.fn()
}));

// Whether the committee is a quick session's (`room-screens.test.ts` tests the read).
vi.mock('$lib/server/room-screens', () => ({ readIsQuickSession: vi.fn() }));

import { requireCommitteePermission } from '$lib/server/access';
import { getChairRoomFrame, getConsoleFacts, isNamedChair } from '$lib/server/committee-room';
import { readMyPermissions } from '$lib/server/my-permissions';
import { readIsQuickSession } from '$lib/server/room-screens';
import { NO_PERMISSIONS } from '$lib/permissions';

/** The Supabase client. `load` only hands it on to the two stood-in lookups. */
const SUPABASE = {};

/** The signed-in visitor `requireCommitteePermission` answers with. */
const SIGNED_IN_USER = { id: 'user-1', email: 'amira@example.com' };

/**
 * The conference the committee belongs to. `requireCommitteePermission` reads a whole
 * `Conference`, but this `load` only forwards the four fields the chair pages
 * need, checked in the "hands ... to every page below" test.
 */
const CONFERENCE: Conference = {
	id: 'conference-1',
	slug: 'thimun-2027',
	name: 'THIMUN 2027',
	description: null,
	organizationName: 'THIMUN Foundation',
	organizationSlug: 'thimun-foundation',
	city: 'The Hague',
	countryCode: 'NL',
	countryName: 'Netherlands',
	locationMode: 'in_person',
	venueStatus: 'tba',
	conferenceTimeStatus: 'tba',
	startTime: null,
	endTime: null,
	feeStatus: 'undecided',
	applicationOpenMode: 'on_publish',
	startDate: '2027-01-25',
	endDate: '2027-01-29',
	websiteUrl: null,
	bannerPath: null,
	logoPath: null,
	level: 'high_school',
	status: 'published',
	timezone: 'Europe/Amsterdam',
	expectedDelegates: null,
	applicationsOpenAt: null,
	applicationsCloseAt: null,
	committeeCount: 1,
	committeeNames: [],
	tagline: null,
	venueName: null,
	venueAddress: null,
	contactEmail: null,
	instagramUrl: null,
	contactPhone: null,
	facebookUrl: null,
	linkedinUrl: null,
	youtubeUrl: null,
	tiktokUrl: null,
	language: 'English',
	minAge: null,
	maxAge: null,
	positionPaperRequired: false,
	positionPaperDeadline: null,
	acceptsIndividualApplications: true,
	acceptsDelegations: true
};

const COMMITTEE: ChairCommittee = {
	id: 'committee-1',
	slug: 'unsc',
	name: 'Security Council',
	abbreviation: 'UNSC',
	room: 'Room 1',
	defaultSpeakingTimeSeconds: 60,
	topics: ['Climate finance']
};

/** The room's frame, exactly as `getChairRoomFrame` would hand it back. */
const FRAME: ChairRoomFrame = {
	committeeState: {
		currentSessionId: null,
		mode: 'idle',
		currentMotionId: null,
		activeSpeakersListId: null,
		currentSpeakerEntryId: null,
		currentVoteId: null,
		agendaTopic: null,
		timer: { totalSeconds: null, endsAt: null, pausedRemainingSeconds: null }
	},
	sessions: [],
	currentSession: null,
	currentMotion: null,
	seats: [],
	attendance: {},
	latestRollCallId: null
};

/** What the console's frame reads besides the room, as `getConsoleFacts` would hand it back. */
const CONSOLE_FACTS = {
	motionsOnFloorCount: 2,
	hasAnyoneSpoken: false,
	liveList: { speakersList: null, speakers: [] },
	generalSpeakersListId: null
};

/**
 * The few pieces of a page visit that this `load` actually reads.
 *
 * SvelteKit hands it a great many more, so the cast says "this is enough";
 * anything the code reaches for that is missing fails the test loudly.
 * `search` is the address's query, such as `?end=confirm`.
 */
function makeLoadEvent(search = ''): LayoutServerLoadEvent {
	return {
		params: { slug: CONFERENCE.slug, committeeSlug: COMMITTEE.slug },
		url: new URL(
			`http://localhost/conferences/${CONFERENCE.slug}/committees/${COMMITTEE.slug}/chair${search}`
		),
		locals: { supabase: SUPABASE },
		depends: vi.fn()
	} as unknown as LayoutServerLoadEvent;
}

/**
 * The 404 `requireCommitteePermission` throws at a signed-in person who may not run this
 * room.
 *
 * SvelteKit's `error` works by throwing rather than by returning, so catching
 * one here is the only way to get hold of it to throw again.
 */
function notFound(): unknown {
	try {
		error(404, 'Not found');
	} catch (thrown) {
		return thrown;
	}

	throw new Error('Nothing was thrown, so there is no 404 to hand on.');
}

/**
 * Run something that is expected to throw, and give back what it threw.
 *
 * SvelteKit says "you may not see this page" by throwing rather than by
 * returning, so catching it is the only way to read the status back.
 */
async function catchThrown(run: () => unknown): Promise<{ status: number }> {
	try {
		await run();
	} catch (thrown) {
		return thrown as { status: number };
	}

	throw new Error('Nothing was thrown, so nothing was refused.');
}

/** What `load` answered, as much of it as these tests look at. */
type LoadedChairRoom = {
	isOrganiser: boolean;
	isNamedChair: boolean;
	today: string;
};

beforeEach(() => {
	vi.mocked(requireCommitteePermission).mockResolvedValue({
		user: SIGNED_IN_USER,
		conference: CONFERENCE,
		committee: COMMITTEE
	});
	vi.mocked(getChairRoomFrame).mockResolvedValue(FRAME);
	vi.mocked(getConsoleFacts).mockResolvedValue(CONSOLE_FACTS);
	vi.mocked(isNamedChair).mockResolvedValue(true);
	vi.mocked(readMyPermissions).mockResolvedValue(NO_PERMISSIONS);
	vi.mocked(readIsQuickSession).mockResolvedValue(false);
});

describe('load', () => {
	it('checks the chair or organiser gate for the slug and committee slug in the address', async () => {
		const event = makeLoadEvent();

		await load(event);

		expect(requireCommitteePermission).toHaveBeenCalledWith(
			event.locals,
			event.url,
			CONFERENCE.slug,
			COMMITTEE.slug,
			'run_room'
		);
	});

	it('registers the room’s realtime dependency so a change invalidates this load', async () => {
		const event = makeLoadEvent();

		await load(event);

		expect(event.depends).toHaveBeenCalledWith(`committee-room:${COMMITTEE.id}`);
	});

	it('reads the room’s frame for the gate’s committee', async () => {
		await load(makeLoadEvent());

		expect(getChairRoomFrame).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id);
		expect(isNamedChair).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id, SIGNED_IN_USER.id);
		expect(readMyPermissions).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, SIGNED_IN_USER.id);
	});

	it("reads the console's facts for the frame's own state and seats", async () => {
		await load(makeLoadEvent());

		expect(getConsoleFacts).toHaveBeenCalledWith(SUPABASE, FRAME.committeeState, FRAME.seats);
	});

	it("opens End's confirmation and the agenda menu from the address, for a page without JavaScript", async () => {
		const plain = await load(makeLoadEvent());
		const confirming = await load(makeLoadEvent('?end=confirm'));
		const changingAgenda = await load(makeLoadEvent('?agenda=change'));

		expect(plain).toMatchObject({ isEndConfirmOpen: false, isAgendaMenuOpen: false });
		expect(confirming).toMatchObject({ isEndConfirmOpen: true, isAgendaMenuOpen: false });
		expect(changingAgenda).toMatchObject({ isEndConfirmOpen: false, isAgendaMenuOpen: true });
	});

	it('hands the conference, the committee and the room’s frame to every page below', async () => {
		// Only `Date` is faked, so the answer's `serverTime` is known in advance.
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-09-26T10:00:00.000Z'));

		const result = await load(makeLoadEvent());
		vi.useRealTimers();

		// Only these eight fields of the conference reach the chair pages; the
		// rest of `Conference` is for the public and organiser pages.
		expect(result).toEqual({
			conference: {
				id: CONFERENCE.id,
				slug: CONFERENCE.slug,
				name: CONFERENCE.name,
				timezone: CONFERENCE.timezone,
				startDate: CONFERENCE.startDate,
				endDate: CONFERENCE.endDate,
				positionPaperRequired: CONFERENCE.positionPaperRequired,
				positionPaperDeadline: CONFERENCE.positionPaperDeadline
			},
			committee: COMMITTEE,
			...FRAME,
			...CONSOLE_FACTS,
			isEndConfirmOpen: false,
			isAgendaMenuOpen: false,
			isOrganiser: false,
			isNamedChair: true,
			committeeTools: { mayReviewPapers: false, mayWriteNotes: false, mayProposeAwards: false },
			isQuickSession: false,
			today: '2026-09-26',
			readerId: SIGNED_IN_USER.id,
			serverTime: '2026-09-26T10:00:00.000Z'
		});
	});

	it('says whether the reader edits every committee and whether they are a named chair', async () => {
		vi.mocked(isNamedChair).mockResolvedValue(false);
		vi.mocked(readMyPermissions).mockResolvedValue({
			held: [{ permission: 'administrator', scope: 'conference' }],
			committeeIds: [],
			rank: 0
		});

		const result = (await load(makeLoadEvent())) as LoadedChairRoom;

		expect(result.isOrganiser).toBe(true);
		expect(result.isNamedChair).toBe(false);
	});

	it('offers a co-chair who only runs the room none of Papers, Notes and Awards', async () => {
		vi.mocked(readMyPermissions).mockResolvedValue({
			held: [{ permission: 'run_room', scope: 'committees' }],
			committeeIds: [COMMITTEE.id],
			rank: 3
		});

		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({
			isOrganiser: false,
			committeeTools: { mayReviewPapers: false, mayWriteNotes: false, mayProposeAwards: false }
		});
	});

	it('says whether the committee is a quick session’s, which has no Awards and can add topics', async () => {
		vi.mocked(readIsQuickSession).mockResolvedValue(true);

		const result = await load(makeLoadEvent());

		expect(readIsQuickSession).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id);
		expect(result).toMatchObject({ isQuickSession: true });
	});

	it("reads today in the conference's own timezone", async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		// 23:30 UTC on the 26th is already the 27th in Amsterdam.
		vi.setSystemTime(new Date('2026-09-26T23:30:00.000Z'));

		const result = (await load(makeLoadEvent())) as LoadedChairRoom;
		vi.useRealTimers();

		expect(result.today).toBe('2026-09-27');
	});

	it('lets a 404 through for somebody who may not run this room', async () => {
		vi.mocked(requireCommitteePermission).mockRejectedValue(notFound());

		const thrown = await catchThrown(() => load(makeLoadEvent()));

		expect(thrown.status).toBe(404);
		expect(getChairRoomFrame).not.toHaveBeenCalled();
	});
});

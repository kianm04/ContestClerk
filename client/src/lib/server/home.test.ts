import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	ApplicationListConference,
	MyApplicationListItem,
	MyDelegationListItem
} from '$lib/applications';
import type { Conference, ConferenceStatus } from '$lib/conferences';
import { EXPLORE_CONFERENCE_LIMIT, UPCOMING_EVENT_LIMIT } from '$lib/home';
import type { UpcomingConferenceCard } from '$lib/upcoming-conferences';
import { listMyApplications } from './applications';
import {
	countConferencesOpenForApplications,
	listConferencesToExplore,
	listManagedConferences
} from './conferences';
import { listMyDelegationMemberships } from './delegations';
import { hasConferenceRowEnded, loadHomeDashboard, readShowAll } from './home';
import { listHomeAnnouncements } from './home-announcements';
import { readChecklistCounts } from './manage';
import { readSeatsOnOffer } from './manage-list';

// These tests are about the decisions `loadHomeDashboard` makes: which rows it
// turns into a card or a task, which ones it leaves out, which lists it cuts,
// which questions it asks for which reader, and what it hands the lookups it
// calls. Nothing here talks to a database; the stand-in client below answers
// each table with whatever the test asked for. Whether the database lets
// somebody read those rows at all is Row Level Security's decision, and that is
// tested in `tests/db/`.
//
// `vi.mock` replaces six whole modules for this file, so the lookups they hold
// answer with what a test tells them to instead of building a query. What each
// of those puts in its own filters is tested in its own file.
vi.mock('./conferences', () => ({
	listManagedConferences: vi.fn(),
	listConferencesToExplore: vi.fn(),
	countConferencesOpenForApplications: vi.fn()
}));

vi.mock('./applications', () => ({ listMyApplications: vi.fn() }));

vi.mock('./delegations', () => ({ listMyDelegationMemberships: vi.fn() }));

vi.mock('./manage', () => ({ readChecklistCounts: vi.fn() }));

vi.mock('./manage-list', () => ({ readSeatsOnOffer: vi.fn() }));

vi.mock('./home-announcements', () => ({ listHomeAnnouncements: vi.fn() }));

/** The mocked lookups, typed so a test can say what they answer with. */
const managedConferencesLookup = vi.mocked(listManagedConferences);
const exploreConferencesLookup = vi.mocked(listConferencesToExplore);
const openConferenceCountLookup = vi.mocked(countConferencesOpenForApplications);
const applicationsLookup = vi.mocked(listMyApplications);
const delegationsLookup = vi.mocked(listMyDelegationMemberships);
const checklistCountsLookup = vi.mocked(readChecklistCounts);
const seatsOnOfferLookup = vi.mocked(readSeatsOnOffer);
const announcementsLookup = vi.mocked(listHomeAnnouncements);

/** A moment in the middle of a day. Nothing here depends on which one it is. */
const NOW = new Date('2026-09-17T12:00:00Z');

/** The signed-in person these tests are about. */
const USER_ID = 'user-1';

/** The page as it normally is, with no list's limit lifted. */
const SHOW_NOTHING_MORE = null;

/**
 * A conference with every field filled in, which the helper below copies.
 *
 * A `Conference` has a lot of fields and these tests only care about a few of
 * them, so this one sits here once rather than in every test.
 */
const SAMPLE_CONFERENCE: Conference = {
	id: 'conference-thimun',
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
	startDate: '2027-01-24',
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
	committeeCount: 8,
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

/** A conference that is `SAMPLE_CONFERENCE` apart from the fields a test names. */
function makeConference(overrides: Partial<Conference> = {}): Conference {
	return { ...SAMPLE_CONFERENCE, ...overrides };
}

/**
 * A draft with every required checklist item done, which the publish task
 * asks to be published and the hero counts as "5 of 5 setup steps done".
 */
const READY_DRAFT = makeConference({
	id: 'conference-draft',
	status: 'draft',
	description: 'A large conference in The Hague.',
	tagline: 'The Hague, every January.',
	bannerPath: 'conferences/thimun/banner.jpg',
	venueName: 'World Forum',
	contactEmail: 'team@thimun.example',
	applicationsOpenAt: '2026-09-30T22:00:00Z',
	applicationsCloseAt: '2026-12-01T22:00:00Z'
});

/** The checklist counts of a draft with committees, seats and a fee. */
const READY_DRAFT_COUNTS = {
	'conference-draft': {
		committeeCount: 8,
		committeesWithoutAvailableSeatsCount: 0,
		onlyCommitteeWithoutSeatsId: null,
		feeCount: 1,
		collectsPaymentsManually: false
	}
};

/** The conference an application row or a delegation row brings along. */
function makeApplicationConference(
	overrides: Partial<ApplicationListConference> = {}
): ApplicationListConference {
	return {
		id: 'conference-delft',
		slug: 'delftmun-2026',
		name: 'DelftMUN 2026',
		organizationName: 'Delft MUN Society',
		logoPath: null,
		bannerPath: null,
		startDate: '2026-11-20',
		endDate: '2026-11-22',
		timezone: 'Europe/Amsterdam',
		city: 'Delft',
		venueName: null,
		locationMode: 'in_person',
		isArchived: false,
		applicationsCloseAt: '2026-10-01T22:00:00Z',
		...overrides
	};
}

/** One application of the reader's own, as `listMyApplications` answers with it. */
function makeApplication(overrides: Partial<MyApplicationListItem> = {}): MyApplicationListItem {
	return {
		id: 'application-1',
		status: 'submitted',
		submittedAt: '2026-09-08T09:00:00Z',
		updatedAt: '2026-09-08T09:00:00Z',
		conference: makeApplicationConference(),
		seat: null,
		...overrides
	};
}

/** One delegation the reader belongs to, as `listMyDelegationMemberships` answers with it. */
function makeDelegationMembership(
	overrides: Partial<MyDelegationListItem> = {}
): MyDelegationListItem {
	return {
		id: 'delegation-1',
		name: 'LSE Team',
		status: 'accepted',
		conference: makeApplicationConference(),
		seat: null,
		...overrides
	};
}

/** The rows each table answers with, and which tables fail instead of answering. */
type StandInAnswers = {
	/** Keyed by table name. A table with no entry answers with no rows. */
	rows?: Record<string, unknown[]>;
	/**
	 * The rows the *second* query of a table answers with.
	 *
	 * `seats` is read twice: once for the seats the reader holds, and once for
	 * the seats of the delegations they head. So is `schedule_events`: once for
	 * "Programme", then for today.
	 */
	secondRows?: Record<string, unknown[]>;
	/** Keyed by table name, holding the message that table's query fails with. */
	errors?: Record<string, string>;
};

/** What one query the dashboard sent was asking for. */
type RecordedQuery = {
	/** The relation `.from(...)` named. */
	table: string;
	/** The text `.select(...)` asked for, or `null` before it was called. */
	columns: string | null;
	eq: [string, unknown][];
	in: [string, unknown[]][];
	is: [string, unknown][];
	gte: [string, unknown][];
	gt: [string, unknown][];
	lt: [string, unknown][];
	/** What `.limit(...)` asked for, or `null` when the query asked for no limit. */
	limit: number | null;
};

/**
 * A stand-in Supabase client that answers by table name and writes down what it
 * was asked for.
 *
 * The real client is a builder: `.from(...)` gives back an object with
 * `.select(...)` on it, `.select(...)` gives back one with `.eq(...)` on it, and
 * so on. Each step adds one condition to a query that is only sent once the
 * chain is awaited. This copies that shape; every step hands the same builder
 * back, and `overrideTypes`, which every lookup in `home.ts` ends with, changes
 * the type of the answer in the real client rather than the answer itself.
 */
function createStandInSupabase(answers: StandInAnswers = {}): {
	supabase: SupabaseClient;
	queries: RecordedQuery[];
} {
	const queries: RecordedQuery[] = [];

	function builderFor(table: string) {
		const query: RecordedQuery = {
			table,
			columns: null,
			eq: [],
			in: [],
			is: [],
			gte: [],
			gt: [],
			lt: [],
			limit: null
		};
		const isSecondVisit = queries.some((earlier) => earlier.table === table);
		queries.push(query);

		const message = answers.errors?.[table];
		const rows = isSecondVisit
			? (answers.secondRows?.[table] ?? [])
			: (answers.rows?.[table] ?? []);
		const answer = { data: message ? null : rows, error: message ? { message } : null };

		const builder = {
			select: (columns: string) => {
				query.columns = columns;
				return builder;
			},
			// What a query sorts by is its own business, not this file's, so
			// `order` records nothing and only carries the chain on.
			order: () => builder,
			eq: (column: string, value: unknown) => {
				query.eq.push([column, value]);
				return builder;
			},
			in: (column: string, values: unknown[]) => {
				query.in.push([column, values]);
				return builder;
			},
			is: (column: string, value: unknown) => {
				query.is.push([column, value]);
				return builder;
			},
			gte: (column: string, value: unknown) => {
				query.gte.push([column, value]);
				return builder;
			},
			gt: (column: string, value: unknown) => {
				query.gt.push([column, value]);
				return builder;
			},
			lt: (column: string, value: unknown) => {
				query.lt.push([column, value]);
				return builder;
			},
			limit: (count: number) => {
				query.limit = count;
				return builder;
			},
			overrideTypes: async () => answer
		};

		return builder;
	}

	const supabase = { from: builderFor };

	return { supabase: supabase as unknown as SupabaseClient, queries };
}

/** The conference a committee row brings along, in the shape the query answers with. */
function conferenceOfCommittee(overrides: Record<string, unknown> = {}) {
	return {
		id: 'conference-thimun',
		kind: 'conference',
		slug: 'thimun-2027',
		name: 'THIMUN 2027',
		status: 'published',
		banner_path: null,
		start_date: '2027-01-24',
		end_date: '2027-01-29',
		timezone: 'Europe/Amsterdam',
		city: 'The Hague',
		venue_name: 'World Forum',
		location_mode: 'in_person',
		position_paper_required: false,
		position_paper_deadline: null,
		...overrides
	};
}

/** One committee, as both lookups bring it back: one object, not a list. */
function committee(overrides: Record<string, unknown> = {}) {
	return {
		id: 'committee-unsc',
		slug: 'unsc',
		name: 'United Nations Security Council',
		abbreviation: 'UNSC',
		conferences: conferenceOfCommittee(),
		...overrides
	};
}

/** One row of the `seats` lookup. */
function seatRow(name: string, overrides: Record<string, unknown> = {}) {
	return { id: 'seat-1', name, country_code: 'FR', committees: committee(), ...overrides };
}

/**
 * One row of the `committee_chairs` lookup.
 *
 * `title` is never missing: the column is `not null default 'Chair'`, so a chair the
 * organisers said nothing more about already arrives as "Chair".
 */
function chairRow(title: string, overrides: Record<string, unknown> = {}) {
	return { title, committees: committee(), ...overrides };
}

/** The conference a `conference_staff` row brings along. */
function staffConference(overrides: Record<string, unknown> = {}) {
	return {
		id: 'conference-helped',
		kind: 'conference',
		slug: 'northbridge-mun',
		name: 'Northbridge MUN',
		status: 'published',
		banner_path: 'conference-helped/banner.jpg',
		start_date: '2026-10-02',
		end_date: '2026-10-04',
		timezone: 'Europe/London',
		city: 'Northbridge',
		venue_name: null,
		location_mode: 'in_person',
		...overrides
	};
}

/** One row of the `profiles` lookup, with every required field filled in. */
function profileRow(overrides: Record<string, unknown> = {}) {
	return {
		full_name: 'Daniel Okafor',
		institution_name: 'Delft University of Technology',
		country_code: 'NL',
		experience_level: 'intermediate',
		...overrides
	};
}

/**
 * One row of the `conference_role_members` lookup for a role that is
 * everything on its conference, which is what the old `organiser` staff row
 * meant. The role comes along because `role_id` points at `conference_roles`.
 */
function administratorRoleRow(conferenceId: string) {
	return {
		conference_id: conferenceId,
		conference_roles: { permissions: ['administrator'], scope: 'conference' }
	};
}

/** One row of the `organization_members` lookup, with the organisation attached. */
function membershipRow(overrides: Record<string, unknown> = {}) {
	return {
		organizations: {
			id: 'organization-1',
			slug: 'thimun-foundation',
			stripe_onboarding_completed_at: null
		},
		...overrides
	};
}

/**
 * One row of the `invoices` lookup, with its conference attached: its name
 * and timezone for the task, and its last day and status to know it is not over.
 */
function invoiceRow(overrides: Record<string, unknown> = {}) {
	return {
		id: 'invoice-1',
		number: 'INV-0007',
		due_at: '2026-10-21T22:00:00Z',
		amount_cents: 6500,
		currency: 'EUR',
		conference_id: 'conference-thimun',
		conferences: { name: 'THIMUN 2027', timezone: 'Europe/Amsterdam' },
		...overrides
	};
}

/** One row of the `schedule_events` lookup, with its conference attached. */
function eventRow(overrides: Record<string, unknown> = {}) {
	return {
		id: 'event-1',
		title: 'Opening ceremony',
		starts_at: '2026-09-18T07:00:00Z',
		ends_at: '2026-09-18T08:30:00Z',
		location: 'Main hall',
		conferences: { name: 'THIMUN 2027', slug: 'thimun-2027', timezone: 'Europe/Amsterdam' },
		...overrides
	};
}

/** One seat on offer, as `readSeatsOnOffer` answers with it. */
function seatOnOffer(userId: string | null, delegationId: string | null = null) {
	return {
		user_id: userId,
		delegation_id: delegationId,
		committees: { conference_id: 'conference-thimun' }
	};
}

/** Every table the dashboard reads, answered so that nothing is outstanding. */
const NOTHING_OUTSTANDING: StandInAnswers = { rows: { profiles: [profileRow()] } };

/**
 * The first and last day of a conference that was over a month before `NOW`,
 * under the database's column names. A conference that is over gives no card,
 * no task but an unpaid invoice, and no reason to read its programme or
 * announcements, whatever the reader was there; `hasConferenceRowEnded` is the
 * rule.
 */
const ENDED_DATES = { start_date: '2026-08-14', end_date: '2026-08-16' };

/** The same two days as `Conference` and an application's conference spell them. */
const ENDED_DAYS = { startDate: '2026-08-14', endDate: '2026-08-16' };

/** A committee of a conference that is over. */
const COMMITTEE_OF_ENDED = committee({ conferences: conferenceOfCommittee(ENDED_DATES) });

/** The seat reader's card for THIMUN, months away, as every field of it comes out. */
const SEAT_CARD: UpcomingConferenceCard = {
	id: 'conference-thimun',
	slug: 'thimun-2027',
	name: 'THIMUN 2027',
	bannerPath: null,
	startDate: '2027-01-24',
	endDate: '2027-01-29',
	timezone: 'Europe/Amsterdam',
	city: 'The Hague',
	venueName: 'World Forum',
	locationMode: 'in_person',
	roleKind: 'seat',
	seat: {
		name: 'France',
		// The seat's country code travels with it, for the hero to draw a flag from.
		countryCode: 'FR',
		// The short name when there is one, which is what the page shows.
		committeeHeading: 'UNSC',
		committeeId: 'committee-unsc',
		positionPaper: 'none'
	},
	chair: null,
	delegation: null,
	organiser: null,
	when: { text: 'In 4 months', isLive: false },
	href: '/conferences/thimun-2027/committees/unsc',
	isLive: false,
	liveButton: null
};

beforeEach(() => {
	// Every test starts with each mocked lookup answering with nothing, so a test
	// only says what it is about.
	managedConferencesLookup.mockReset().mockResolvedValue([]);
	exploreConferencesLookup.mockReset().mockResolvedValue([]);
	openConferenceCountLookup.mockReset().mockResolvedValue(0);
	applicationsLookup.mockReset().mockResolvedValue([]);
	delegationsLookup.mockReset().mockResolvedValue([]);
	checklistCountsLookup.mockReset().mockResolvedValue({});
	seatsOnOfferLookup.mockReset().mockResolvedValue([]);
	announcementsLookup.mockReset().mockResolvedValue([]);
});

describe('loadHomeDashboard', () => {
	it('gives an account with nothing at all empty lists rather than failing', async () => {
		openConferenceCountLookup.mockResolvedValue(6);

		const { supabase } = createStandInSupabase(NOTHING_OUTSTANDING);

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expect(dashboard).toEqual({
			// Somebody with no part in anything has no cards, so the page draws the
			// "Find your first conference" hero, which says how many are open.
			upcomingConferences: [],
			tasks: [],
			todayItems: [],
			todayEvents: [],
			upcomingEvents: [],
			announcements: [],
			myApplications: [],
			quickSessions: [],
			exploreConferences: [],
			hasManagedConferences: false,
			chairsSomething: false,
			// Never been to a conference, so the hero says "Find your first conference".
			hasTakenPart: false,
			openConferenceCount: 6,
			heroSeats: null,
			showAll: null
		});
	});

	it('asks every wave-one table only about the signed-in person', async () => {
		const { supabase, queries } = createStandInSupabase(NOTHING_OUTSTANDING);

		await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expect(queries.map((query) => query.table)).toEqual([
			'organization_members',
			'conference_staff',
			'conference_role_members',
			'seats',
			'committee_chairs',
			'delegation_members',
			'profiles',
			'invoices'
		]);
		expect(queries[0].eq).toEqual([['user_id', USER_ID]]);
		// Every staff row is asked for; which of them count as organising and
		// which as volunteering is worked out from the roles the reader holds,
		// which the next query reads.
		expect(queries[1].eq).toEqual([['user_id', USER_ID]]);
		expect(queries[2].eq).toEqual([['user_id', USER_ID]]);
		expect(queries[3].eq).toEqual([['user_id', USER_ID]]);
		expect(queries[4].eq).toEqual([['user_id', USER_ID]]);
		// Only a head assigns seats, so an ordinary member's row is never asked for.
		expect(queries[5].eq).toEqual([
			['user_id', USER_ID],
			['role', 'head']
		]);
		expect(queries[6].eq).toEqual([['id', USER_ID]]);
		// The payer rather than the conference or the delegation: a head reads the
		// whole group's invoices, and none of those is a bill they have to pay.
		expect(queries[7].eq).toEqual([
			['payer_user_id', USER_ID],
			['status', 'unpaid']
		]);
	});

	it('asks nothing at all about seats, delegations, programmes or applications it has no ids for', async () => {
		const { supabase, queries } = createStandInSupabase(NOTHING_OUTSTANDING);

		await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		// An empty list would have to be written as `in.()`, which PostgREST
		// refuses, and there is nothing to ask about in any case.
		const tables = queries.map((query) => query.table);
		expect(tables).not.toContain('documents');
		expect(tables).not.toContain('schedule_events');
		expect(tables).not.toContain('applications');
		expect(seatsOnOfferLookup).not.toHaveBeenCalled();
	});

	it('hands back which list the reader asked to see the whole of', async () => {
		const { supabase } = createStandInSupabase(NOTHING_OUTSTANDING);

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, 'conferences');

		// `load` read it from `?all=`; the page lifts that list's limit and nothing
		// here depends on it.
		expect(dashboard.showAll).toBe('conferences');
	});

	it('raises when a query fails, rather than showing an empty dashboard', async () => {
		const { supabase } = createStandInSupabase({
			...NOTHING_OUTSTANDING,
			errors: { seats: 'no connection' }
		});

		// The page is all or nothing: a failed query is a bug, and a dashboard that
		// quietly said "nothing to do" would hide it.
		await expect(loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE)).rejects.toThrow(
			'no connection'
		);
	});

	it('raises when there is no profile row, which should be impossible here', async () => {
		// `requireOnboarded` has already read this person's profile before `load`
		// gets here, so a missing row means something is wrong.
		const { supabase } = createStandInSupabase();

		await expect(loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE)).rejects.toThrow(
			'no profile row'
		);
	});
});

describe('readShowAll', () => {
	it('reads the two lists the page can show the whole of', () => {
		expect(readShowAll('conferences')).toBe('conferences');
		expect(readShowAll('quick')).toBe('quick');
	});

	it('reads anything else, and nothing, as no list', () => {
		expect(readShowAll(null)).toBeNull();
		expect(readShowAll('')).toBeNull();
		expect(readShowAll('everything')).toBeNull();
	});
});

describe('hasConferenceRowEnded', () => {
	/** A conference as a lookup brings its row along, apart from the fields a test names. */
	function conferenceRow(
		overrides: Partial<{ end_date: string; timezone: string; status: ConferenceStatus }> = {}
	) {
		return {
			end_date: '2026-09-17',
			timezone: 'Europe/Amsterdam',
			status: 'published' as ConferenceStatus,
			...overrides
		};
	}

	it('is over from the day after its last day', () => {
		// `NOW` is the 17th in Amsterdam, so a conference whose last day is the
		// 17th is still running, and one whose last day was the 16th is over.
		expect(hasConferenceRowEnded(conferenceRow({ end_date: '2026-09-16' }), NOW)).toBe(true);
		expect(hasConferenceRowEnded(conferenceRow(), NOW)).toBe(false);
		expect(hasConferenceRowEnded(conferenceRow({ end_date: '2026-09-18' }), NOW)).toBe(false);
	});

	it('reads the day where the conference is, not where the reader is', () => {
		// At noon UTC on the 17th it is already the 18th in Auckland, so the same
		// last day is over there and not in Amsterdam.
		expect(hasConferenceRowEnded(conferenceRow({ timezone: 'Pacific/Auckland' }), NOW)).toBe(true);
		expect(hasConferenceRowEnded(conferenceRow({ timezone: 'Europe/Amsterdam' }), NOW)).toBe(false);
	});

	it('counts a cancelled conference as over whatever its dates say', () => {
		// Archiving is how the organisers cancel a conference, and to the reader
		// that is the same as one that has run its course. A draft is not over.
		expect(
			hasConferenceRowEnded(conferenceRow({ end_date: '2027-01-29', status: 'archived' }), NOW)
		).toBe(true);
		expect(
			hasConferenceRowEnded(conferenceRow({ end_date: '2027-01-29', status: 'draft' }), NOW)
		).toBe(false);
	});
});

describe('the upcoming conferences', () => {
	it('turns a seat into a card with its flag, its committee and the conference’s place', async () => {
		const { supabase } = createStandInSupabase({
			rows: { ...NOTHING_OUTSTANDING.rows, seats: [seatRow('France')] }
		});

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expect(dashboard.upcomingConferences).toEqual([SEAT_CARD]);
	});

	it('asks the committee lookups for where the conference is, not only when', async () => {
		const { supabase, queries } = createStandInSupabase(NOTHING_OUTSTANDING);

		await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		// The hero's meta line says "Beurs van Berlage, Amsterdam" and a row's
		// says the city, so both lookups bring the place along with the dates.
		const placeColumns = 'city, venue_name, location_mode';
		expect(queries.find((query) => query.table === 'seats')?.columns).toContain(placeColumns);
		expect(queries.find((query) => query.table === 'committee_chairs')?.columns).toContain(
			placeColumns
		);
		expect(queries.find((query) => query.table === 'conference_staff')?.columns).toContain(
			placeColumns
		);
	});

	it('asks every lookup that brings a conference along whether it is over or cancelled', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { ...NOTHING_OUTSTANDING.rows, seats: [seatRow('France')] }
		});

		await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		/** The columns the first query of a table asked for. */
		function columnsOf(table: string): string {
			return queries.find((query) => query.table === table)?.columns ?? '';
		}

		// `end_date`, `timezone` and `status` are what `hasConferenceRowEnded`
		// reads, so a row at a conference that is over or cancelled is set aside
		// before it becomes a task or a reason to read a programme.
		for (const table of ['seats', 'committee_chairs', 'conference_staff']) {
			expect(columnsOf(table)).toContain('status');
			expect(columnsOf(table)).toContain('end_date, timezone');
		}
		// An invoice is the one task that outlives its conference, so its lookup
		// does not ask whether the conference is over.
		expect(columnsOf('invoices')).toContain('conferences(name, timezone)');
		expect(columnsOf('invoices')).not.toContain('end_date');
		// A "Programme" row draws no photograph, so no banner is read for it.
		expect(columnsOf('schedule_events')).not.toContain('banner_path');
	});

	it('calls a committee by its full name when it has no short one', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				...NOTHING_OUTSTANDING.rows,
				seats: [seatRow('France', { committees: committee({ abbreviation: null }) })]
			}
		});

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expect(dashboard.upcomingConferences[0].seat?.committeeHeading).toBe(
			'United Nations Security Council'
		);
	});

	it('turns a chair row into a card with its title and its papers waiting counted', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				...NOTHING_OUTSTANDING.rows,
				committee_chairs: [chairRow('Vice Chair')],
				documents: [{ committee_id: 'committee-unsc' }, { committee_id: 'committee-unsc' }]
			}
		});

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		const [card] = dashboard.upcomingConferences;
		// The title rather than a fixed "Chair", so that a vice chair reads as one.
		expect(card.roleKind).toBe('chair');
		expect(card.chair).toEqual({
			title: 'Vice Chair',
			committeeHeading: 'UNSC',
			committeeId: 'committee-unsc',
			// The hero's "papers to review" figure, counted once for the card and the task.
			papersWaiting: 2
		});
		// A chair holds no seat, so there is no flag to draw.
		expect(card.seat).toBeNull();
		expect(dashboard.chairsSomething).toBe(true);
	});

	it('lists a conference the reader both sits in and chairs once, as the chair', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				...NOTHING_OUTSTANDING.rows,
				seats: [seatRow('France')],
				committee_chairs: [chairRow('Chair')]
			}
		});

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		// The chair room is where the conference needs them, so the chair is the
		// more telling of the two roles.
		expect(dashboard.upcomingConferences).toHaveLength(1);
		expect(dashboard.upcomingConferences[0].roleKind).toBe('chair');
	});

	it('leaves out a row whose committee or conference was withheld', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				...NOTHING_OUTSTANDING.rows,
				seats: [
					// Row Level Security can hand back the seat while withholding the
					// committee, or the committee while withholding its conference: a
					// draft conference is readable only by the people running it.
					seatRow('France', { committees: null }),
					seatRow('Brazil', { id: 'seat-2', committees: committee({ conferences: null }) })
				],
				committee_chairs: [chairRow('Chair', { committees: null })]
			}
		});

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		// A row with no conference has nothing to link to, so it is left out rather
		// than shown half empty.
		expect(dashboard.upcomingConferences).toEqual([]);
		expect(dashboard.tasks).toEqual([]);
	});

	it('says whether a seat’s position paper is in, still owed, or not asked for', async () => {
		/** A seat at its own conference, which does or does not want a paper. */
		function seatAt(index: number, name: string, isPaperRequired: boolean) {
			return seatRow(name, {
				id: `seat-${index}`,
				committees: committee({
					id: `committee-${index}`,
					conferences: conferenceOfCommittee({
						id: `conference-${index}`,
						name,
						position_paper_required: isPaperRequired
					})
				})
			});
		}

		const { supabase } = createStandInSupabase({
			rows: {
				...NOTHING_OUTSTANDING.rows,
				seats: [seatAt(1, 'In', true), seatAt(2, 'Owed', true), seatAt(3, 'Not asked', false)],
				documents: [{ seat_id: 'seat-1' }]
			}
		});

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		// The hero's third figure says "Handed in"; an owed paper is a task instead.
		// Read as an object, because the three cards share a day and so come out by name.
		expect(
			Object.fromEntries(
				dashboard.upcomingConferences.map((card) => [card.name, card.seat?.positionPaper])
			)
		).toEqual({ In: 'handed_in', Owed: 'due', 'Not asked': 'none' });
	});

	it('lists every conference, with no cap', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				...NOTHING_OUTSTANDING.rows,
				seats: ['One', 'Two', 'Three', 'Four'].map((name, index) =>
					seatRow(name, {
						id: `seat-${index}`,
						committees: committee({
							id: `committee-${index}`,
							conferences: conferenceOfCommittee({ id: `conference-${index}`, name })
						})
					})
				)
			}
		});

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		// The page decides how many rows to draw and says "Show all 4" for the
		// rest, so nothing is cut here. All four start on the same day, so the
		// builder puts them in name order.
		expect(dashboard.upcomingConferences.map((card) => card.name)).toEqual([
			'Four',
			'One',
			'Three',
			'Two'
		]);
	});

	it('gives no card and no task for a conference the organisers have cancelled', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: {
				...NOTHING_OUTSTANDING.rows,
				seats: [
					seatRow('France', {
						committees: committee({
							conferences: conferenceOfCommittee({
								status: 'archived',
								position_paper_required: true
							})
						})
					})
				]
			}
		});

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		// Archiving is how a published conference is cancelled. Its dates are still
		// ahead, but there is nothing to go to, no paper to write and no programme
		// to read; the reader has still been to one, as far as the find hero knows.
		expect(dashboard.upcomingConferences).toEqual([]);
		expect(dashboard.tasks).toEqual([]);
		expect(queries.map((query) => query.table)).not.toContain('schedule_events');
		expect(dashboard.hasTakenPart).toBe(true);
	});

	it('carries the conference banner onto the card, for the hero’s photograph', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				...NOTHING_OUTSTANDING.rows,
				seats: [
					seatRow('France', {
						committees: committee({
							conferences: conferenceOfCommittee({ banner_path: 'banners/thimun.jpg' })
						})
					})
				]
			}
		});

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expect(dashboard.upcomingConferences[0].bannerPath).toBe('banners/thimun.jpg');
	});

	it('gives a head of delegation their seats counted, and a member none', async () => {
		delegationsLookup.mockResolvedValue([makeDelegationMembership()]);

		const asHead = createStandInSupabase({
			rows: {
				...NOTHING_OUTSTANDING.rows,
				delegation_members: [{ delegation_id: 'delegation-1' }]
			},
			secondRows: {
				seats: [
					{ delegation_id: 'delegation-1', user_id: null },
					{ delegation_id: 'delegation-1', user_id: 'user-7' },
					{ delegation_id: 'delegation-1', user_id: null }
				]
			}
		});
		const head = await loadHomeDashboard(asHead.supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		// "0 of 2 seats assigned" on the hero is this pair, read in the one query.
		expect(head.upcomingConferences[0].roleKind).toBe('head');
		expect(head.upcomingConferences[0].delegation).toEqual({
			id: 'delegation-1',
			name: 'LSE Team',
			isHead: true,
			seatCount: 3,
			emptySeatCount: 2
		});

		// No `delegation_members` row comes back for a member, because that query
		// only asks for the rows whose role is `head`, and their seats are not read.
		const asMember = createStandInSupabase(NOTHING_OUTSTANDING);
		const member = await loadHomeDashboard(asMember.supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expect(member.upcomingConferences[0].roleKind).toBe('member');
		expect(member.upcomingConferences[0].delegation).toEqual({
			id: 'delegation-1',
			name: 'LSE Team',
			isHead: false,
			seatCount: 0,
			emptySeatCount: 0
		});
		expect(asMember.queries.filter((query) => query.table === 'seats')).toHaveLength(1);
	});

	it('lists an accepted application but no other, and no delegation short of accepted', async () => {
		applicationsLookup.mockResolvedValue([
			makeApplication({ status: 'accepted' }),
			makeApplication({
				id: 'application-2',
				status: 'submitted',
				conference: makeApplicationConference({ id: 'conference-other', slug: 'other-mun' })
			})
		]);
		// A delegation still waiting for a decision is an application, not a
		// role, exactly as an individual's is; a withdrawn one is over.
		delegationsLookup.mockResolvedValue([
			makeDelegationMembership({
				id: 'delegation-waiting',
				status: 'submitted',
				conference: makeApplicationConference({ id: 'conference-waiting', slug: 'waiting-mun' })
			}),
			makeDelegationMembership({
				id: 'delegation-left',
				status: 'withdrawn',
				conference: makeApplicationConference({ id: 'conference-left', slug: 'left-mun' })
			})
		]);

		const { supabase } = createStandInSupabase(NOTHING_OUTSTANDING);
		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expect(dashboard.upcomingConferences).toEqual([
			{
				id: 'conference-delft',
				slug: 'delftmun-2026',
				name: 'DelftMUN 2026',
				bannerPath: null,
				startDate: '2026-11-20',
				endDate: '2026-11-22',
				timezone: 'Europe/Amsterdam',
				city: 'Delft',
				venueName: null,
				locationMode: 'in_person',
				roleKind: 'accepted',
				seat: null,
				chair: null,
				delegation: null,
				organiser: null,
				when: { text: 'In 2 months', isLive: false },
				href: '/conferences/delftmun-2026',
				isLive: false,
				liveButton: null
			}
		]);
	});
});

describe('the conference running today', () => {
	/** The first and last day of a conference running on `NOW`, the middle of three. */
	const RUNNING_DATES = { start_date: '2026-09-16', end_date: '2026-09-18' };

	/** A committee of a conference that runs today. */
	const COMMITTEE_TODAY = committee({ conferences: conferenceOfCommittee(RUNNING_DATES) });

	/** The state of that committee's room, with the session it points at. */
	function roomRow(status: string | null, conferenceId = 'conference-thimun') {
		return {
			committee_id: 'committee-unsc',
			committees: { conference_id: conferenceId },
			committee_sessions: status === null ? null : { name: 'Session 1', status }
		};
	}

	it('draws a live card for a chair, with the room in progress as its button', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: {
				...NOTHING_OUTSTANDING.rows,
				committee_chairs: [chairRow('Chair', { committees: COMMITTEE_TODAY })],
				committee_state: [roomRow('in_progress')]
			}
		});

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expect(dashboard.upcomingConferences).toEqual([
			{
				...SEAT_CARD,
				startDate: '2026-09-16',
				endDate: '2026-09-18',
				roleKind: 'chair',
				seat: null,
				chair: {
					title: 'Chair',
					committeeHeading: 'UNSC',
					committeeId: 'committee-unsc',
					papersWaiting: 0
				},
				when: { text: 'Today', isLive: true },
				href: '/conferences/thimun-2027/committees/unsc/chair',
				isLive: true,
				liveButton: {
					label: 'Open chair room',
					href: '/conferences/thimun-2027/committees/unsc/chair'
				}
			}
		]);
		// The rooms are read for today's conferences only, through the committee.
		const roomQuery = queries.find((query) => query.table === 'committee_state');
		expect(roomQuery?.in).toEqual([['committees.conference_id', ['conference-thimun']]]);
	});

	it('surfaces today’s items and programme for the hero and "Today’s programme"', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				...NOTHING_OUTSTANDING.rows,
				committee_chairs: [chairRow('Chair', { committees: COMMITTEE_TODAY })],
				committee_state: [roomRow('in_progress')]
			},
			secondRows: {
				schedule_events: [
					{
						id: 'event-2',
						title: 'Committee session II',
						starts_at: '2026-09-17T12:30:00Z',
						ends_at: '2026-09-17T14:30:00Z',
						location: 'Room 2.04',
						committee_id: null,
						conference_id: 'conference-thimun'
					}
				]
			}
		});

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		// Worked out once: the live card's button and the page's items are the same list.
		expect(dashboard.todayItems).toEqual([
			expect.objectContaining({
				conferenceId: 'conference-thimun',
				title: 'UNSC · Session 1 in progress'
			})
		]);
		expect(dashboard.todayItems[0].links[0]).toEqual(dashboard.upcomingConferences[0].liveButton);
		// What `readTodayFacts` read is handed on as it is; which columns it carries
		// is `./home-today.test.ts`'s business.
		expect(dashboard.todayEvents).toEqual([
			expect.objectContaining({
				title: 'Committee session II',
				startsAt: '2026-09-17T12:30:00Z',
				endsAt: '2026-09-17T14:30:00Z',
				committeeId: null,
				conferenceId: 'conference-thimun'
			})
		]);
	});

	it('gives a delegate’s live card their room as its button, and reads today’s programme', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: {
				...NOTHING_OUTSTANDING.rows,
				seats: [seatRow('France', { committees: COMMITTEE_TODAY })],
				committee_state: [roomRow(null)]
			},
			// The programme is read twice: for "Programme", then for today.
			secondRows: {
				schedule_events: [
					{
						title: 'Committee session I',
						starts_at: '2026-09-17T11:00:00Z',
						ends_at: '2026-09-17T12:30:00Z',
						committee_id: 'committee-unsc',
						conference_id: 'conference-thimun'
					},
					{
						title: 'Committee session II',
						starts_at: '2026-09-17T12:30:00Z',
						ends_at: '2026-09-17T14:30:00Z',
						committee_id: null,
						conference_id: 'conference-thimun'
					}
				]
			}
		});

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		const [card] = dashboard.upcomingConferences;
		expect(card.roleKind).toBe('seat');
		expect(card.isLive).toBe(true);
		expect(card.liveButton).toEqual({
			label: 'Open live room',
			href: '/conferences/thimun-2027/committees/unsc/live'
		});
		// Today's events are read from those not yet ended up to a day ahead, then
		// cut to today where the conference is.
		const todayQuery = queries.filter((query) => query.table === 'schedule_events')[1];
		expect(todayQuery.gt).toEqual([['ends_at', NOW.toISOString()]]);
		expect(todayQuery.lt).toEqual([['starts_at', '2026-09-18T12:00:00.000Z']]);
	});

	it('leads an organiser to the dashboard of the conference they run today', async () => {
		managedConferencesLookup.mockResolvedValue([
			makeConference({ id: 'conference-thimun', startDate: '2026-09-16', endDate: '2026-09-18' })
		]);

		const { supabase } = createStandInSupabase({
			rows: {
				...NOTHING_OUTSTANDING.rows,
				committee_state: [roomRow('in_progress')]
			}
		});

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expect(dashboard.upcomingConferences).toEqual([
			expect.objectContaining({
				roleKind: 'organiser',
				href: '/manage/thimun-2027',
				isLive: true,
				liveButton: { label: 'Open dashboard', href: '/manage/thimun-2027' }
			})
		]);
		// The manage list's own words for a conference on its second day.
		expect(dashboard.upcomingConferences[0].organiser?.status).toEqual({
			text: 'Day 2 of 3',
			tone: 'brand'
		});
	});

	it('gives a volunteer their schedule, and never their conference to manage', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				...NOTHING_OUTSTANDING.rows,
				conference_staff: [
					{
						conference_id: 'conference-helped',
						conferences: staffConference(RUNNING_DATES)
					}
				]
			}
		});

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expect(managedConferencesLookup).toHaveBeenCalledWith(supabase, [], []);
		expect(dashboard.upcomingConferences).toEqual([
			expect.objectContaining({
				name: 'Northbridge MUN',
				bannerPath: 'conference-helped/banner.jpg',
				city: 'Northbridge',
				roleKind: 'volunteer',
				href: '/conferences/northbridge-mun',
				liveButton: { label: 'Schedule', href: '/conferences/northbridge-mun/schedule' }
			})
		]);
		expect(dashboard.hasManagedConferences).toBe(false);
	});

	it('gives a delegation member without a seat their delegation, and a seated one their room', async () => {
		const runningConference = makeApplicationConference({
			id: 'conference-thimun',
			slug: 'thimun-2027',
			name: 'THIMUN 2027',
			startDate: '2026-09-16',
			endDate: '2026-09-18'
		});
		delegationsLookup.mockResolvedValue([
			makeDelegationMembership({ conference: runningConference })
		]);

		const withoutSeat = createStandInSupabase(NOTHING_OUTSTANDING);
		const unseated = await loadHomeDashboard(withoutSeat.supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expect(unseated.upcomingConferences).toEqual([
			expect.objectContaining({
				roleKind: 'member',
				delegation: expect.objectContaining({ name: 'LSE Team', isHead: false }),
				href: '/delegations/delegation-1',
				liveButton: { label: 'Delegation', href: '/delegations/delegation-1' }
			})
		]);

		const withSeat = createStandInSupabase({
			rows: {
				...NOTHING_OUTSTANDING.rows,
				seats: [seatRow('France', { committees: COMMITTEE_TODAY })],
				committee_state: [roomRow('in_progress')]
			}
		});
		const seated = await loadHomeDashboard(withSeat.supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		// One card for the conference, named after the seat rather than the delegation.
		expect(seated.upcomingConferences.map((card) => card.roleKind)).toEqual(['seat']);
		expect(seated.upcomingConferences[0].seat?.name).toBe('France');
		expect(seated.upcomingConferences[0].liveButton?.label).toBe('Open live room');
	});

	it('asks nothing about rooms or today’s programme when nothing of the reader’s runs today', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: {
				...NOTHING_OUTSTANDING.rows,
				seats: [seatRow('France')],
				schedule_events: [eventRow()]
			}
		});

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expect(queries.map((query) => query.table)).not.toContain('committee_state');
		expect(queries.filter((query) => query.table === 'schedule_events')).toHaveLength(1);
		// The seat's conference is months away, so its card is not live.
		expect(dashboard.upcomingConferences).toEqual([
			expect.objectContaining({
				roleKind: 'seat',
				when: { text: 'In 4 months', isLive: false },
				isLive: false,
				liveButton: null
			})
		]);
		expect(dashboard.todayItems).toEqual([]);
		expect(dashboard.todayEvents).toEqual([]);
	});
});

describe('the organiser’s figures', () => {
	it('hands the conference lookups the ids wave one found', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				...NOTHING_OUTSTANDING.rows,
				organization_members: [membershipRow()],
				conference_staff: [{ conference_id: 'conference-staffed', conferences: null }],
				conference_role_members: [administratorRoleRow('conference-staffed')],
				seats: [seatRow('France')]
			}
		});

		await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expect(managedConferencesLookup).toHaveBeenCalledWith(
			supabase,
			['organization-1'],
			['conference-staffed']
		);

		// The cards to explore leave out the conferences the reader is already in:
		// the one they sit in a committee at, and the one they organise. The
		// conferences of their organisations are not in the list, because those
		// ids only arrive with the answer to the lookup above.
		expect(exploreConferencesLookup).toHaveBeenCalledWith(
			supabase,
			['conference-thimun', 'conference-staffed'],
			NOW,
			EXPLORE_CONFERENCE_LIMIT
		);
	});

	it('keeps a conference the reader has applied to or joined out of the cards to explore', async () => {
		applicationsLookup.mockResolvedValue([makeApplication()]);
		delegationsLookup.mockResolvedValue([
			makeDelegationMembership({
				conference: makeApplicationConference({ id: 'conference-joined' })
			})
		]);

		const { supabase } = createStandInSupabase(NOTHING_OUTSTANDING);

		await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expect(exploreConferencesLookup).toHaveBeenCalledWith(
			supabase,
			['conference-delft', 'conference-joined'],
			NOW,
			EXPLORE_CONFERENCE_LIMIT
		);
	});

	it('names a conference once when it was both applied to and sat in', async () => {
		applicationsLookup.mockResolvedValue([
			makeApplication({ conference: makeApplicationConference({ id: 'conference-thimun' }) })
		]);

		const { supabase } = createStandInSupabase({
			rows: { ...NOTHING_OUTSTANDING.rows, seats: [seatRow('France')] }
		});

		await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expect(exploreConferencesLookup).toHaveBeenCalledWith(
			supabase,
			['conference-thimun'],
			NOW,
			EXPLORE_CONFERENCE_LIMIT
		);
	});

	it('passes the conferences to explore through as they came back', async () => {
		exploreConferencesLookup.mockResolvedValue([makeConference({ id: 'conference-open' })]);

		const { supabase } = createStandInSupabase(NOTHING_OUTSTANDING);

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expect(dashboard.exploreConferences).toHaveLength(1);
		expect(dashboard.exploreConferences[0].id).toBe('conference-open');
	});

	it('offers an organiser no conferences to explore, and does not ask', async () => {
		managedConferencesLookup.mockResolvedValue([makeConference()]);
		exploreConferencesLookup.mockResolvedValue([makeConference({ id: 'conference-open' })]);

		const { supabase } = createStandInSupabase(NOTHING_OUTSTANDING);

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		// Home does not sell an organiser other people's conferences, and their
		// page is already the longest.
		expect(exploreConferencesLookup).not.toHaveBeenCalled();
		expect(dashboard.exploreConferences).toEqual([]);
		expect(dashboard.hasManagedConferences).toBe(true);
	});

	it('asks for the publish checklist of the drafts alone', async () => {
		managedConferencesLookup.mockResolvedValue([
			makeConference({ id: 'conference-draft', status: 'draft' }),
			makeConference({ id: 'conference-live', status: 'published' })
		]);

		const { supabase } = createStandInSupabase(NOTHING_OUTSTANDING);

		await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expect(checklistCountsLookup).toHaveBeenCalledWith(supabase, ['conference-draft']);
	});

	it('counts the applications waiting at the published conferences alone', async () => {
		managedConferencesLookup.mockResolvedValue([
			makeConference(),
			makeConference({ id: 'conference-draft', status: 'draft' })
		]);

		const { supabase, queries } = createStandInSupabase({
			rows: {
				...NOTHING_OUTSTANDING.rows,
				applications: [
					{ conference_id: 'conference-thimun', submitted_at: '2026-09-15T09:00:00Z' },
					{ conference_id: 'conference-thimun', submitted_at: '2026-09-11T12:00:00Z' }
				]
			}
		});

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		// Only an application that is sent and not yet decided waits, and only a
		// published conference can have one.
		const waitingQuery = queries.find((query) => query.table === 'applications');
		expect(waitingQuery?.eq).toEqual([['status', 'submitted']]);
		expect(waitingQuery?.in).toEqual([['conference_id', ['conference-thimun']]]);

		// The same count feeds the hero's "applications waiting" figure and the task.
		const card = dashboard.upcomingConferences.find((listed) => listed.id === 'conference-thimun');
		expect(card?.organiser?.applicationsWaiting).toBe(2);
		expect(dashboard.tasks).toEqual([
			expect.objectContaining({
				id: 'review_applications:conference-thimun',
				kind: 'review_applications',
				conferenceId: 'conference-thimun',
				title: 'Decide 2 applications (THIMUN 2027)',
				detail: 'The oldest came in 6 days ago.',
				actionLabel: 'Review applications',
				deadline: null,
				href: '/manage/thimun-2027/applications'
			})
		]);
	});

	it('asks nothing about applications for an organiser with only a draft', async () => {
		managedConferencesLookup.mockResolvedValue([
			makeConference({ id: 'conference-draft', status: 'draft' })
		]);

		const { supabase, queries } = createStandInSupabase(NOTHING_OUTSTANDING);

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expect(queries.map((query) => query.table)).not.toContain('applications');
		expect(dashboard.upcomingConferences[0].organiser?.applicationsWaiting).toBe(0);
	});

	it('gives a draft its setup steps and a published conference its status, as the manage list says them', async () => {
		managedConferencesLookup.mockResolvedValue([makeConference(), READY_DRAFT]);
		checklistCountsLookup.mockResolvedValue(READY_DRAFT_COUNTS);

		const { supabase } = createStandInSupabase(NOTHING_OUTSTANDING);

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expect(dashboard.upcomingConferences.map((card) => card.organiser)).toEqual([
			{
				status: { text: 'Applications open', tone: 'success' },
				applicationsWaiting: 0,
				// A published conference has nothing left to set up.
				setupSteps: null
			},
			{
				status: { text: 'Draft · not public', tone: 'neutral' },
				applicationsWaiting: 0,
				// The required items done, of the required ones: the same count the
				// publish task's "Draft · 5 of 5 setup steps done" reads.
				setupSteps: { done: 5, required: 5 }
			}
		]);
	});

	it('counts the seats held at the published conference the organiser is shown first', async () => {
		managedConferencesLookup.mockResolvedValue([makeConference()]);
		seatsOnOfferLookup.mockResolvedValue([
			seatOnOffer('user-9'),
			// A seat a delegation is keeping is held, though nobody sits in it yet.
			seatOnOffer(null, 'delegation-2'),
			seatOnOffer(null)
		]);

		const { supabase } = createStandInSupabase(NOTHING_OUTSTANDING);

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		// The hero alone, in a wave of its own: the same read `/manage` counts with.
		expect(seatsOnOfferLookup).toHaveBeenCalledWith(supabase, ['conference-thimun']);
		expect(dashboard.heroSeats).toEqual({ held: 2, onOffer: 3 });
	});

	it('counts no seats for a draft hero, nor for a reader whose hero is not theirs to run', async () => {
		managedConferencesLookup.mockResolvedValue([READY_DRAFT]);
		checklistCountsLookup.mockResolvedValue(READY_DRAFT_COUNTS);

		const draftHero = createStandInSupabase(NOTHING_OUTSTANDING);
		const organiser = await loadHomeDashboard(draftHero.supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		// A draft offers no seats yet, so there is nothing to count.
		expect(organiser.upcomingConferences[0].roleKind).toBe('organiser');
		expect(organiser.heroSeats).toBeNull();

		managedConferencesLookup.mockResolvedValue([]);
		const seatHero = createStandInSupabase({
			rows: { ...NOTHING_OUTSTANDING.rows, seats: [seatRow('France')] }
		});
		const delegate = await loadHomeDashboard(seatHero.supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expect(delegate.heroSeats).toBeNull();
		expect(seatsOnOfferLookup).not.toHaveBeenCalled();
	});
});

describe('the applications section', () => {
	it('merges the reader’s applications and delegations into one list', async () => {
		applicationsLookup.mockResolvedValue([makeApplication()]);
		delegationsLookup.mockResolvedValue([makeDelegationMembership({ status: 'submitted' })]);

		const { supabase } = createStandInSupabase(NOTHING_OUTSTANDING);

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expect(dashboard.myApplications.map((entry) => entry.kind)).toEqual([
			'individual',
			'delegation'
		]);
	});

	it('leaves out an application the reader withdrew', async () => {
		applicationsLookup.mockResolvedValue([
			makeApplication({ id: 'application-kept' }),
			makeApplication({ id: 'application-gone', status: 'withdrawn' })
		]);

		const { supabase } = createStandInSupabase(NOTHING_OUTSTANDING);

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expect(dashboard.myApplications.map((entry) => entry.id)).toEqual(['application-kept']);
	});

	it('leaves out an accepted application and an accepted delegation, which are conferences', async () => {
		applicationsLookup.mockResolvedValue([
			makeApplication({ id: 'application-accepted', status: 'accepted' }),
			makeApplication({
				id: 'application-waiting',
				conference: makeApplicationConference({ id: 'conference-other' })
			})
		]);
		delegationsLookup.mockResolvedValue([
			makeDelegationMembership({
				conference: makeApplicationConference({
					id: 'conference-joined',
					name: 'Joined MUN',
					startDate: '2026-12-05',
					endDate: '2026-12-07'
				})
			})
		]);

		const { supabase } = createStandInSupabase(NOTHING_OUTSTANDING);

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		// An accepted one is the hero or an "Also coming up" row, soonest first, so
		// saying it here too would state one fact twice.
		expect(dashboard.myApplications.map((entry) => entry.id)).toEqual(['application-waiting']);
		expect(dashboard.upcomingConferences.map((card) => card.id)).toEqual([
			'conference-delft',
			'conference-joined'
		]);
	});

	it('leaves out a conference that has already finished', async () => {
		applicationsLookup.mockResolvedValue([
			makeApplication({
				id: 'application-past',
				conference: makeApplicationConference({ startDate: '2026-01-10', endDate: '2026-01-12' })
			})
		]);

		const { supabase } = createStandInSupabase(NOTHING_OUTSTANDING);

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		// `/applications` hides the same rows until `?past=1` asks for them, and
		// this section's "All applications" goes there.
		expect(dashboard.myApplications).toEqual([]);
	});

	it('puts the ones waiting for an answer first, soonest conference first, then drafts, then refusals', async () => {
		/** An application at a conference of its own, starting on `startDate`. */
		function applicationAt(id: string, status: MyApplicationListItem['status'], startDate: string) {
			return makeApplication({
				id,
				status,
				conference: makeApplicationConference({ id: `conference-${id}`, startDate })
			});
		}

		applicationsLookup.mockResolvedValue([
			applicationAt('refused', 'rejected', '2026-10-01'),
			applicationAt('draft', 'draft', '2026-10-08'),
			applicationAt('sent', 'submitted', '2026-12-01'),
			applicationAt('waitlisted', 'waitlisted', '2026-11-20')
		]);

		const { supabase } = createStandInSupabase(NOTHING_OUTSTANDING);

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expect(dashboard.myApplications.map((entry) => entry.id)).toEqual([
			'waitlisted',
			'sent',
			'draft'
		]);
	});

	it('shows three rows at most, counted after the accepted ones are left out', async () => {
		applicationsLookup.mockResolvedValue([
			...['a', 'b', 'c'].map((suffix) =>
				makeApplication({
					id: `application-${suffix}`,
					status: 'accepted',
					conference: makeApplicationConference({ id: `conference-${suffix}` })
				})
			),
			makeApplication({ id: 'application-waitlisted', status: 'waitlisted' })
		]);

		const { supabase } = createStandInSupabase(NOTHING_OUTSTANDING);

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		// A waitlisted row behind three accepted ones is still shown.
		expect(dashboard.myApplications.map((entry) => entry.id)).toEqual(['application-waitlisted']);
	});

	it('shows three rows at most', async () => {
		applicationsLookup.mockResolvedValue(
			['a', 'b', 'c', 'd'].map((suffix) => makeApplication({ id: `application-${suffix}` }))
		);

		const { supabase } = createStandInSupabase(NOTHING_OUTSTANDING);

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expect(dashboard.myApplications).toHaveLength(3);
	});
});

describe('the programme section', () => {
	it('asks only about the conferences the reader takes part in, soonest five first', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: {
				...NOTHING_OUTSTANDING.rows,
				conference_staff: [
					{
						conference_id: 'conference-staffed',
						conferences: staffConference({ id: 'conference-staffed' })
					}
				],
				conference_role_members: [administratorRoleRow('conference-staffed')],
				seats: [seatRow('France')],
				schedule_events: [eventRow()]
			}
		});

		await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		const eventQuery = queries.find((query) => query.table === 'schedule_events');

		expect(eventQuery?.in).toEqual([
			['conference_id', ['conference-thimun', 'conference-staffed']]
		]);
		expect(eventQuery?.gte).toEqual([['starts_at', NOW.toISOString()]]);
		expect(eventQuery?.limit).toBe(UPCOMING_EVENT_LIMIT);
	});

	it('does not ask about a conference the reader has only applied to', async () => {
		applicationsLookup.mockResolvedValue([makeApplication()]);

		const { supabase, queries } = createStandInSupabase({
			rows: { ...NOTHING_OUTSTANDING.rows, seats: [seatRow('France')] }
		});

		await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		const eventQuery = queries.find((query) => query.table === 'schedule_events');

		// An application is not a role at a conference, and the section is about
		// the conferences the reader takes part in or helps run.
		expect(eventQuery?.in).toEqual([['conference_id', ['conference-thimun']]]);
	});

	it('turns a row into an event with the conference’s own name and timezone', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				...NOTHING_OUTSTANDING.rows,
				seats: [seatRow('France')],
				schedule_events: [eventRow()]
			}
		});

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expect(dashboard.upcomingEvents).toEqual([
			{
				id: 'event-1',
				title: 'Opening ceremony',
				startsAt: '2026-09-18T07:00:00Z',
				endsAt: '2026-09-18T08:30:00Z',
				location: 'Main hall',
				conferenceName: 'THIMUN 2027',
				conferenceSlug: 'thimun-2027',
				conferenceTimezone: 'Europe/Amsterdam'
			}
		]);
	});

	it('leaves out an event whose conference was withheld', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				...NOTHING_OUTSTANDING.rows,
				seats: [seatRow('France')],
				schedule_events: [eventRow({ conferences: null })]
			}
		});

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		// With no conference there is no name to put beside the event and no
		// timezone to show its time in.
		expect(dashboard.upcomingEvents).toEqual([]);
	});
});

describe('the announcements section', () => {
	it('asks for the announcements of the conferences the reader takes part in or helps run', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				...NOTHING_OUTSTANDING.rows,
				conference_staff: [
					{
						conference_id: 'conference-staffed',
						conferences: staffConference({ id: 'conference-staffed' })
					}
				],
				conference_role_members: [administratorRoleRow('conference-staffed')],
				seats: [seatRow('France')]
			}
		});

		await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		// The same conferences the programme is read for, in wave three, once the
		// conferences the reader helps run are known.
		expect(announcementsLookup).toHaveBeenCalledWith(supabase, [
			'conference-thimun',
			'conference-staffed'
		]);
	});

	it('does not count a conference the reader has only applied to', async () => {
		applicationsLookup.mockResolvedValue([makeApplication()]);

		const { supabase } = createStandInSupabase(NOTHING_OUTSTANDING);

		await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		// The lookup itself answers with nothing for an empty list, without asking.
		expect(announcementsLookup).toHaveBeenCalledWith(supabase, []);
	});

	it('passes the announcements through as they came back', async () => {
		const announcement = {
			id: 'announcement-1',
			title: 'Position papers are due on Friday',
			publishedAt: '2026-09-14T09:00:00Z',
			conferenceName: 'THIMUN 2027',
			conferenceSlug: 'thimun-2027',
			conferenceTimezone: 'Europe/Amsterdam'
		};
		announcementsLookup.mockResolvedValue([announcement]);

		const { supabase } = createStandInSupabase({
			rows: { ...NOTHING_OUTSTANDING.rows, seats: [seatRow('France')] }
		});

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expect(dashboard.announcements).toEqual([announcement]);
	});
});

describe('whose programme and announcements are read', () => {
	// `docs/home.md` asks both sections for the conferences the reader takes part
	// in or helps run, at the conferences that have not ended. The programme is
	// read through a `schedule_events` query and the announcements through their
	// own lookup, and both are handed the same list of conference ids.

	/**
	 * Checks what both sections were asked about. An empty list means the
	 * programme was not asked at all, and the announcements lookup, which
	 * answers an empty list with nothing without asking, was handed one.
	 */
	function expectAskedAbout(supabase: SupabaseClient, queries: RecordedQuery[], ids: string[]) {
		const eventQuery = queries.find((query) => query.table === 'schedule_events');

		if (ids.length === 0) {
			expect(eventQuery).toBeUndefined();
		} else {
			expect(eventQuery?.in).toEqual([['conference_id', ids]]);
		}

		expect(announcementsLookup).toHaveBeenCalledWith(supabase, ids);
	}

	it('includes a conference the reader organises through their organisation alone', async () => {
		managedConferencesLookup.mockResolvedValue([makeConference()]);

		const { supabase, queries } = createStandInSupabase({
			rows: { ...NOTHING_OUTSTANDING.rows, organization_members: [membershipRow()] }
		});

		await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		// No staff row: creating a conference writes none, so this is every
		// organiser who has not added themself to its team. Their conference is
		// only known once the managed conferences have come back, which is why
		// both reads wait for the wave after.
		expect(managedConferencesLookup).toHaveBeenCalledWith(supabase, ['organization-1'], []);
		expectAskedAbout(supabase, queries, ['conference-thimun']);
	});

	it('includes a conference the reader volunteers at', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: {
				...NOTHING_OUTSTANDING.rows,
				// A staff row with no administrator role is a volunteer's.
				conference_staff: [{ conference_id: 'conference-helped', conferences: staffConference() }]
			}
		});

		await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		// Not theirs to run, but theirs to be at: the policies hand a volunteer the
		// programme and announcements meant for the team.
		expect(managedConferencesLookup).toHaveBeenCalledWith(supabase, [], []);
		expectAskedAbout(supabase, queries, ['conference-helped']);
	});

	it('includes the conference of an accepted application, and of no other', async () => {
		applicationsLookup.mockResolvedValue([
			makeApplication({ status: 'accepted' }),
			makeApplication({
				id: 'application-waitlisted',
				status: 'waitlisted',
				conference: makeApplicationConference({ id: 'conference-waitlisted' })
			}),
			makeApplication({
				id: 'application-refused',
				status: 'rejected',
				conference: makeApplicationConference({ id: 'conference-refused' })
			})
		]);

		const { supabase, queries } = createStandInSupabase(NOTHING_OUTSTANDING);

		await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		// An accepted applicant takes part even before their seat is given; a
		// waitlisted or refused one does not, any more than one still waiting.
		expectAskedAbout(supabase, queries, ['conference-delft']);
	});

	it('includes the conference of an accepted delegation, and of no other', async () => {
		delegationsLookup.mockResolvedValue([
			makeDelegationMembership(),
			makeDelegationMembership({
				id: 'delegation-draft',
				status: 'draft',
				conference: makeApplicationConference({ id: 'conference-drafted' })
			}),
			makeDelegationMembership({
				id: 'delegation-sent',
				status: 'submitted',
				conference: makeApplicationConference({ id: 'conference-sent' })
			}),
			makeDelegationMembership({
				id: 'delegation-refused',
				status: 'rejected',
				conference: makeApplicationConference({ id: 'conference-refused' })
			}),
			makeDelegationMembership({
				id: 'delegation-left',
				status: 'withdrawn',
				conference: makeApplicationConference({ id: 'conference-left' })
			})
		]);

		const { supabase, queries } = createStandInSupabase(NOTHING_OUTSTANDING);

		await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		// A delegation is held to the same line as an individual application: it
		// is a part in the conference once accepted, and until then it is a
		// question for "Applications" alone.
		expectAskedAbout(supabase, queries, ['conference-delft']);
	});

	it('leaves out every conference that is over, whatever the reader was there', async () => {
		managedConferencesLookup.mockResolvedValue([
			makeConference({ id: 'conference-ran', ...ENDED_DAYS })
		]);
		applicationsLookup.mockResolvedValue([
			makeApplication({
				status: 'accepted',
				conference: makeApplicationConference({ id: 'conference-attended', ...ENDED_DAYS })
			})
		]);
		delegationsLookup.mockResolvedValue([
			makeDelegationMembership({
				conference: makeApplicationConference({ id: 'conference-joined', ...ENDED_DAYS })
			})
		]);

		const { supabase, queries } = createStandInSupabase({
			rows: {
				...NOTHING_OUTSTANDING.rows,
				organization_members: [membershipRow()],
				seats: [seatRow('France', { committees: COMMITTEE_OF_ENDED })],
				committee_chairs: [
					chairRow('Chair', {
						committees: committee({
							id: 'committee-ga',
							slug: 'ga',
							conferences: conferenceOfCommittee({ ...ENDED_DATES, id: 'conference-chaired' })
						})
					})
				],
				conference_staff: [
					{ conference_id: 'conference-helped', conferences: staffConference(ENDED_DATES) }
				]
			}
		});

		await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		// The page is about what is next. An announcement from a conference that
		// is over would take one of the three slots from one still to come.
		expectAskedAbout(supabase, queries, []);
	});

	it('leaves out a staff row whose conference was withheld', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: {
				...NOTHING_OUTSTANDING.rows,
				conference_staff: [{ conference_id: 'conference-staffed', conferences: null }],
				conference_role_members: [administratorRoleRow('conference-staffed')]
			}
		});

		await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		// With no conference row there is nothing to say when it ends, and every
		// list leaves such a row out. An organiser's conference still reaches the
		// list through the managed conferences, which the row's id is handed to.
		expect(managedConferencesLookup).toHaveBeenCalledWith(supabase, [], ['conference-staffed']);
		expectAskedAbout(supabase, queries, []);
	});

	it('names a conference once however many parts the reader has in it', async () => {
		managedConferencesLookup.mockResolvedValue([makeConference()]);

		const { supabase, queries } = createStandInSupabase({
			rows: {
				...NOTHING_OUTSTANDING.rows,
				seats: [seatRow('France')],
				committee_chairs: [chairRow('Chair')],
				conference_staff: [
					{
						conference_id: 'conference-thimun',
						conferences: staffConference({
							id: 'conference-thimun',
							slug: 'thimun-2027',
							name: 'THIMUN 2027'
						})
					}
				],
				conference_role_members: [administratorRoleRow('conference-thimun')]
			}
		});

		await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expectAskedAbout(supabase, queries, ['conference-thimun']);
	});
});

describe('the open conference count', () => {
	it('counts the conferences open for applications for a reader with no conference', async () => {
		openConferenceCountLookup.mockResolvedValue(6);

		const { supabase } = createStandInSupabase(NOTHING_OUTSTANDING);

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		// The "Find your first conference" hero says "6 conferences are open for
		// applications." The count is the directory's own, at the same moment.
		expect(openConferenceCountLookup).toHaveBeenCalledWith(supabase, NOW);
		expect(dashboard.openConferenceCount).toBe(6);
	});

	it('does not count them for a reader who has a conference', async () => {
		const { supabase } = createStandInSupabase({
			rows: { ...NOTHING_OUTSTANDING.rows, seats: [seatRow('France')] }
		});

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		// Their hero is their conference, so nobody else pays for the question.
		expect(openConferenceCountLookup).not.toHaveBeenCalled();
		expect(dashboard.openConferenceCount).toBeNull();
	});
});

describe('the tasks section', () => {
	it('asks for the profile when one of the required fields is empty', async () => {
		const { supabase } = createStandInSupabase({
			rows: { profiles: [profileRow({ institution_name: null })] }
		});

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expect(dashboard.tasks.map((task) => task.title)).toEqual(['Complete your profile']);
	});

	it('asks for a position paper the seat’s conference wants and has not been given', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				...NOTHING_OUTSTANDING.rows,
				seats: [
					seatRow('France', {
						committees: committee({
							conferences: conferenceOfCommittee({
								position_paper_required: true,
								position_paper_deadline: '2026-09-20T22:00:00Z'
							})
						})
					})
				]
			}
		});

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expect(dashboard.tasks).toEqual([
			{
				id: 'position_paper:seat-1',
				kind: 'position_paper',
				conferenceId: 'conference-thimun',
				title: 'Submit position paper (UNSC)',
				// The conference and the seat, from the rows already read.
				detail: 'THIMUN 2027 · France',
				actionLabel: 'Write paper',
				deadline: { day: '2026-09-21', timezone: 'Europe/Amsterdam' },
				href: '/conferences/thimun-2027/committees/unsc/position-paper'
			}
		]);
	});

	it('drops the position paper task once a paper exists for that seat', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: {
				...NOTHING_OUTSTANDING.rows,
				seats: [
					seatRow('France', {
						committees: committee({
							conferences: conferenceOfCommittee({ position_paper_required: true })
						})
					})
				],
				documents: [{ seat_id: 'seat-1' }]
			}
		});

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		// A paper that is in is a hero figure, "Handed in", never a row.
		expect(dashboard.tasks).toEqual([]);

		// Only a paper waiting for the chair or approved counts as in: one sent
		// back for changes is asked for by the query's status filter no more.
		const paperQuery = queries.find((query) => query.table === 'documents');

		expect(paperQuery?.eq).toEqual([['kind', 'position_paper']]);
		expect(paperQuery?.in).toEqual([
			['review_status', ['submitted', 'approved']],
			['seat_id', ['seat-1']]
		]);
	});

	it('asks a chair to review the papers waiting in their committee, linked to the waiting ones', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: {
				...NOTHING_OUTSTANDING.rows,
				committee_chairs: [chairRow('Chair')],
				documents: [{ committee_id: 'committee-unsc' }, { committee_id: 'committee-unsc' }]
			}
		});

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expect(dashboard.tasks).toEqual([
			{
				id: 'review_papers:committee-unsc',
				kind: 'review_papers',
				conferenceId: 'conference-thimun',
				title: 'Review 2 position papers (UNSC)',
				detail: 'THIMUN 2027',
				actionLabel: 'Review papers',
				deadline: null,
				href: '/conferences/thimun-2027/committees/unsc/chair/papers?status=submitted'
			}
		]);

		const paperQuery = queries.find((query) => query.table === 'documents');

		expect(paperQuery?.eq).toEqual([
			['kind', 'position_paper'],
			['review_status', 'submitted']
		]);
		expect(paperQuery?.in).toEqual([['committee_id', ['committee-unsc']]]);
	});

	it('gives a chair no review task while none of their papers waits', async () => {
		const { supabase } = createStandInSupabase({
			rows: { ...NOTHING_OUTSTANDING.rows, committee_chairs: [chairRow('Chair')] }
		});

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expect(dashboard.tasks).toEqual([]);
	});

	it('asks the reader to pay an invoice of their own, naming the conference and the amount', async () => {
		const { supabase } = createStandInSupabase({
			rows: { ...NOTHING_OUTSTANDING.rows, invoices: [invoiceRow()] }
		});

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expect(dashboard.tasks).toEqual([
			{
				id: 'invoice:invoice-1',
				kind: 'invoice',
				conferenceId: 'conference-thimun',
				title: 'Pay invoice INV-0007',
				// The amount and the conference come from the one invoices query.
				detail: 'THIMUN 2027 · €65.00 · due 22 Oct 2026',
				actionLabel: 'Pay invoice',
				deadline: { day: '2026-10-22', timezone: 'Europe/Amsterdam' },
				href: '/invoices/invoice-1'
			}
		]);
	});

	it('leaves out an invoice whose conference was withheld', async () => {
		const { supabase } = createStandInSupabase({
			rows: { ...NOTHING_OUTSTANDING.rows, invoices: [invoiceRow({ conferences: null })] }
		});

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		// With no conference there is no name to put beside the amount and no zone
		// to date it in, the same rule the programme follows.
		expect(dashboard.tasks).toEqual([]);
	});

	it('asks a delegation head to fill the seats nobody is sitting in', async () => {
		delegationsLookup.mockResolvedValue([makeDelegationMembership()]);

		const { supabase, queries } = createStandInSupabase({
			rows: {
				...NOTHING_OUTSTANDING.rows,
				delegation_members: [{ delegation_id: 'delegation-1' }]
			},
			secondRows: {
				seats: [
					{ delegation_id: 'delegation-1', user_id: null },
					{ delegation_id: 'delegation-1', user_id: null },
					{ delegation_id: 'delegation-1', user_id: 'user-7' }
				]
			}
		});

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expect(dashboard.tasks).toEqual([
			expect.objectContaining({
				id: 'delegation_seats:delegation-1',
				conferenceId: 'conference-delft',
				title: 'Assign delegation seats (LSE Team)',
				detail: 'DelftMUN 2026 · 2 seats nobody holds yet',
				actionLabel: 'Assign seats'
			})
		]);

		// Every seat of the delegation is read, with who holds it, so the one query
		// counts both the seats and the empty ones.
		const delegationSeatQuery = queries.filter((query) => query.table === 'seats')[1];

		expect(delegationSeatQuery.columns).toBe('delegation_id, user_id');
		expect(delegationSeatQuery.in).toEqual([['delegation_id', ['delegation-1']]]);
		expect(delegationSeatQuery.is).toEqual([]);
	});

	it('says nothing to a delegation head whose seats are all taken', async () => {
		delegationsLookup.mockResolvedValue([makeDelegationMembership()]);

		const { supabase } = createStandInSupabase({
			rows: {
				...NOTHING_OUTSTANDING.rows,
				delegation_members: [{ delegation_id: 'delegation-1' }]
			},
			secondRows: {
				seats: [{ delegation_id: 'delegation-1', user_id: 'user-7' }]
			}
		});

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expect(dashboard.tasks).toEqual([]);
		expect(dashboard.upcomingConferences[0].delegation).toEqual(
			expect.objectContaining({ seatCount: 1, emptySeatCount: 0 })
		);
	});

	it('says nothing to an ordinary member of a delegation', async () => {
		delegationsLookup.mockResolvedValue([makeDelegationMembership()]);

		// No `delegation_members` row comes back, because that query only asks for
		// the rows whose role is `head`.
		const { supabase } = createStandInSupabase(NOTHING_OUTSTANDING);

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expect(dashboard.tasks).toEqual([]);
	});

	it('asks an organiser to publish a draft whose checklist is done', async () => {
		managedConferencesLookup.mockResolvedValue([READY_DRAFT]);
		checklistCountsLookup.mockResolvedValue(READY_DRAFT_COUNTS);

		const { supabase } = createStandInSupabase({
			rows: {
				...NOTHING_OUTSTANDING.rows,
				organization_members: [
					membershipRow({
						organizations: {
							id: 'organization-1',
							slug: 'thimun-foundation',
							stripe_onboarding_completed_at: '2026-08-01T09:00:00Z'
						}
					})
				]
			}
		});

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expect(dashboard.tasks).toEqual([
			{
				id: 'publish:conference-draft',
				kind: 'publish',
				conferenceId: 'conference-draft',
				title: 'Publish THIMUN 2027',
				detail: 'Draft · 5 of 5 setup steps done',
				actionLabel: 'Publish',
				// Undated: a draft is pressing only while it is the reader's next conference.
				deadline: null,
				href: '/manage/thimun-2027'
			}
		]);
	});

	it('asks an organiser to carry on setting up a draft that is not ready', async () => {
		managedConferencesLookup.mockResolvedValue([
			makeConference({ ...READY_DRAFT, venueName: null })
		]);
		checklistCountsLookup.mockResolvedValue(READY_DRAFT_COUNTS);

		const { supabase } = createStandInSupabase(NOTHING_OUTSTANDING);

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expect(dashboard.tasks).toEqual([
			expect.objectContaining({
				title: 'Finish setting up THIMUN 2027',
				detail: 'Draft · 4 of 5 setup steps done',
				actionLabel: 'Continue setup'
			})
		]);
		// The hero's figure is the same count.
		expect(dashboard.upcomingConferences[0].organiser?.setupSteps).toEqual({
			done: 4,
			required: 5
		});
	});

	it('gives no task for a conference that is over, whatever the reader was there', async () => {
		// Everything that gives a task elsewhere in this file, at a conference
		// that was over last month: a seat owing its paper, a chair with a paper
		// waiting, a headed delegation with an empty seat, a published conference
		// with an application to decide, a draft application of the reader's own,
		// and an unpaid invoice.
		managedConferencesLookup.mockResolvedValue([makeConference(ENDED_DAYS)]);
		applicationsLookup.mockResolvedValue([
			makeApplication({
				status: 'draft',
				submittedAt: null,
				conference: makeApplicationConference(ENDED_DAYS)
			})
		]);
		delegationsLookup.mockResolvedValue([
			makeDelegationMembership({ conference: makeApplicationConference(ENDED_DAYS) })
		]);

		const { supabase, queries } = createStandInSupabase({
			rows: {
				...NOTHING_OUTSTANDING.rows,
				seats: [
					seatRow('France', {
						committees: committee({
							conferences: conferenceOfCommittee({ ...ENDED_DATES, position_paper_required: true })
						})
					})
				],
				committee_chairs: [chairRow('Chair', { committees: COMMITTEE_OF_ENDED })],
				documents: [{ committee_id: 'committee-unsc' }],
				delegation_members: [{ delegation_id: 'delegation-1' }],
				applications: [
					{ conference_id: 'conference-thimun', submitted_at: '2026-08-01T09:00:00Z' }
				],
				invoices: [invoiceRow()]
			},
			secondRows: { seats: [{ delegation_id: 'delegation-1', user_id: null }] }
		});

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		// A task is pressing the moment it is overdue, and would take the page's
		// one button for something nobody can act on any more. Only the profile
		// task, which has no conference, and an unpaid invoice, which is owed
		// whether or not the conference is over, can stay; this profile is
		// complete, so the invoice is the one task left.
		expect(dashboard.tasks.map((task) => task.kind)).toEqual(['invoice']);
		// Nor is anything asked about those papers or those applications.
		const tables = queries.map((query) => query.table);
		expect(tables).not.toContain('documents');
		expect(tables).not.toContain('applications');
		// The conferences are over, so there is no card either; the find hero
		// still knows the reader has been to one.
		expect(dashboard.upcomingConferences).toEqual([]);
		expect(dashboard.hasTakenPart).toBe(true);
	});
});

describe('whether the reader has ever taken part', () => {
	// `hasTakenPart` decides "Find your first conference" over "Find your next
	// conference" in the find hero, so it counts every part the reader ever had,
	// over or not, in any state, where the cards count only what is to come.

	it('is true for a seat at a conference that is over, which gives no card', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				...NOTHING_OUTSTANDING.rows,
				seats: [seatRow('France', { committees: COMMITTEE_OF_ENDED })]
			}
		});

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expect(dashboard.upcomingConferences).toEqual([]);
		expect(dashboard.hasTakenPart).toBe(true);
	});

	it('is true for an application or a delegation in any state', async () => {
		applicationsLookup.mockResolvedValue([makeApplication({ status: 'withdrawn' })]);

		const withdrawn = createStandInSupabase(NOTHING_OUTSTANDING);
		const afterWithdrawing = await loadHomeDashboard(
			withdrawn.supabase,
			USER_ID,
			NOW,
			SHOW_NOTHING_MORE
		);

		expect(afterWithdrawing.hasTakenPart).toBe(true);

		applicationsLookup.mockResolvedValue([]);
		delegationsLookup.mockResolvedValue([makeDelegationMembership({ status: 'rejected' })]);

		const refused = createStandInSupabase(NOTHING_OUTSTANDING);
		const afterRefusal = await loadHomeDashboard(refused.supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		// Neither is a card or an "Applications" row any more, but both were a try.
		expect(afterRefusal.upcomingConferences).toEqual([]);
		expect(afterRefusal.hasTakenPart).toBe(true);
	});

	it('is true for a volunteer at a conference that is over, and for anyone who helps run one', async () => {
		const helped = createStandInSupabase({
			rows: {
				...NOTHING_OUTSTANDING.rows,
				conference_staff: [
					{ conference_id: 'conference-helped', conferences: staffConference(ENDED_DATES) }
				]
			}
		});
		const afterHelping = await loadHomeDashboard(helped.supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expect(afterHelping.hasTakenPart).toBe(true);

		managedConferencesLookup.mockResolvedValue([makeConference()]);

		const organising = createStandInSupabase({
			rows: { ...NOTHING_OUTSTANDING.rows, organization_members: [membershipRow()] }
		});
		const whileOrganising = await loadHomeDashboard(
			organising.supabase,
			USER_ID,
			NOW,
			SHOW_NOTHING_MORE
		);

		expect(whileOrganising.hasTakenPart).toBe(true);
	});
});

describe('quick sessions (S14)', () => {
	/** A quick session's conference, running today: always a draft, in the personal organisation. */
	const QUICK_CONFERENCE = conferenceOfCommittee({
		id: 'conference-quick',
		kind: 'quick_session',
		slug: 'quick-ab12cd34ef',
		name: 'Thursday practice',
		start_date: '2026-09-17',
		end_date: '2026-09-17'
	});

	/** Its one committee, which the reader chairs. */
	const QUICK_COMMITTEE = committee({
		id: 'committee-quick',
		slug: 'thursday-practice',
		name: 'Thursday practice',
		abbreviation: null,
		conferences: QUICK_CONFERENCE
	});

	/** The committee with its newest session, as `listMyQuickSessions` reads it. */
	const QUICK_COMMITTEE_WITH_SESSION = {
		id: 'committee-quick',
		created_at: '2026-09-10T18:00:00Z',
		committee_sessions: [
			{ name: 'Session 2', status: 'in_progress', started_at: '2026-09-17T11:00:00Z' }
		]
	};

	it('lists a quick session the reader chairs under "Quick sessions" alone', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: {
				...NOTHING_OUTSTANDING.rows,
				committee_chairs: [chairRow('Chair', { committees: QUICK_COMMITTEE })],
				committees: [QUICK_COMMITTEE_WITH_SESSION]
			}
		});

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expect(dashboard.quickSessions).toEqual([
			{
				committeeId: 'committee-quick',
				committeeName: 'Thursday practice',
				statusLine: 'Session 2 in progress',
				isInProgress: true,
				href: '/conferences/quick-ab12cd34ef/committees/thursday-practice/chair'
			}
		]);
		// It runs today and the reader chairs it, yet it is in no other part of the
		// page: not a card, not a task, and not a reason for "Run a quick session"
		// in the title row, which the section's own link already offers. Nor is a
		// quick session a conference the reader has been to.
		expect(dashboard.upcomingConferences).toEqual([]);
		expect(dashboard.tasks).toEqual([]);
		expect(dashboard.todayItems).toEqual([]);
		expect(dashboard.chairsSomething).toBe(false);
		expect(dashboard.hasTakenPart).toBe(false);
		// Nothing is asked about its papers, its programme or its room for the other sections.
		const tables = queries.map((query) => query.table);
		expect(tables).not.toContain('documents');
		expect(tables).not.toContain('schedule_events');
		expect(tables).not.toContain('committee_state');
		// Its newest session is read once, in the second wave.
		expect(queries.filter((query) => query.table === 'committees')).toHaveLength(1);
		expect(queries.find((query) => query.table === 'committees')?.in).toEqual([
			['id', ['committee-quick']]
		]);
	});

	it('keeps the reader’s other committees, and gives somebody with only quick sessions no conference', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				...NOTHING_OUTSTANDING.rows,
				committee_chairs: [
					chairRow('Chair', { committees: QUICK_COMMITTEE }),
					chairRow('Chair', { committees: committee() })
				],
				committees: [QUICK_COMMITTEE_WITH_SESSION]
			}
		});

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expect(dashboard.quickSessions.map((row) => row.committeeId)).toEqual(['committee-quick']);
		expect(dashboard.upcomingConferences.map((card) => card.id)).toEqual(['conference-thimun']);
		// The real committee makes them a chair; the quick session alone would not.
		expect(dashboard.chairsSomething).toBe(true);
	});

	it('leaves out a staff row of a quick session', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				...NOTHING_OUTSTANDING.rows,
				conference_staff: [
					{
						conference_id: 'conference-quick',
						conferences: staffConference({
							id: 'conference-quick',
							kind: 'quick_session',
							slug: 'quick-ab12cd34ef',
							name: 'Thursday practice',
							banner_path: null,
							start_date: '2026-09-17',
							end_date: '2026-09-17',
							timezone: 'Europe/Amsterdam'
						})
					}
				]
			}
		});

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expect(dashboard.upcomingConferences).toEqual([]);
	});

	it('asks nothing about quick sessions for somebody who has none', async () => {
		const { supabase, queries } = createStandInSupabase(NOTHING_OUTSTANDING);

		const dashboard = await loadHomeDashboard(supabase, USER_ID, NOW, SHOW_NOTHING_MORE);

		expect(dashboard.quickSessions).toEqual([]);
		expect(queries.map((query) => query.table)).not.toContain('committees');
	});
});

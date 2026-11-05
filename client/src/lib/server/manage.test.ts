import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Conference } from '$lib/conferences';
import type { ConferenceFigures, PendingInvite } from '$lib/manage';
import type { SetupProgress } from '$lib/setup-steps';
import { listConferencesByIds, listConferencesForOrganizations } from './conferences';
import { listMyInvites } from './invites';
import { readConferenceIdsPermitting, readManageableConferenceIds } from './my-permissions';
import {
	hasOrganiserArea,
	loadConferenceDashboard,
	loadManageIndex,
	readChecklistCounts
} from './manage';

// These tests are about the decisions `loadManageIndex` makes: which lookups it
// sends, which conference ends up under which organisation, which one it leaves
// out because it is already listed, and where each conference's figures and
// setup steps land.
// Nothing here talks to a database; the stand-in client below answers each
// table with whatever the test asked for. Whether the database lets somebody
// read those rows at all is Row Level Security's decision, and that is tested
// in `tests/db/`.
//
// `vi.mock` replaces the whole of `./conferences` and `./invites` for this
// file, so those three lookups answer with what a test tells them to instead of
// building a query. What they put in their own filters is tested in
// `conferences.test.ts` and `invites.test.ts`.
vi.mock('./conferences', () => ({
	listConferencesForOrganizations: vi.fn(),
	listConferencesByIds: vi.fn()
}));

vi.mock('./invites', () => ({
	listMyInvites: vi.fn()
}));

// Which conferences the reader holds a permission on is the database's answer,
// tested in `my-permissions.test.ts` and `tests/db/`; here a test says it.
vi.mock('./my-permissions', () => ({
	readManageableConferenceIds: vi.fn(),
	readConferenceIdsPermitting: vi.fn()
}));

/** The three mocked lookups, typed so a test can say what they answer with. */
const organizationConferencesLookup = vi.mocked(listConferencesForOrganizations);
const staffConferencesLookup = vi.mocked(listConferencesByIds);
const invitesLookup = vi.mocked(listMyInvites);
const manageableLookup = vi.mocked(readManageableConferenceIds);
const invoiceReaderLookup = vi.mocked(readConferenceIdsPermitting);

/**
 * What an owner of the organisation holds: every conference it runs opens for
 * them, whichever ids a test makes up. Only `has` is ever asked of the set.
 */
const EVERY_CONFERENCE = { has: () => true } as unknown as Set<string>;

/** The signed-in person these tests are about. */
const USER_ID = 'user-1';

/** The moment the list is drawn, which decides whether an application window has closed. */
const NOW = new Date('2026-10-02T09:00:00Z');

/**
 * A conference with every field filled in, which the helper below copies.
 *
 * A `Conference` has a lot of fields and these tests only care about its id,
 * its name and the organisation it belongs to, so this one sits here once
 * rather than in every test.
 */
const SAMPLE_CONFERENCE: Conference = {
	id: 'conference-thimun',
	slug: 'thimun-2027',
	name: 'THIMUN 2027',
	description: null,
	organizationName: 'Sample Europe MUN Network',
	organizationSlug: 'sample-europe-mun-network',
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
function makeConference(changes: Partial<Conference> = {}): Conference {
	return { ...SAMPLE_CONFERENCE, ...changes };
}

/** One `organizations` row as it comes along on a membership. */
function organizationOfMembership(changes: Record<string, unknown> = {}) {
	return {
		id: 'organization-1',
		name: 'Sample Europe MUN Network',
		slug: 'sample-europe-mun-network',
		logo_path: null,
		stripe_onboarding_completed_at: null,
		...changes
	};
}

/** One `organization_members` row, with the organisation attached. */
function membershipRow(role: string, organization: unknown = organizationOfMembership()) {
	return { role, organizations: organization };
}

/**
 * One `conference_role_members` row of the reader's, with the role along: which
 * conference, and what the role is called and grants. The Chair preset unless a
 * test says otherwise.
 */
function staffRoleRow(
	conferenceId: string,
	role: { name: string; position?: number; permissions?: string[]; scope?: string } = {
		name: 'Chair'
	}
) {
	return {
		conference_id: conferenceId,
		conference_roles: {
			name: role.name,
			position: role.position ?? 1,
			permissions: role.permissions ?? [],
			scope: role.scope ?? 'committees'
		}
	};
}

/** The Organiser preset on one conference, which is everything there. */
function organiserRoleRow(conferenceId: string) {
	return staffRoleRow(conferenceId, {
		name: 'Organiser',
		position: 0,
		permissions: ['administrator'],
		scope: 'conference'
	});
}

/** One `applications` row, which the list reads for its conference and its status. */
function applicationRow(conferenceId: string, status = 'submitted') {
	return { conference_id: conferenceId, status };
}

/** The figures of a conference nothing has been counted for, apart from what a test names. */
function makeFigures(changes: Partial<ConferenceFigures> = {}): ConferenceFigures {
	return {
		applicationCount: 0,
		toReviewCount: 0,
		seatCount: 0,
		heldSeatCount: 0,
		feesPaidCents: 0,
		currency: 'EUR',
		...changes
	};
}

/** No setup step done, which a test changes the steps of. */
const NO_STEPS_DONE: SetupProgress = {
	details: false,
	committees: false,
	applicationForm: false,
	fees: false,
	team: false
};

/**
 * A draft conference, which is the only kind whose row says which setup step it
 * is on. `SAMPLE_CONFERENCE` above is published.
 */
function makeDraft(changes: Partial<Conference> = {}): Conference {
	return makeConference({ status: 'draft', ...changes });
}

/** One `conferences` row as the checklist reads it: the one payment column. */
function paymentSettingRow(conferenceId: string, collectsPaymentsManually = false) {
	return { id: conferenceId, collects_payments_manually: collectsPaymentsManually };
}

/** One `committees` row as the checklist reads it. */
function committeeRow(committeeId: string, conferenceId: string) {
	return { id: committeeId, conference_id: conferenceId };
}

/**
 * One `seats` row as the checklist reads it: which committee it is in, and
 * whether it is on offer. The dashboard's own `seatRow` further down reads more
 * of the same table, because it also counts who is sitting in each seat.
 */
function checklistSeatRow(committeeId: string, isAvailable = true) {
	return { committee_id: committeeId, is_available: isAvailable };
}

/** The rows each table answers with, and which tables fail instead of answering. */
type StandInAnswers = {
	/** Keyed by table name. A table with no entry answers with no rows. */
	rows?: Record<string, unknown[]>;
	/** Keyed by table name, holding the message that table's query fails with. */
	errors?: Record<string, string>;
};

/** What one query the organiser area sent was asking for. */
type RecordedQuery = {
	/** The relation `.from(...)` named. */
	table: string;
	/** The text `.select(...)` was given, so a test can see what came along on the row. */
	columns: string;
	eq: [string, unknown][];
	/** `[column, value]` for every `.neq(...)`, which asks for a column to be anything else. */
	neq: [string, unknown][];
	/** `[column, values]` for every `.in(...)`. */
	in: [string, unknown[]][];
	/** The number each `.limit(...)` was given. */
	limit: number[];
	/** `[column, ascending]` for every `.order(...)`. */
	order: [string, boolean][];
	/** The arguments `.rpc(...)` was given, for a call to a database function rather than a table. */
	functionArguments: Record<string, unknown> | null;
};

/** What an awaited query answers with: the two fields these lookups read. */
type QueryAnswer = { data: unknown[] | null; error: { message: string } | null };

/** What `maybeSingle` answers with: one row rather than a list, or nothing at all. */
type SingleRowAnswer = { data: unknown; error: { message: string } | null };

/**
 * One step of a query. Every step hands the builder back, which is what lets
 * the next step be called on it.
 */
type StandInBuilder = {
	select: (columns: string) => StandInBuilder;
	eq: (column: string, value: unknown) => StandInBuilder;
	neq: (column: string, value: unknown) => StandInBuilder;
	in: (column: string, values: unknown[]) => StandInBuilder;
	limit: (count: number) => StandInBuilder;
	order: (column: string, options: { ascending: boolean }) => StandInBuilder;
	maybeSingle: () => { overrideTypes: () => Promise<SingleRowAnswer> };
	overrideTypes: () => Promise<QueryAnswer>;
	then: (resolve: (answer: QueryAnswer) => void) => void;
};

/**
 * A stand-in Supabase client that answers by table name and writes down what it
 * was asked for.
 *
 * The real client is a builder: `.from(...)` gives back an object with
 * `.select(...)` on it, `.select(...)` gives back one with `.eq(...)` on it, and
 * so on. Each step adds one condition to a query that is only sent once the
 * chain is awaited. This copies that shape; every step hands the same builder
 * back, and `overrideTypes`, which most lookups end with, changes the type of
 * the answer in the real client rather than the answer itself.
 */
function createStandInSupabase(answers: StandInAnswers = {}): {
	supabase: SupabaseClient;
	queries: RecordedQuery[];
} {
	const queries: RecordedQuery[] = [];

	function builderFor(table: string): StandInBuilder {
		const query: RecordedQuery = {
			table,
			columns: '',
			eq: [],
			neq: [],
			in: [],
			limit: [],
			order: [],
			functionArguments: null
		};
		queries.push(query);

		const message = answers.errors?.[table];
		const rows = answers.rows?.[table] ?? [];
		const answer: QueryAnswer = {
			data: message ? null : rows,
			error: message ? { message } : null
		};
		// `maybeSingle` asks for one row, so it is answered with the first of the
		// rows this relation was given, or with nothing when it was given none.
		const singleRowAnswer: SingleRowAnswer = {
			data: message ? null : (rows[0] ?? null),
			error: message ? { message } : null
		};

		const builder: StandInBuilder = {
			select: (columns: string) => {
				query.columns = columns;
				return builder;
			},
			eq: (column: string, value: unknown) => {
				query.eq.push([column, value]);
				return builder;
			},
			neq: (column: string, value: unknown) => {
				query.neq.push([column, value]);
				return builder;
			},
			in: (column: string, values: unknown[]) => {
				query.in.push([column, values]);
				return builder;
			},
			limit: (count: number) => {
				query.limit.push(count);
				return builder;
			},
			order: (column: string, options: { ascending: boolean }) => {
				query.order.push([column, options.ascending]);
				return builder;
			},
			maybeSingle: () => ({ overrideTypes: async () => singleRowAnswer }),
			overrideTypes: async () => answer,
			// `hasOrganiserArea` has no last step of its own: it awaits the chain
			// straight after `.limit(...)`. A `then` method is what makes that
			// possible, here and in the real client.
			then: (resolve) => resolve(answer)
		};

		return builder;
	}

	/**
	 * `rpc` calls a function in the database. It is answered like a table named
	 * after the function, with the arguments written down on the query.
	 */
	function rpc(name: string, functionArguments: Record<string, unknown>): StandInBuilder {
		const builder = builderFor(name);
		queries[queries.length - 1].functionArguments = functionArguments;

		return builder;
	}

	const supabase = { from: builderFor, rpc };

	return { supabase: supabase as unknown as SupabaseClient, queries };
}

/** The relations a run asked for, in the order it asked for them. */
function tablesRead(queries: RecordedQuery[]): string[] {
	return queries.map((query) => query.table);
}

/** The one query that read a given relation, for the tests about its filters. */
function queryFor(queries: RecordedQuery[], table: string): RecordedQuery | undefined {
	return queries.find((query) => query.table === table);
}

/**
 * The query that read a given relation and asked for these columns, for a
 * relation two lookups read: `/manage` reads `conferences` and `seats` once for
 * the setup steps and once for the figures.
 */
function queryWithColumns(
	queries: RecordedQuery[],
	table: string,
	columns: string
): RecordedQuery | undefined {
	return queries.find((query) => query.table === table && query.columns.includes(columns));
}

/**
 * Every query that read a given relation, in the order they were sent.
 *
 * The dashboard reads `applications` twice, once for the counts and once for
 * the newest five, so a test about one of the two has to say which it means.
 */
function queriesFor(queries: RecordedQuery[], table: string): RecordedQuery[] {
	return queries.filter((query) => query.table === table);
}

beforeEach(() => {
	// Every test starts with all three mocked lookups answering with nothing, so
	// a test only says what it is about.
	organizationConferencesLookup.mockResolvedValue([]);
	staffConferencesLookup.mockResolvedValue([]);
	invitesLookup.mockResolvedValue([]);
	manageableLookup.mockResolvedValue(EVERY_CONFERENCE);
	invoiceReaderLookup.mockResolvedValue(EVERY_CONFERENCE);
});

describe('loadManageIndex', () => {
	it('gives somebody who runs nothing three empty lists rather than failing', async () => {
		const { supabase } = createStandInSupabase();

		const index = await loadManageIndex(supabase, USER_ID, NOW);

		expect(index).toEqual({ organizations: [], staffConferences: [], pendingInvites: [] });
	});

	it('asks both tables only about the signed-in person', async () => {
		const { supabase, queries } = createStandInSupabase();

		await loadManageIndex(supabase, USER_ID, NOW);

		expect(tablesRead(queries)).toEqual(['organization_members', 'conference_role_members']);
		expect(queries[0].eq).toEqual([['user_id', USER_ID]]);
		// Every role counts here, unlike on the home dashboard: the section shows
		// what the person helps with and puts their roles beside it.
		expect(queries[1].eq).toEqual([['user_id', USER_ID]]);
		expect(queries[1].columns).toContain('conference_roles(');
	});

	it('brings the organisation along on the membership row instead of looking it up again', async () => {
		const { supabase, queries } = createStandInSupabase();

		await loadManageIndex(supabase, USER_ID, NOW);

		expect(queries[0].columns).toContain('organizations(');
		expect(queries[0].columns).toContain('stripe_onboarding_completed_at');
	});

	it('hands the conference lookups the ids the first wave found', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				organization_members: [membershipRow('owner')],
				conference_role_members: [staffRoleRow('conference-staffed')]
			}
		});

		await loadManageIndex(supabase, USER_ID, NOW);

		expect(organizationConferencesLookup).toHaveBeenCalledWith(supabase, ['organization-1']);
		expect(staffConferencesLookup).toHaveBeenCalledWith(supabase, ['conference-staffed']);
	});

	it('lists an organisation with its role and its conferences under it', async () => {
		organizationConferencesLookup.mockResolvedValue([makeConference()]);

		const { supabase } = createStandInSupabase({
			rows: { organization_members: [membershipRow('owner')] }
		});

		const index = await loadManageIndex(supabase, USER_ID, NOW);

		expect(index.organizations).toHaveLength(1);
		expect(index.organizations[0].myRole).toBe('owner');
		expect(index.organizations[0].organization).toEqual({
			id: 'organization-1',
			name: 'Sample Europe MUN Network',
			slug: 'sample-europe-mun-network',
			logoPath: null,
			isStripeConnected: false
		});
		expect(index.organizations[0].conferences).toEqual([
			// `makeConference` is published, and a published conference has nothing
			// left to set up, so it carries no setup steps.
			{
				conference: makeConference(),
				figures: makeFigures(),
				setupProgress: null,
				isOnTeam: true
			}
		]);
	});

	it('puts each conference under its own organisation, matched by slug', async () => {
		// A `Conference` carries no `organization_id`, only the organisation's name
		// and slug, so the slug is what the two are matched on.
		organizationConferencesLookup.mockResolvedValue([
			makeConference({ id: 'conference-1', organizationSlug: 'amsterdam-mun' }),
			makeConference({ id: 'conference-2', organizationSlug: 'vienna-mun' })
		]);

		const { supabase } = createStandInSupabase({
			rows: {
				organization_members: [
					membershipRow(
						'owner',
						organizationOfMembership({
							id: 'organization-1',
							name: 'Amsterdam MUN',
							slug: 'amsterdam-mun'
						})
					),
					membershipRow(
						'member',
						organizationOfMembership({
							id: 'organization-2',
							name: 'Vienna MUN',
							slug: 'vienna-mun'
						})
					)
				]
			}
		});

		const index = await loadManageIndex(supabase, USER_ID, NOW);

		expect(index.organizations[0].conferences.map((row) => row.conference.id)).toEqual([
			'conference-1'
		]);
		expect(index.organizations[1].conferences.map((row) => row.conference.id)).toEqual([
			'conference-2'
		]);
	});

	it('sorts the organisations by name', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				organization_members: [
					membershipRow(
						'owner',
						organizationOfMembership({ id: 'organization-2', name: 'Vienna MUN', slug: 'vienna' })
					),
					membershipRow(
						'member',
						organizationOfMembership({
							id: 'organization-1',
							name: 'Amsterdam MUN',
							slug: 'amsterdam'
						})
					)
				]
			}
		});

		const index = await loadManageIndex(supabase, USER_ID, NOW);

		expect(index.organizations.map((group) => group.organization.name)).toEqual([
			'Amsterdam MUN',
			'Vienna MUN'
		]);
	});

	it('skips a membership whose organisation could not be read', async () => {
		const { supabase } = createStandInSupabase({
			rows: { organization_members: [membershipRow('owner', null)] }
		});

		const index = await loadManageIndex(supabase, USER_ID, NOW);

		// There is no name for the heading and no id to ask for conferences with,
		// so the membership is left out rather than shown half empty.
		expect(index.organizations).toEqual([]);
		expect(organizationConferencesLookup).toHaveBeenCalledWith(supabase, []);
	});

	it('gives the personal organisation of quick sessions no heading (S14)', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: {
				organization_members: [
					membershipRow('owner'),
					membershipRow(
						'owner',
						organizationOfMembership({
							id: 'organization-personal',
							name: 'Quick sessions',
							slug: 'personal-ab12cd34ef',
							is_personal: true
						})
					)
				]
			}
		});

		const index = await loadManageIndex(supabase, USER_ID, NOW);

		expect(queries[0].columns).toContain('is_personal');
		expect(index.organizations.map((group) => group.organization.name)).toEqual([
			'Sample Europe MUN Network'
		]);
		// Its quick sessions are never asked for either.
		expect(organizationConferencesLookup).toHaveBeenCalledWith(supabase, ['organization-1']);
	});

	it('lists a conference the person only helps with, with their role', async () => {
		staffConferencesLookup.mockResolvedValue([makeConference({ id: 'conference-staffed' })]);
		// A chair's permissions open no page of the management area yet.
		manageableLookup.mockResolvedValue(new Set());

		const { supabase } = createStandInSupabase({
			rows: { conference_role_members: [staffRoleRow('conference-staffed')] }
		});

		const index = await loadManageIndex(supabase, USER_ID, NOW);

		expect(index.staffConferences).toEqual([
			{
				conference: makeConference({ id: 'conference-staffed' }),
				roleNames: ['Chair'],
				mayManage: false
			}
		]);
	});

	it("names every role somebody holds on one conference, in the conference's order", async () => {
		staffConferencesLookup.mockResolvedValue([makeConference({ id: 'conference-staffed' })]);

		const { supabase } = createStandInSupabase({
			rows: {
				conference_role_members: [
					staffRoleRow('conference-staffed', { name: 'Press', position: 3 }),
					organiserRoleRow('conference-staffed')
				]
			}
		});

		const index = await loadManageIndex(supabase, USER_ID, NOW);

		// Two rows for one conference are one entry, and its id was looked up once.
		expect(staffConferencesLookup).toHaveBeenCalledWith(supabase, ['conference-staffed']);
		expect(index.staffConferences).toEqual([
			{
				conference: makeConference({ id: 'conference-staffed' }),
				roleNames: ['Organiser', 'Press'],
				// The permissions of these roles open `/manage/[slug]`.
				mayManage: true
			}
		]);
	});

	it('lists a conference the person is both a member and staff of once, under the organisation', async () => {
		organizationConferencesLookup.mockResolvedValue([makeConference()]);
		staffConferencesLookup.mockResolvedValue([makeConference()]);

		const { supabase } = createStandInSupabase({
			rows: {
				organization_members: [membershipRow('owner')],
				conference_role_members: [organiserRoleRow(SAMPLE_CONFERENCE.id)]
			}
		});

		const index = await loadManageIndex(supabase, USER_ID, NOW);

		expect(index.organizations[0].conferences).toHaveLength(1);
		// Two entries for one conference would read as a mistake, and the
		// organisation is the more useful of the two places to put it.
		expect(index.staffConferences).toEqual([]);
	});

	it("reads the figures of the organisations' conferences alone, every conference at once", async () => {
		organizationConferencesLookup.mockResolvedValue([makeConference({ id: 'conference-1' })]);
		staffConferencesLookup.mockResolvedValue([makeConference({ id: 'conference-2' })]);

		const { supabase, queries } = createStandInSupabase({
			rows: { conference_role_members: [organiserRoleRow('conference-2')] }
		});

		await loadManageIndex(supabase, USER_ID, NOW);

		// Only the organisation's conferences: they are the only rows with
		// figures, and only an organiser may read an `applications` row at all,
		// so a conference somebody merely chairs would answer nought.
		expect(queryFor(queries, 'applications')?.in).toEqual([['conference_id', ['conference-1']]]);
		expect(queryFor(queries, 'invoices')?.in).toEqual([['conference_id', ['conference-1']]]);
		expect(queryWithColumns(queries, 'seats', 'committees!inner')?.in).toEqual([
			['committees.conference_id', ['conference-1']]
		]);
	});

	it('names a conference of the organisation the reader holds no role on, without its figures', async () => {
		organizationConferencesLookup.mockResolvedValue([
			makeConference({ id: 'conference-1' }),
			makeConference({ id: 'conference-2' })
		]);
		manageableLookup.mockResolvedValue(new Set(['conference-1']));

		const { supabase, queries } = createStandInSupabase({
			rows: { organization_members: [membershipRow('member')] }
		});

		const index = await loadManageIndex(supabase, USER_ID, NOW);
		const conferences = index.organizations[0].conferences;

		expect(conferences.map((summary) => [summary.conference.id, summary.isOnTeam])).toEqual([
			['conference-1', true],
			['conference-2', false]
		]);
		// The figures would be read through policies the reader does not pass,
		// so they are not asked for at all.
		expect(queryFor(queries, 'applications')?.in).toEqual([['conference_id', ['conference-1']]]);
	});

	it("puts each conference's figures on the conference they belong to", async () => {
		organizationConferencesLookup.mockResolvedValue([
			makeConference({ id: 'conference-1' }),
			makeConference({ id: 'conference-2' })
		]);

		const { supabase } = createStandInSupabase({
			rows: {
				organization_members: [membershipRow('owner')],
				applications: [
					applicationRow('conference-1'),
					applicationRow('conference-1', 'accepted'),
					applicationRow('conference-2')
				],
				invoices: [{ conference_id: 'conference-2', amount_cents: 4500 }],
				conferences: [
					{ id: 'conference-1', currency: 'GBP' },
					{ id: 'conference-2', currency: 'EUR' }
				]
			}
		});

		const index = await loadManageIndex(supabase, USER_ID, NOW);

		expect(index.organizations[0].conferences).toEqual([
			{
				conference: makeConference({ id: 'conference-1' }),
				figures: makeFigures({ applicationCount: 2, toReviewCount: 1, currency: 'GBP' }),
				setupProgress: null,
				isOnTeam: true
			},
			{
				conference: makeConference({ id: 'conference-2' }),
				figures: makeFigures({ applicationCount: 1, toReviewCount: 1, feesPaidCents: 4500 }),
				setupProgress: null,
				isOnTeam: true
			}
		]);
	});

	it('sends no figure query at all when there are no conferences to count for', async () => {
		const { supabase, queries } = createStandInSupabase();

		await loadManageIndex(supabase, USER_ID, NOW);

		expect(tablesRead(queries)).not.toContain('applications');
		expect(tablesRead(queries)).not.toContain('invoices');
	});

	it("gives a draft's row the setup steps its checklist says are done", async () => {
		// A draft with a description, a tagline, a venue and a contact email has
		// its details done, and nothing else yet.
		organizationConferencesLookup.mockResolvedValue([
			makeDraft({
				id: 'conference-draft',
				description: 'Three days of debate on the water.',
				tagline: 'Debate the world',
				venueName: 'Town Hall',
				contactEmail: 'team@example.test'
			})
		]);

		const { supabase } = createStandInSupabase({
			rows: {
				organization_members: [membershipRow('owner')],
				conferences: [paymentSettingRow('conference-draft')]
			}
		});

		const index = await loadManageIndex(supabase, USER_ID, NOW);

		expect(index.organizations[0].conferences[0].setupProgress).toEqual({
			...NO_STEPS_DONE,
			details: true
		});
	});

	it('ticks Committees and Fees from the committees, their seats and the fees', async () => {
		organizationConferencesLookup.mockResolvedValue([makeDraft({ id: 'conference-draft' })]);

		const { supabase } = createStandInSupabase({
			rows: {
				organization_members: [membershipRow('owner')],
				conferences: [paymentSettingRow('conference-draft')],
				committees: [committeeRow('committee-1', 'conference-draft')],
				fees: [{ conference_id: 'conference-draft' }],
				seats: [checklistSeatRow('committee-1')]
			}
		});

		const index = await loadManageIndex(supabase, USER_ID, NOW);

		expect(index.organizations[0].conferences[0].setupProgress).toEqual({
			...NO_STEPS_DONE,
			committees: true,
			fees: true
		});
	});

	it('does not tick Committees for a committee whose every seat is switched off', async () => {
		organizationConferencesLookup.mockResolvedValue([makeDraft({ id: 'conference-draft' })]);

		const { supabase } = createStandInSupabase({
			rows: {
				organization_members: [membershipRow('owner')],
				conferences: [paymentSettingRow('conference-draft')],
				committees: [committeeRow('committee-1', 'conference-draft')],
				// The seat exists but is on offer to nobody, so the committee is one
				// the checklist is still waiting for.
				seats: [checklistSeatRow('committee-1', false)]
			}
		});

		const index = await loadManageIndex(supabase, USER_ID, NOW);

		expect(index.organizations[0].conferences[0].setupProgress).toEqual(NO_STEPS_DONE);
	});

	it('ticks Team once somebody has been invited to help with the draft', async () => {
		organizationConferencesLookup.mockResolvedValue([makeDraft({ id: 'conference-draft' })]);

		const { supabase, queries } = createStandInSupabase({
			rows: {
				organization_members: [membershipRow('owner')],
				conferences: [paymentSettingRow('conference-draft')],
				invites: [{ conference_id: 'conference-draft' }]
			}
		});

		const index = await loadManageIndex(supabase, USER_ID, NOW);

		expect(index.organizations[0].conferences[0].setupProgress?.team).toBe(true);
		expect(queryFor(queries, 'invites')?.in).toEqual([['conference_id', ['conference-draft']]]);
	});

	it('leaves the setup steps off a conference that is already published', async () => {
		organizationConferencesLookup.mockResolvedValue([makeConference({ id: 'conference-1' })]);

		const { supabase, queries } = createStandInSupabase({
			rows: { organization_members: [membershipRow('owner')] }
		});

		const index = await loadManageIndex(supabase, USER_ID, NOW);

		// Nothing is left to set up, so the row shows its phase and figures and no
		// setup steps at all. Nothing is asked about them either, which is the
		// other half of the same decision.
		expect(index.organizations[0].conferences[0].setupProgress).toBeNull();
		expect(tablesRead(queries)).not.toContain('committees');
		expect(tablesRead(queries)).not.toContain('fees');
		expect(tablesRead(queries)).not.toContain('invites');
	});

	it('asks about the drafts alone, in one query for each thing the setup steps need', async () => {
		organizationConferencesLookup.mockResolvedValue([
			makeDraft({ id: 'conference-draft' }),
			makeConference({ id: 'conference-published' })
		]);

		const { supabase, queries } = createStandInSupabase({
			rows: {
				organization_members: [membershipRow('owner')],
				conferences: [paymentSettingRow('conference-draft')],
				committees: [committeeRow('committee-1', 'conference-draft')]
			}
		});

		await loadManageIndex(supabase, USER_ID, NOW);

		// One query each for every draft at once, rather than four queries per
		// conference: an organiser with six drafts would otherwise send
		// twenty-four requests to print six lines.
		expect(queryWithColumns(queries, 'conferences', 'collects_payments_manually')?.in).toEqual([
			['id', ['conference-draft']]
		]);
		expect(queryFor(queries, 'committees')?.in).toEqual([['conference_id', ['conference-draft']]]);
		expect(queryFor(queries, 'fees')?.in).toEqual([['conference_id', ['conference-draft']]]);

		// The seats can only be asked for once the committees are known, and they
		// are asked for by committee, because a seat carries no conference.
		expect(queryWithColumns(queries, 'seats', 'committee_id')?.in).toEqual([
			['committee_id', ['committee-1']]
		]);
	});

	it('sends no seat query by committee when the drafts have no committees between them', async () => {
		organizationConferencesLookup.mockResolvedValue([makeDraft({ id: 'conference-draft' })]);

		const { supabase, queries } = createStandInSupabase({
			rows: {
				organization_members: [membershipRow('owner')],
				conferences: [paymentSettingRow('conference-draft')]
			}
		});

		await loadManageIndex(supabase, USER_ID, NOW);

		// An empty list would have to be written as `in.()`, which PostgREST
		// refuses, and there are no seats to find anyway. The figures still read
		// the seats once, by conference.
		expect(queryWithColumns(queries, 'seats', 'committee_id')).toBeUndefined();
	});

	it('passes the invitations through as they came back', async () => {
		const invite: PendingInvite = {
			id: 'invite-1',
			kind: 'organization_member',
			role: 'admin',
			name: 'Sample Europe MUN Network'
		};

		invitesLookup.mockResolvedValue([invite]);

		const { supabase } = createStandInSupabase();

		const index = await loadManageIndex(supabase, USER_ID, NOW);

		expect(index.pendingInvites).toEqual([invite]);
	});

	it('raises when a query fails, rather than showing an empty organiser area', async () => {
		const { supabase } = createStandInSupabase({
			errors: { organization_members: 'no connection' }
		});

		// The page is all or nothing: a failed query is a bug, and an area that
		// quietly said "you run nothing" would hide it.
		await expect(loadManageIndex(supabase, USER_ID, NOW)).rejects.toThrow('no connection');
	});

	it('raises when reading the figures fails', async () => {
		organizationConferencesLookup.mockResolvedValue([makeConference()]);

		const { supabase } = createStandInSupabase({
			rows: { organization_members: [membershipRow('owner')] },
			errors: { applications: 'no connection' }
		});

		await expect(loadManageIndex(supabase, USER_ID, NOW)).rejects.toThrow('no connection');
	});

	it('raises when one of the conference lookups fails', async () => {
		staffConferencesLookup.mockRejectedValue(new Error('no connection'));

		const { supabase } = createStandInSupabase();

		await expect(loadManageIndex(supabase, USER_ID, NOW)).rejects.toThrow('no connection');
	});
});

describe('readChecklistCounts', () => {
	// The counts themselves are read through `loadManageIndex` above, which is
	// where they are drawn. These tests are about the lookup on its own, because
	// the home dashboard's "Publish {conference}" task calls it directly and must
	// get the same answer this page does.

	it('answers nothing at all, without asking, when there are no conferences', async () => {
		const { supabase, queries } = createStandInSupabase();

		const counts = await readChecklistCounts(supabase, []);

		expect(counts).toEqual({});
		// An empty list would have to be written as `in.()`, which PostgREST
		// refuses, and there is nothing to ask about in any case.
		expect(queries).toEqual([]);
	});

	it('counts the committees, the empty ones and the fees of each conference', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				conferences: [paymentSettingRow('conference-a', true)],
				committees: [
					committeeRow('committee-1', 'conference-a'),
					committeeRow('committee-2', 'conference-a'),
					committeeRow('committee-3', 'conference-b')
				],
				fees: [{ conference_id: 'conference-a' }],
				// Only the first committee is offering a seat, so the second is one of
				// the ones the checklist is still waiting for.
				seats: [checklistSeatRow('committee-1'), checklistSeatRow('committee-2', false)]
			}
		});

		const counts = await readChecklistCounts(supabase, ['conference-a', 'conference-b']);

		expect(counts).toEqual({
			'conference-a': {
				committeeCount: 2,
				committeesWithoutAvailableSeatsCount: 1,
				// The one committee without a seat, which the checklist's line links to.
				onlyCommitteeWithoutSeatsId: 'committee-2',
				feeCount: 1,
				collectsPaymentsManually: true
			},
			'conference-b': {
				committeeCount: 1,
				committeesWithoutAvailableSeatsCount: 1,
				onlyCommitteeWithoutSeatsId: 'committee-3',
				feeCount: 0,
				// The row did not come back, and the column's own default is `false`.
				collectsPaymentsManually: false
			}
		});
	});

	it('asks the seats only about the committees it found', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { committees: [committeeRow('committee-1', 'conference-a')] }
		});

		await readChecklistCounts(supabase, ['conference-a']);

		// A seat belongs to a committee and names no conference of its own, which
		// is why this one query waits for the three before it.
		expect(queryFor(queries, 'seats')?.in).toEqual([['committee_id', ['committee-1']]]);
	});
});

describe('hasOrganiserArea', () => {
	it('answers true for a member of an organisation', async () => {
		const { supabase } = createStandInSupabase({
			rows: { organization_members: [{ user_id: USER_ID }] }
		});

		expect(await hasOrganiserArea(supabase, USER_ID)).toBe(true);
	});

	it('answers true for an administrator of a conference through a role on its team', async () => {
		const { supabase } = createStandInSupabase({
			rows: { permitted_conference_ids: ['conference-1'] }
		});

		expect(await hasOrganiserArea(supabase, USER_ID)).toBe(true);
	});

	it('answers false for somebody who is neither', async () => {
		const { supabase } = createStandInSupabase();

		expect(await hasOrganiserArea(supabase, USER_ID)).toBe(false);
	});

	it('asks for one column of at most one row, because the answer is only "is there anything"', async () => {
		const { supabase, queries } = createStandInSupabase();

		await hasOrganiserArea(supabase, USER_ID);

		// This runs on every signed-in page through the root layout, so it has to
		// stay this small.
		expect(tablesRead(queries)).toEqual(['organization_members', 'permitted_conference_ids']);
		expect(queries[0].columns).toMatch(/^user_id, /);
		expect(queries[0].limit).toEqual([1]);
		expect(queries[1].limit).toEqual([1]);
	});

	it('does not count a membership of the personal organisation of quick sessions (S14)', async () => {
		const { supabase, queries } = createStandInSupabase();

		await hasOrganiserArea(supabase, USER_ID);

		// `/manage` lists neither that organisation nor its quick sessions, so a
		// person whose only organisation it is has nothing there.
		expect(queries[0].columns).toBe('user_id, organizations!inner(is_personal)');
		expect(queries[0].eq).toEqual([
			['user_id', USER_ID],
			['organizations.is_personal', false]
		]);
	});

	it('asks the database which conferences the person administers, not which they help at', async () => {
		const { supabase, queries } = createStandInSupabase();

		await hasOrganiserArea(supabase, USER_ID);

		// A chair or a volunteer cannot open `/manage/[slug]`, which answers them
		// "This conference does not exist.", so "Manage" would lead them to
		// nothing they can act on (streamlining, F13). `permitted_conference_ids`
		// lists the conferences where one of their roles is everything.
		expect(queries[1].functionArguments).toEqual({ permission: 'administrator' });
	});

	it('answers false rather than raising when a lookup fails', async () => {
		const { supabase } = createStandInSupabase({
			errors: { organization_members: 'no connection', permitted_conference_ids: 'no connection' }
		});

		// It decides whether one link is in the top bar. Throwing would replace
		// every page in the app with an error over a missing link.
		expect(await hasOrganiserArea(supabase, USER_ID)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// The conference dashboard
// ---------------------------------------------------------------------------
// These tests are about what `loadConferenceDashboard` works out from the rows
// it is handed: the four seat numbers, which committee still has nothing on
// offer, which invoices belong in which figure, and who ends up on the "recent
// applications" list. The stand-in above answers by relation and applies none
// of the filters itself, so a test that is about a filter reads it back off the
// recorded query rather than off the answer.
//
// It also answers both of the dashboard's `applications` queries with the same
// rows, because it knows relations and not queries. A test about one of the two
// therefore writes rows shaped for that one and ignores what the other makes of
// them.

/** The conference these tests are about. */
const CONFERENCE_ID = 'conference-1';

/** The `conferences` row the dashboard reads for its two payment columns. */
function dashboardConferenceRow(changes: Record<string, unknown> = {}) {
	return { collects_payments_manually: false, currency: 'EUR', ...changes };
}

/** One `seats` row: on offer and empty, unless the test says otherwise. */
function seatRow(committeeId: string, changes: Record<string, unknown> = {}) {
	return {
		committee_id: committeeId,
		is_available: true,
		user_id: null,
		delegation_id: null,
		...changes
	};
}

/** One `invoices` row. */
function invoiceRow(status: string, amountCents: number) {
	return { status, amount_cents: amountCents };
}

/**
 * The answers every dashboard needs, with whatever the test is about added.
 *
 * Only the conference row is always there: without it the lookup throws, and no
 * test here is about that.
 */
function dashboardAnswers(changes: StandInAnswers = {}): StandInAnswers {
	return {
		...changes,
		rows: { conferences: [dashboardConferenceRow()], ...changes.rows }
	};
}

describe('loadConferenceDashboard', () => {
	it('gives a brand new conference zeroes rather than failing', async () => {
		const { supabase } = createStandInSupabase(dashboardAnswers());

		const dashboard = await loadConferenceDashboard(supabase, CONFERENCE_ID);

		expect(dashboard.stats).toEqual({
			applicationsTotal: 0,
			applicationsToReview: 0,
			delegationsTotal: 0,
			delegationsToReview: 0,
			seatsAvailable: 0,
			seatsFilled: 0,
			seatsReserved: 0,
			invoicesPaidCents: 0,
			invoicesUnpaidCents: 0,
			currency: 'EUR'
		});
		expect(dashboard.recentApplications).toEqual([]);
	});

	it('reads the payment settings off the conference itself', async () => {
		const { supabase, queries } = createStandInSupabase(
			dashboardAnswers({
				rows: {
					conferences: [
						dashboardConferenceRow({ collects_payments_manually: true, currency: 'USD' })
					]
				}
			})
		);

		const dashboard = await loadConferenceDashboard(supabase, CONFERENCE_ID);

		const conferenceQuery = queryFor(queries, 'conferences');

		expect(conferenceQuery?.columns).toBe('collects_payments_manually, currency');
		expect(conferenceQuery?.eq).toEqual([['id', CONFERENCE_ID]]);
		expect(dashboard.checklistCounts.collectsPaymentsManually).toBe(true);
		expect(dashboard.stats.currency).toBe('USD');
	});

	it('works the four seat numbers out from one answer', async () => {
		const { supabase, queries } = createStandInSupabase(
			dashboardAnswers({
				rows: {
					committees: [{ id: 'committee-1' }],
					seats: [
						seatRow('committee-1', { user_id: 'user-1' }),
						// Allocated to a delegation and then sat in by one of its members,
						// which makes it filled and not reserved.
						seatRow('committee-1', { user_id: 'user-2', delegation_id: 'delegation-1' }),
						// Held for a delegation that has not yet said who is sitting in it.
						seatRow('committee-1', { delegation_id: 'delegation-1' }),
						seatRow('committee-1'),
						// Switched off by the organiser, so it is on offer to nobody.
						seatRow('committee-1', { is_available: false })
					]
				}
			})
		);

		const dashboard = await loadConferenceDashboard(supabase, CONFERENCE_ID);

		const seatsQuery = queryFor(queries, 'seats');

		// One query for all four numbers, filtered by the committees wave one found.
		expect(seatsQuery?.columns).toBe('committee_id, is_available, user_id, delegation_id');
		expect(seatsQuery?.in).toEqual([['committee_id', ['committee-1']]]);
		expect(dashboard.stats.seatsAvailable).toBe(4);
		expect(dashboard.stats.seatsFilled).toBe(2);
		expect(dashboard.stats.seatsReserved).toBe(1);
	});

	it('counts a committee with no seat on offer as one still to be filled in', async () => {
		const { supabase } = createStandInSupabase(
			dashboardAnswers({
				rows: {
					committees: [{ id: 'committee-1' }, { id: 'committee-2' }],
					seats: [
						seatRow('committee-1'),
						// The only seat of the second committee is switched off, so that
						// committee has nothing on offer and the checklist item is not done.
						seatRow('committee-2', { is_available: false })
					]
				}
			})
		);

		const dashboard = await loadConferenceDashboard(supabase, CONFERENCE_ID);

		expect(dashboard.checklistCounts.committeeCount).toBe(2);
		expect(dashboard.checklistCounts.committeesWithoutAvailableSeatsCount).toBe(1);
		expect(dashboard.checklistCounts.onlyCommitteeWithoutSeatsId).toBe('committee-2');
	});

	it('asks nothing about seats at a conference with no committees', async () => {
		const { supabase, queries } = createStandInSupabase(dashboardAnswers());

		const dashboard = await loadConferenceDashboard(supabase, CONFERENCE_ID);

		// PostgREST refuses an empty `in.()` list, and there is nothing to count
		// either way.
		expect(tablesRead(queries)).not.toContain('seats');
		expect(dashboard.checklistCounts.committeesWithoutAvailableSeatsCount).toBe(0);
		expect(dashboard.checklistCounts.onlyCommitteeWithoutSeatsId).toBeNull();
		expect(dashboard.stats.seatsAvailable).toBe(0);
	});

	it('leaves drafts out of the application and delegation totals', async () => {
		const { supabase, queries } = createStandInSupabase(
			dashboardAnswers({
				rows: {
					applications: [
						{ status: 'submitted' },
						{ status: 'submitted' },
						{ status: 'accepted' },
						{ status: 'withdrawn' }
					],
					delegations: [{ status: 'submitted' }, { status: 'rejected' }]
				}
			})
		);

		const dashboard = await loadConferenceDashboard(supabase, CONFERENCE_ID);

		// A draft is somebody's half-filled form that the organiser has never seen,
		// so the database is asked to leave it out rather than the count doing it.
		const applicationsQuery = queriesFor(queries, 'applications')[0];
		const delegationsQuery = queryFor(queries, 'delegations');

		expect(applicationsQuery.neq).toEqual([['status', 'draft']]);
		expect(delegationsQuery?.neq).toEqual([['status', 'draft']]);
		expect(dashboard.stats.applicationsTotal).toBe(4);
		expect(dashboard.stats.applicationsToReview).toBe(2);
		expect(dashboard.stats.delegationsTotal).toBe(2);
		expect(dashboard.stats.delegationsToReview).toBe(1);
	});

	it('adds the paid and the unpaid invoices up and counts nothing else', async () => {
		const { supabase } = createStandInSupabase(
			dashboardAnswers({
				rows: {
					invoices: [
						invoiceRow('paid', 4000),
						invoiceRow('paid', 500),
						invoiceRow('unpaid', 2500),
						// None of these three is money that is coming, so none of them
						// belongs in either figure.
						invoiceRow('waived', 9000),
						invoiceRow('refunded', 9000),
						invoiceRow('void', 9000)
					]
				}
			})
		);

		const dashboard = await loadConferenceDashboard(supabase, CONFERENCE_ID);

		expect(dashboard.stats.invoicesPaidCents).toBe(4500);
		expect(dashboard.stats.invoicesUnpaidCents).toBe(2500);
	});

	it('counts the fees for the checklist', async () => {
		const { supabase } = createStandInSupabase(
			dashboardAnswers({ rows: { fees: [{ id: 'fee-1' }, { id: 'fee-2' }] } })
		);

		const dashboard = await loadConferenceDashboard(supabase, CONFERENCE_ID);

		expect(dashboard.checklistCounts.feeCount).toBe(2);
	});

	it('asks for the newest submitted applications and keeps the order they came back in', async () => {
		const { supabase, queries } = createStandInSupabase(
			dashboardAnswers({
				rows: {
					applications: [
						{ id: 'application-2', user_id: 'user-2', submitted_at: '2026-09-18T10:00:00Z' },
						{ id: 'application-1', user_id: 'user-1', submitted_at: '2026-09-17T10:00:00Z' }
					],
					profiles: [
						{ id: 'user-1', full_name: 'Noor Haddad', institution_name: 'Lyceum Amsterdam' },
						{ id: 'user-2', full_name: 'Tomas Rivera', institution_name: null }
					]
				}
			})
		);

		const dashboard = await loadConferenceDashboard(supabase, CONFERENCE_ID);

		// Newest first is the database's job, so what is checked here is that the
		// query asks for it, and that the list keeps that order.
		const recentQuery = queriesFor(queries, 'applications')[1];

		expect(recentQuery.eq).toEqual([
			['conference_id', CONFERENCE_ID],
			['status', 'submitted']
		]);
		expect(recentQuery.order).toEqual([['submitted_at', false]]);
		expect(recentQuery.limit).toEqual([5]);
		expect(dashboard.recentApplications).toEqual([
			{
				id: 'application-2',
				applicantName: 'Tomas Rivera',
				institutionName: null,
				submittedAt: '2026-09-18T10:00:00Z'
			},
			{
				id: 'application-1',
				applicantName: 'Noor Haddad',
				institutionName: 'Lyceum Amsterdam',
				submittedAt: '2026-09-17T10:00:00Z'
			}
		]);
	});

	it('looks the applicants up in a second query, because no foreign key joins the two', async () => {
		const { supabase, queries } = createStandInSupabase(
			dashboardAnswers({
				rows: {
					applications: [
						{ id: 'application-1', user_id: 'user-1', submitted_at: '2026-09-17T10:00:00Z' }
					],
					profiles: [{ id: 'user-1', full_name: 'Noor Haddad', institution_name: null }]
				}
			})
		);

		await loadConferenceDashboard(supabase, CONFERENCE_ID);

		// `applications.user_id` points at `auth.users` and not at `profiles`, so
		// PostgREST cannot bring the name along on the application row.
		const profilesQuery = queryFor(queries, 'profiles');

		expect(profilesQuery?.columns).toBe('id, full_name, institution_name');
		expect(profilesQuery?.in).toEqual([['id', ['user-1']]]);
	});

	it('leaves out an applicant whose profile did not come back', async () => {
		const { supabase } = createStandInSupabase(
			dashboardAnswers({
				rows: {
					applications: [
						{ id: 'application-1', user_id: 'user-1', submitted_at: '2026-09-17T10:00:00Z' },
						{ id: 'application-2', user_id: 'user-2', submitted_at: '2026-09-16T10:00:00Z' }
					],
					profiles: [{ id: 'user-1', full_name: 'Noor Haddad', institution_name: null }]
				}
			})
		);

		const dashboard = await loadConferenceDashboard(supabase, CONFERENCE_ID);

		// A line with no name on it is worse than one line fewer.
		expect(dashboard.recentApplications.map((application) => application.id)).toEqual([
			'application-1'
		]);
	});

	it('shows no names rather than failing when the profiles cannot be read', async () => {
		const { supabase } = createStandInSupabase(
			dashboardAnswers({
				rows: {
					applications: [
						{ id: 'application-1', user_id: 'user-1', submitted_at: '2026-09-17T10:00:00Z' }
					]
				},
				errors: { profiles: 'permission denied for table profiles' }
			})
		);

		const dashboard = await loadConferenceDashboard(supabase, CONFERENCE_ID);

		// The one lookup here that answers empty instead of throwing: everything
		// else on the page is still true without the five names beside it.
		expect(dashboard.recentApplications).toEqual([]);
		expect(dashboard.stats.applicationsTotal).toBe(1);
	});

	it('raises when a query fails, rather than showing a dashboard of zeroes', async () => {
		const { supabase } = createStandInSupabase(
			dashboardAnswers({ errors: { committees: 'no connection' } })
		);

		// The page is all or nothing: a number that quietly said nought would be
		// read as the truth about the conference.
		await expect(loadConferenceDashboard(supabase, CONFERENCE_ID)).rejects.toThrow('no connection');
	});

	it('raises with the id when the conference itself is not there', async () => {
		const { supabase } = createStandInSupabase();

		// The layout above this page has already read the conference, so this
		// cannot happen without something being wrong.
		await expect(loadConferenceDashboard(supabase, CONFERENCE_ID)).rejects.toThrow(CONFERENCE_ID);
	});
});

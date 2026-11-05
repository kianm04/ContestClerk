import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createServiceRoleClient, createSignedInClient } from './supabase-test-client';
import { createFetchThatWaitsOutTheClock } from './waiting-out-the-clock';
import {
	addApplication,
	addCommittee,
	createOpenConferenceOwnedByMe,
	type ConferenceFixture
} from './conference-fixtures';

// The `applications_with_applicant` view, added by
// supabase/migrations/20260922120000_applications_with_applicant_view.sql. It is
// every column of `applications` plus the five things about the applicant the
// organiser's table at /manage/[slug]/applications shows: their name, their
// avatar, their school, their country and how much MUN they have done.
//
// Two things are being checked here, and they are why the view exists at all.
//
// The first is who may read what. The view is declared with
// `security_invoker = true`, which means it reads `applications` and `profiles`
// as whoever is asking, so the Row Level Security already on `applications`
// decides what comes back: an organiser of the conference sees its
// applications, the applicant sees their own, and nobody else sees any. The view
// has no rule of its own; it leans entirely on those policies. If somebody ever
// turned that flag off, the view would read as its owner instead and every
// application of every conference would become readable by any signed-in
// account. The refused case below is the one that would notice.
//
// The second is that the database does the searching, the filtering, the
// ordering and the paging. Before the view nothing joined an application to its
// applicant, so the page read every application of a status and did all four in
// TypeScript — and `max_rows = 1000` in supabase/config.toml silently shortened
// what it read. The search test sends the one request the page now sends and
// checks both halves of its answer: the page of rows asked for, and how many
// rows matched altogether rather than how many are on the page.
//
// A third check guards the view's shape. It is written `select application.*`,
// and Postgres expands that star once, when the view is made: the view keeps the
// columns `applications` had on that day for ever. A later migration that adds a
// column to the table and forgets to remake the view would leave the view short
// of it, and the column test at the bottom is what notices.

/** What one applicant of a fixture conference looks like. */
type ApplicantDescription = {
	fullName: string;
	institutionName: string;
	/** Two letters, because `profiles.country_code` is `char(2)`. */
	countryCode: string;
	status: 'draft' | 'submitted';
};

/** An applicant of a fixture conference, and the application they wrote. */
type Applicant = {
	/** A client signed in as the applicant. */
	supabase: SupabaseClient;
	userId: string;
	applicationId: string;
};

/**
 * The five applicants the search test applies to one conference.
 *
 * Every clause of the one query it sends is load-bearing here, so that a clause
 * the database quietly ignored would change the answer:
 *
 *   * "willow" matches Amara by her name and Bram by his school, which is what
 *     the two halves of the search are for. Dario matches neither.
 *   * Csilla matches "willow" as well, but she is Hungarian, so only the country
 *     filter leaves her out.
 *   * Aaron matches everything and sorts before Amara, so only the status filter
 *     keeps a draft off the organiser's "submitted" tab.
 *
 * What is left is Amara and then Bram, in that order, which is what makes the
 * first page one row long and the total two.
 */
const SEARCH_APPLICANTS: ApplicantDescription[] = [
	{
		fullName: 'Amara Willows',
		institutionName: 'Northgate College',
		countryCode: 'NL',
		status: 'submitted'
	},
	{
		fullName: 'Bram de Vries',
		institutionName: 'Willow Park School',
		countryCode: 'NL',
		status: 'submitted'
	},
	{
		fullName: 'Csilla Nagy',
		institutionName: 'Willow Grammar Budapest',
		countryCode: 'HU',
		status: 'submitted'
	},
	{
		fullName: 'Dario Ferrari',
		institutionName: 'Northgate College',
		countryCode: 'NL',
		status: 'submitted'
	},
	{
		fullName: 'Aaron Willows',
		institutionName: 'Willow Park School',
		countryCode: 'NL',
		status: 'draft'
	}
];

/** One applicant on their own, for the tests that only need a single row. */
const ONE_APPLICANT: ApplicantDescription = {
	fullName: 'Amara Willows',
	institutionName: 'Northgate College',
	countryCode: 'NL',
	status: 'submitted'
};

/**
 * A published conference whose application window is open, with one committee
 * in it.
 *
 * The committee is there because `validate_application` refuses a submitted
 * application that names no committee preference, and a fixture conference asks
 * for two.
 */
async function createConferenceTakingApplications(): Promise<{
	conference: ConferenceFixture;
	committeeId: string;
}> {
	const conference = await createOpenConferenceOwnedByMe();
	const committeeId = await addCommittee(conference.supabase, conference.conferenceId);

	return { conference, committeeId };
}

/**
 * Signs up an applicant, fills their profile in, and applies to the conference.
 *
 * Everything goes through the applicant's own client, so the profile and the
 * application only appear if the policies allow them.
 */
async function createApplicant(
	conferenceId: string,
	committeeId: string,
	description: ApplicantDescription
): Promise<Applicant> {
	// The name travels the way the register form sends it, and the
	// `handle_new_user` trigger copies it into `profiles.full_name`.
	const account = await createSignedInClient(description.fullName);

	// The school and the country are not part of signing up. The /welcome form
	// asks for them afterwards, and the "Users can update their own profile"
	// policy is what lets the account write them.
	const { error: profileError } = await account.supabase
		.from('profiles')
		.update({
			institution_name: description.institutionName,
			country_code: description.countryCode
		})
		.eq('id', account.userId);

	if (profileError) {
		throw new Error(`Could not fill in the applicant's profile: ${profileError.message}`);
	}

	const applicationId = await addApplication(account.supabase, conferenceId, {
		status: description.status,
		committeePreferences: [committeeId]
	});

	return { supabase: account.supabase, userId: account.userId, applicationId };
}

/** The five applicants above, applied to one conference, one after the other. */
async function createSearchableApplications(
	conferenceId: string,
	committeeId: string
): Promise<void> {
	for (const description of SEARCH_APPLICANTS) {
		await createApplicant(conferenceId, committeeId, description);
	}
}

/** The three columns of an applicant the search below asks for. */
type ApplicantColumns = {
	applicant_name: string | null;
	applicant_institution_name: string | null;
	applicant_country_code: string | null;
};

/** What one page of the search answers with. */
type SearchAnswer = {
	data: ApplicantColumns[] | null;
	error: PostgrestError | null;
	/** How many rows matched altogether, which is not how many are on the page. */
	count: number | null;
};

/**
 * The one request the organiser's applications table sends: this conference,
 * this status, a name or a school containing this text, this country, in this
 * order, and one page of it.
 *
 * `count: 'exact'` asks for the number of rows that matched altogether, which is
 * what the pager shows; without it the only number available is how many rows
 * came back, which is the size of the page.
 *
 * The second `order` is on `id` and is there to break a tie, so that two
 * applicants with the same name always come back in the same order and a page
 * boundary never falls between them differently twice.
 *
 * `firstRow` and `lastRow` are both counted from zero and both included, which
 * is how `range` works: rows 0 to 0 are the first page of one.
 */
async function searchApplications(
	organiser: SupabaseClient,
	conferenceId: string,
	firstRow: number,
	lastRow: number
): Promise<SearchAnswer> {
	return await organiser
		.from('applications_with_applicant')
		.select('applicant_name, applicant_institution_name, applicant_country_code', {
			count: 'exact'
		})
		.eq('conference_id', conferenceId)
		.eq('status', 'submitted')
		// One `or` of two `ilike`s is the search box. The value is in double
		// quotes because a comma separates the two conditions, so anything typed
		// into the box has to be quoted to stay one value.
		.or('applicant_name.ilike."%willow%",applicant_institution_name.ilike."%willow%"')
		.eq('applicant_country_code', 'NL')
		.order('applicant_name', { ascending: true })
		.order('id', { ascending: true })
		.range(firstRow, lastRow);
}

/** What PostgREST says about one table or view in its description of the database. */
type RelationDescription = {
	/** One entry per column, keyed by the column's name. */
	properties: Record<string, unknown>;
};

/** The part of PostgREST's description of the database the column test reads. */
type DatabaseDescription = {
	definitions: Record<string, RelationDescription | undefined>;
};

/**
 * The names of the columns of every table and view a signed-in account may
 * read, keyed by the name of the table or view.
 *
 * PostgREST answers a plain GET of its root address, `/rest/v1/`, with an
 * OpenAPI description of the `public` schema, which it builds from the
 * database's own catalog when it starts and again after every migration. It is
 * how this test reads the columns of a relation: `information_schema` itself is
 * not one of the schemas PostgREST serves.
 *
 * The description only lists what the asking role may read, so it is asked for
 * as a signed-in account, which has `select` on both relations the test
 * compares.
 *
 * The request is not made through a Supabase client, which has no way to ask
 * for the root address, so it is sent with the same `fetch` a signed-in client
 * is built out of: one that waits out PostgREST refusing a token "issued at
 * future", as `waiting-out-the-clock.ts` explains. A fresh token comes from
 * refreshing the account's session, which GoTrue answers with a newly stamped one.
 */
async function readColumnNamesOfEveryRelation(): Promise<Map<string, string[]>> {
	const account = await createSignedInClient();
	const { data: sessionData } = await account.supabase.auth.getSession();
	const accessToken = sessionData.session?.access_token;

	if (!accessToken) {
		throw new Error('The signed-in test account has no session.');
	}

	const fetchThatWaitsOutTheClock = createFetchThatWaitsOutTheClock(async () => {
		const { data: refreshData, error: refreshError } = await account.supabase.auth.refreshSession();

		if (refreshError || !refreshData.session) {
			throw new Error(`Could not refresh the test account's session: ${refreshError?.message}`);
		}

		return refreshData.session.access_token;
	});

	const response = await fetchThatWaitsOutTheClock(`${process.env.PUBLIC_SUPABASE_URL}/rest/v1/`, {
		headers: {
			apikey: process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
			Authorization: `Bearer ${accessToken}`
		}
	});

	if (!response.ok) {
		throw new Error(`PostgREST did not describe the database: HTTP ${response.status}`);
	}

	const description = (await response.json()) as DatabaseDescription;
	const columnNamesByRelation = new Map<string, string[]>();

	for (const [relationName, relation] of Object.entries(description.definitions)) {
		const columnNames = Object.keys(relation?.properties ?? {});
		columnNamesByRelation.set(relationName, columnNames);
	}

	return columnNamesByRelation;
}

describe('applications_with_applicant', () => {
	it('gives an organiser the name, school and country of an applicant to their conference', async () => {
		const { conference, committeeId } = await createConferenceTakingApplications();
		await createApplicant(conference.conferenceId, committeeId, ONE_APPLICANT);

		const { data, error } = await conference.supabase
			.from('applications_with_applicant')
			.select(
				'status, applicant_name, applicant_institution_name, applicant_country_code, ' +
					'applicant_experience_level'
			)
			.eq('conference_id', conference.conferenceId)
			.single();

		expect(error).toBeNull();
		expect(data).toEqual({
			// The application's own columns ride along beside the applicant's, so
			// the table needs no second request to show them.
			status: 'submitted',
			applicant_name: 'Amara Willows',
			applicant_institution_name: 'Northgate College',
			applicant_country_code: 'NL',
			// Nobody set this, so it is the `profiles` default.
			applicant_experience_level: 'none'
		});
	});

	it('shows a signed-in stranger no application of a conference that is not theirs', async () => {
		const { conference, committeeId } = await createConferenceTakingApplications();
		await createApplicant(conference.conferenceId, committeeId, ONE_APPLICANT);

		const stranger = await createSignedInClient();
		const { data, error } = await stranger.supabase
			.from('applications_with_applicant')
			.select('id, applicant_name')
			.eq('conference_id', conference.conferenceId);

		expect(error).toBeNull();
		expect(data).toEqual([]);
	});

	it('shows applicants their own application, with their own name on it', async () => {
		const { conference, committeeId } = await createConferenceTakingApplications();
		const applicant = await createApplicant(conference.conferenceId, committeeId, ONE_APPLICANT);

		const { data, error } = await applicant.supabase
			.from('applications_with_applicant')
			.select('id, applicant_name, applicant_institution_name')
			.eq('id', applicant.applicationId)
			.single();

		expect(error).toBeNull();
		expect(data).toEqual({
			id: applicant.applicationId,
			applicant_name: 'Amara Willows',
			applicant_institution_name: 'Northgate College'
		});
	});

	it('searches, filters, sorts and pages the applications in one request', async () => {
		const { conference, committeeId } = await createConferenceTakingApplications();
		await createSearchableApplications(conference.conferenceId, committeeId);

		const { data, error, count } = await searchApplications(
			conference.supabase,
			conference.conferenceId,
			0,
			0
		);

		expect(error).toBeNull();
		// The page asked for is one row long, and it is the first of the two
		// matches in alphabetical order.
		expect(data).toEqual([
			{
				applicant_name: 'Amara Willows',
				applicant_institution_name: 'Northgate College',
				applicant_country_code: 'NL'
			}
		]);
		// The count is of everything that matched, not of the page: two of the
		// five applicants did.
		expect(count).toBe(2);
	});

	it('gives the organiser the second page of that same search', async () => {
		const { conference, committeeId } = await createConferenceTakingApplications();
		await createSearchableApplications(conference.conferenceId, committeeId);

		const { data, error, count } = await searchApplications(
			conference.supabase,
			conference.conferenceId,
			1,
			1
		);

		expect(error).toBeNull();
		expect(data).toEqual([
			{
				applicant_name: 'Bram de Vries',
				applicant_institution_name: 'Willow Park School',
				applicant_country_code: 'NL'
			}
		]);
		// The same total as the first page, because the pager counts the matches
		// and not the page it is showing.
		expect(count).toBe(2);
	});

	it('still shows an application whose applicant has no profile, with no name on it', async () => {
		const { conference, committeeId } = await createConferenceTakingApplications();
		const applicant = await createApplicant(conference.conferenceId, committeeId, ONE_APPLICANT);

		// The `profiles` row is deleted with the service-role client because no
		// policy lets anybody delete one from the app. The application survives
		// it: `applications.user_id` points at `auth.users` rather than at
		// `profiles`, so nothing cascades. This is the state an organiser is left
		// in when an account goes away, and the page writes "Deleted account"
		// where the name would be.
		const serviceRole = createServiceRoleClient();
		const { error: deleteError } = await serviceRole
			.from('profiles')
			.delete()
			.eq('id', applicant.userId);

		expect(deleteError).toBeNull();

		const { data, error } = await conference.supabase
			.from('applications_with_applicant')
			.select('id, status, applicant_name, applicant_institution_name, applicant_country_code')
			.eq('conference_id', conference.conferenceId)
			.single();

		expect(error).toBeNull();
		// The left join is what keeps the row here at all. An inner join would
		// have dropped an application the organiser still has to decide on.
		expect(data).toEqual({
			id: applicant.applicationId,
			status: 'submitted',
			applicant_name: null,
			applicant_institution_name: null,
			applicant_country_code: null
		});
	});

	it("gives an organiser the path of the applicant's avatar", async () => {
		const { conference, committeeId } = await createConferenceTakingApplications();
		const applicant = await createApplicant(conference.conferenceId, committeeId, ONE_APPLICANT);

		// The profile form stores an uploaded picture under the account's own
		// folder of the `public-media` bucket and writes its path here. No file
		// is uploaded: the view carries the path, not the picture.
		const avatarPath = `avatars/${applicant.userId}/portrait.jpg`;
		const { error: profileError } = await applicant.supabase
			.from('profiles')
			.update({ avatar_path: avatarPath })
			.eq('id', applicant.userId);

		expect(profileError).toBeNull();

		const { data, error } = await conference.supabase
			.from('applications_with_applicant')
			.select('id, applicant_avatar_path')
			.eq('conference_id', conference.conferenceId)
			.single();

		expect(error).toBeNull();
		expect(data).toEqual({ id: applicant.applicationId, applicant_avatar_path: avatarPath });
	});

	it('has every column that applications has, except the two the applicant must not read', async () => {
		const columnNamesByRelation = await readColumnNamesOfEveryRelation();
		const tableColumnNames = columnNamesByRelation.get('applications') ?? [];
		const viewColumnNames = columnNamesByRelation.get('applications_with_applicant') ?? [];

		// Guards against a description that lists nothing, which would make the
		// comparison below pass without comparing anything.
		expect(tableColumnNames).toContain('id');
		expect(tableColumnNames).toContain('decided_by');

		// A column listed here was added to `applications` after the view was
		// made. Add a migration that drops and recreates the view (`create or
		// replace view` cannot put a new column in the middle), with its grant,
		// and that grants the column itself to `authenticated` (see the next
		// test). The two left out on purpose are the ones
		// 20261022132000_internal_notes_grants.sql keeps from the applicant:
		// `decided_by`, and the retired `internal_note`.
		const columnsMissingFromView = tableColumnNames.filter(
			(columnName) => !viewColumnNames.includes(columnName)
		);

		expect(columnsMissingFromView.sort()).toEqual(['decided_by', 'internal_note']);
	});

	it('lets a signed-in reader name every column of applications but those two', async () => {
		const columnNamesByRelation = await readColumnNamesOfEveryRelation();
		const grantedColumnNames = (columnNamesByRelation.get('applications') ?? []).filter(
			(columnName) => !HIDDEN_APPLICATION_COLUMNS.includes(columnName)
		);
		const { supabase } = await createSignedInClient();

		expect(grantedColumnNames.length).toBeGreaterThan(10);

		// `authenticated` holds a column-level grant on `applications` rather
		// than a table-level one, so a column added later is refused outright
		// until a migration grants it. Naming a column checks the privilege even
		// when no row matches, which is why a brand-new account can ask.
		for (const columnName of grantedColumnNames) {
			const { error } = await supabase.from('applications').select(columnName).limit(1);

			expect(error, columnName).toBeNull();
		}

		for (const columnName of HIDDEN_APPLICATION_COLUMNS) {
			const { error } = await supabase.from('applications').select(columnName).limit(1);

			expect(error?.code, columnName).toBe('42501');
		}
	});
});

/** The two columns of `applications` that no signed-in reader may name. */
const HIDDEN_APPLICATION_COLUMNS = ['decided_by', 'internal_note'];

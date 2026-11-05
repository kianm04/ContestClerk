/**
 * The organiser's applications table at `/manage/[slug]/applications`: one
 * page of it, the counts on its tabs and the CSV download. The people running
 * the conference read every application here at once, rather than one of
 * their own the way the applicant's pages in `./applications.ts` do.
 *
 * Files under `$lib/server` only ever run on the server, so this is where the
 * database is queried. Pages pass in `locals.supabase`, the client that knows
 * who is signed in, so Row Level Security decides what each caller may read.
 *
 * One rule runs through all of it. The `applications` select policy is
 * "self; org.", and a policy decides rows and not columns, so an organiser
 * really can read somebody's unsent draft and the half-written motivation in
 * it. Every query below therefore names the statuses it wants itself, and never
 * leaves keeping drafts out to Row Level Security.
 *
 * The second rule is that the database does the work. The table searches,
 * filters, sorts and pages by the applicant — their name, their school, their
 * country — and not one of those is a column of `applications`, so the first
 * version of these queries read every application of a status, looked the
 * profiles up separately, and then did all four in TypeScript. `max_rows` in
 * `supabase/config.toml` is 1000, so "every application of a status" was never
 * every application: a conference with more than a thousand of them saw a
 * thousand, in the table, in the tab counts and in the CSV, with nothing saying
 * the answer was short. The `applications_with_applicant` view (migration
 * 0015) puts the applicant's columns beside the application's own, so every
 * condition can go on one query and only the rows that are shown are read.
 *
 * `./application-review.ts` reads the same view the same way for the review
 * page, which is why a few of the pieces below are exported.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
	APPLICATIONS_PAGE_SIZE,
	APPLICATION_STATUS_TABS,
	EMPTY_APPLICATION_STATUS_COUNTS
} from '$lib/applications';
import type {
	ApplicationAnswers,
	ApplicationExportRow,
	ApplicationListQuery,
	ApplicationListSort,
	ApplicationStatusCounts,
	ListedApplicationStatus,
	OrganiserApplicationRow
} from '$lib/applications';
import { committeeHeading } from '$lib/committees';
import { countryName } from '$lib/countries';
import type { ExperienceLevel } from '$lib/profiles';
import { toSafeSearchText } from './search-text';
import { readPrivateDetails, type PrivateDetailsRow } from './private-details';

/**
 * The view every read below goes through: the `applications` table with the
 * applicant's profile joined on.
 *
 * It exists because nothing in the schema joins the two: `applications.user_id`
 * points at `auth.users`, and PostgREST can only bring along a table that a
 * foreign key of the one being read actually names. The view is
 * `security_invoker = true`, so the same Row Level Security decides who reads
 * what as if the two tables had been read directly.
 */
export const APPLICATIONS_WITH_APPLICANT = 'applications_with_applicant';

/** What the table and the CSV call an applicant whose account has gone since. */
const DELETED_ACCOUNT_NAME = 'Deleted account';

/** The error code Supabase sends when a page number is past the last page of results. */
const PAGE_OUT_OF_RANGE_CODE = 'PGRST103';

/**
 * How many applications one query of the CSV export asks for.
 *
 * The export is not paged — the whole filtered list goes into the file — but it
 * cannot be one unbounded query either, because PostgREST answers with at most
 * `max_rows` rows however many match. So it asks for a window at a time and
 * moves the window along. Anything up to `max_rows` would do; 500 keeps each
 * answer small enough to hold comfortably in memory.
 */
export const EXPORT_BATCH_SIZE = 500;

/**
 * How many ids one `.in(...)` lookup asks about at a time.
 *
 * The export can be thousands of applications, and the lookups that follow it
 * ask about one id per application. All of those ids in a single request would
 * be both more rows than `max_rows` will answer with and a web address longer
 * than the server accepts. A hundred uuids is about four kilobytes of address,
 * which nothing objects to.
 */
const ID_LOOKUP_BATCH_SIZE = 100;

/** The application columns the organiser's table shows, with the applicant's own beside them. */
const ORGANISER_APPLICATION_COLUMNS =
	'id, user_id, status, committee_preferences, submitted_at, decided_at, applicant_name, applicant_avatar_path, applicant_institution_name, applicant_country_code, applicant_experience_level';

/**
 * The columns the CSV writes.
 *
 * The organisers' own note is not among them because it is no longer a column
 * of the application: it lives in `application_internal_notes`, a table only
 * the organisers can read (migration 20261022132000). The export has a column
 * for it all the same, so `readInternalNotes` below fetches them by id.
 */
const APPLICATION_EXPORT_COLUMNS = `${ORGANISER_APPLICATION_COLUMNS}, seat_preferences, motivation, answers, decision_note`;

/** One row of the view as the organiser's table reads it. */
type OrganiserApplicationQueryRow = {
	id: string;
	user_id: string;
	/** Never `draft`: every query in this file says which statuses it wants. */
	status: ListedApplicationStatus;
	/** The committee ids the applicant put down, in their own order. */
	committee_preferences: string[];
	/** ISO timestamps, or `null` when that has not happened yet. */
	submitted_at: string | null;
	decided_at: string | null;
	/**
	 * The applicant's own columns, brought along by the view. Every one of them
	 * is `null` when there is no profile row to read, because the view joins the
	 * two with a left join so that such an application is still a row the
	 * organiser can see and decide on.
	 */
	applicant_name: string | null;
	applicant_avatar_path: string | null;
	applicant_institution_name: string | null;
	applicant_country_code: string | null;
	applicant_experience_level: ExperienceLevel | null;
};

/** The same row with the other columns the CSV writes brought along. */
type ApplicationExportQueryRow = OrganiserApplicationQueryRow & {
	seat_preferences: string | null;
	motivation: string | null;
	answers: ApplicationAnswers;
	decision_note: string | null;
};

/** Which column the sort dropdown puts the table in order by, and which way round. */
type ApplicationOrder = {
	column: string;
	ascending: boolean;
	/** Where a row with nothing in that column goes. */
	nullsFirst: boolean;
};

/**
 * The order the sort dropdown asked for, as the database takes it.
 *
 * `submitted` is oldest first, so that the queue is fair and nobody is left at
 * the bottom of it forever. `decided` is the other way round, newest first,
 * because "Recently decided" is about what just happened, and an application
 * nobody has decided has no date at all and goes to the end rather than to the
 * top. `name` puts a row whose account has gone last for the same reason: it
 * has no name to sort by.
 */
function orderFor(sort: ApplicationListSort): ApplicationOrder {
	if (sort === 'name') {
		return { column: 'applicant_name', ascending: true, nullsFirst: false };
	}

	if (sort === 'decided') {
		return { column: 'decided_at', ascending: false, nullsFirst: false };
	}

	return { column: 'submitted_at', ascending: true, nullsFirst: true };
}

/**
 * The applications of one conference that match everything the organiser asked
 * for, in the order they asked for, as a request nobody has sent yet.
 *
 * The caller adds `.range(...)` and awaits it, which is the only difference
 * between the table's one page and the export's whole list: both want the same
 * rows in the same order.
 *
 * `columns` and `selectOptions` are the caller's because the table and the CSV
 * want different columns of the very same rows, and only the table wants
 * `count: 'exact'` beside them.
 */
export function matchingApplicationsRequest(
	supabase: SupabaseClient,
	conferenceId: string,
	query: ApplicationListQuery,
	columns: string,
	selectOptions: { count?: 'exact' } = {}
) {
	// Each step below adds one condition. Nothing is sent to Supabase until the
	// caller awaits the request.
	let request = supabase
		.from(APPLICATIONS_WITH_APPLICANT)
		.select(columns, selectOptions)
		.eq('conference_id', conferenceId)
		// This is what keeps drafts out, for the reason at the top of this file.
		// A tab only ever shows one status, so naming it does both jobs at once.
		.eq('status', query.status);

	// `committee_preferences` is an array of committee ids, so "the applicant put
	// this committee somewhere in their list" is `contains` rather than `eq`.
	// Postgres refuses this filter outright for anything that is not a uuid,
	// which is why `parseApplicationListQuery` keeps only a value with the shape
	// of an id; nothing else ever reaches this line.
	if (query.committee !== '') {
		request = request.contains('committee_preferences', [query.committee]);
	}

	if (query.country !== '') {
		request = request.eq('applicant_country_code', query.country);
	}

	const searchText = toSafeSearchText(query.q);

	if (searchText !== '') {
		// `.or` takes one piece of text in Supabase's own filter language, and this
		// one means "the applicant's name, or the name of their school, contains
		// the search text". `ilike` ignores upper and lower case, `%` stands for
		// "anything", and the double quotes keep the spaces in the search text
		// together. `toSafeSearchText` is what stops the text being read as filter
		// language itself.
		const pattern = `"%${searchText}%"`;
		request = request.or(
			`applicant_name.ilike.${pattern},applicant_institution_name.ilike.${pattern}`
		);
	}

	const order = orderFor(query.sort);

	return (
		request
			.order(order.column, { ascending: order.ascending, nullsFirst: order.nullsFirst })
			// A second sort on the id keeps the order the same when two rows tie on
			// the first, which is what makes paging safe: without it, two rows the
			// dropdown cannot tell apart would come back in whatever order the
			// database happened to find them, and page two could repeat a row page
			// one had already shown.
			.order('id', { ascending: true })
	);
}

/**
 * These ids cut into lists of at most `ID_LOOKUP_BATCH_SIZE`, so that every
 * lookup below asks a question the server will answer in full.
 *
 * An empty list gives no batches at all, which is what stops a lookup sending
 * `.in('id', [])` — a request that cannot match anything.
 */
function idBatches(ids: string[]): string[][] {
	const batches: string[][] = [];

	for (let firstIndex = 0; firstIndex < ids.length; firstIndex += ID_LOOKUP_BATCH_SIZE) {
		batches.push(ids.slice(firstIndex, firstIndex + ID_LOOKUP_BATCH_SIZE));
	}

	return batches;
}

/** One committee: its id, and the two fields its heading is made of. */
type PreferredCommitteeRow = {
	id: string;
	name: string;
	abbreviation: string | null;
};

/**
 * What each of these committees is called, by committee id.
 *
 * `committeeHeading` words them — the short name when there is one, the full
 * name otherwise — which is the rule the committee's own page and the
 * applicant's own application page use, so one committee is never worded two
 * ways. A committee the organisers have deleted since is simply not in the map.
 *
 * This one is not batched, unlike the two lookups around it. Its callers hand
 * it committee ids with the repeats taken out, so the longest list it can ever
 * be given is the conference's own committees, which are counted in tens.
 */
async function readCommitteeHeadings(
	supabase: SupabaseClient,
	committeeIds: string[]
): Promise<Map<string, string>> {
	const headings = new Map<string, string>();

	if (committeeIds.length === 0) {
		return headings;
	}

	const { data, error } = await supabase
		.from('committees')
		.select('id, name, abbreviation')
		.in('id', committeeIds)
		.overrideTypes<PreferredCommitteeRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the committees: ${error.message}`);
	}

	for (const row of data ?? []) {
		headings.set(row.id, committeeHeading(row));
	}

	return headings;
}

/** One row of the seat lookup: which application won the seat, and what to call it. */
type AcceptedSeatRow = {
	application_id: string;
	name: string;
	/**
	 * One object rather than a list, because a seat belongs to one committee.
	 * Unlike the applicant's profile this one can be brought along by the same
	 * query: `seats.committee_id` really is a foreign key to `committees`, which
	 * is what PostgREST needs before it will embed anything.
	 */
	committees: { name: string; abbreviation: string | null };
};

/**
 * "UNSC · France" for each of these applications, by application id.
 *
 * Only an accepted application has a seat, so the caller passes the accepted
 * ones and nothing else. A tab shows one status, so in practice that is either
 * all of the rows or none of them, and none of them means no query at all. It
 * asks in batches for the same reason `readPrivateDetails` does: the export
 * of an "Accepted" tab hands it one id per accepted application.
 */
async function readSeatLabels(
	supabase: SupabaseClient,
	applicationIds: string[]
): Promise<Map<string, string>> {
	const labels = new Map<string, string>();

	for (const batch of idBatches(applicationIds)) {
		const { data, error } = await supabase
			.from('seats')
			.select('application_id, name, committees(name, abbreviation)')
			.in('application_id', batch)
			.overrideTypes<AcceptedSeatRow[], { merge: false }>();

		if (error) {
			throw new Error(`Could not read the seats: ${error.message}`);
		}

		for (const row of data ?? []) {
			const committeeLabel = committeeHeading(row.committees);

			labels.set(row.application_id, `${committeeLabel} · ${row.name}`);
		}
	}

	return labels;
}

/**
 * The organisers' own note on each of these applications, by application id.
 * An application nobody wrote about, or whose note was emptied, is not in the
 * map. It asks in batches for the same reason `readSeatLabels` does.
 */
async function readInternalNotes(
	supabase: SupabaseClient,
	applicationIds: string[]
): Promise<Map<string, string>> {
	const notes = new Map<string, string>();

	for (const batch of idBatches(applicationIds)) {
		const { data, error } = await supabase
			.from('application_internal_notes')
			.select('application_id, note')
			.in('application_id', batch)
			.overrideTypes<{ application_id: string; note: string | null }[], { merge: false }>();

		if (error) {
			throw new Error(`Could not read the internal notes: ${error.message}`);
		}

		for (const row of data ?? []) {
			if (row.note !== null) notes.set(row.application_id, row.note);
		}
	}

	return notes;
}

/**
 * What to call this applicant: their own name, or a word for an account that is
 * no longer there.
 *
 * `specs/05-pages/organiser/applications.md` asks for the second case by name:
 * a row whose profile could not be found is still a row the organiser has to
 * see, and a blank cell would look like a fault rather than a fact.
 */
export function applicantNameOf(applicantName: string | null): string {
	if (applicantName === null) {
		return DELETED_ACCOUNT_NAME;
	}

	return applicantName;
}

/** The ids of the applications that have a seat to name, which is the accepted ones. */
function acceptedApplicationIds(applications: OrganiserApplicationQueryRow[]): string[] {
	const accepted = applications.filter((application) => application.status === 'accepted');

	return accepted.map((application) => application.id);
}

/** Every committee id these applicants asked for, each one only once. */
function preferredCommitteeIds(applications: OrganiserApplicationQueryRow[]): string[] {
	const committeeIds = new Set<string>();

	for (const application of applications) {
		for (const committeeId of application.committee_preferences) {
			committeeIds.add(committeeId);
		}
	}

	return [...committeeIds];
}

/** One page of the organiser's table, and how many rows there are altogether. */
export type ApplicationListPage = {
	rows: OrganiserApplicationRow[];
	/** Every row that matched, not just the ones on this page. */
	total: number;
};

/**
 * The applications of one conference as the organiser's table shows them.
 *
 * Drafts are left out by the query itself and never by Row Level Security.
 *
 * The search, the country filter, the committee filter, the sort and the page
 * are all conditions on one query of the `applications_with_applicant` view, so
 * the database answers with the 25 rows the table draws and with how many rows
 * matched altogether. Nothing is read that is not shown, which is what keeps
 * `max_rows` in `supabase/config.toml` out of the answer.
 *
 * Two small lookups follow, about those 25 rows and no more: what the first
 * preference of each is called, and — only on the "Accepted" tab — the seat
 * each one won. Neither can be part of the first query. The committee is
 * looked up rather than joined because only the first preference is shown and
 * `committee_preferences` is an array of ids; the seat is a row of another
 * table pointing back at the application.
 */
export async function listApplications(
	supabase: SupabaseClient,
	conferenceId: string,
	query: ApplicationListQuery
): Promise<ApplicationListPage> {
	// `range` counts from 0 and includes both ends, and `query.page` is 1-based,
	// the way the address bar writes it, so page 1 is rows 0 to 24.
	const firstIndex = (query.page - 1) * APPLICATIONS_PAGE_SIZE;
	const lastIndex = firstIndex + APPLICATIONS_PAGE_SIZE - 1;

	const { data, error, count } = await matchingApplicationsRequest(
		supabase,
		conferenceId,
		query,
		ORGANISER_APPLICATION_COLUMNS,
		// `count: 'exact'` asks for the number of matches in total as well, not
		// just for the ones on this page.
		{ count: 'exact' }
	)
		.range(firstIndex, lastIndex)
		// Supabase guesses the shape of a row from the text in `select`, and it
		// cannot know the columns of a view. This replaces the guess with ours, and
		// it has to come last.
		.overrideTypes<OrganiserApplicationQueryRow[], { merge: false }>();

	// Somebody asked for a page past the last one, for example by editing the URL.
	if (error?.code === PAGE_OUT_OF_RANGE_CODE) {
		return { rows: [], total: 0 };
	}

	if (error) {
		throw new Error(`Could not read the applications: ${error.message}`);
	}

	const applications: OrganiserApplicationQueryRow[] = data ?? [];
	// The first preference is the only committee a row shows, so only those are
	// looked up rather than every committee everybody asked for.
	const firstPreferences = applications
		.map((application) => application.committee_preferences[0])
		.filter((committeeId) => committeeId !== undefined);

	// Neither of these needs the other's answer, so both are sent at once and the
	// page waits for the slower of them rather than for the sum.
	const [committeeHeadings, seatLabels] = await Promise.all([
		readCommitteeHeadings(supabase, [...new Set(firstPreferences)]),
		readSeatLabels(supabase, acceptedApplicationIds(applications))
	]);

	const rows: OrganiserApplicationRow[] = applications.map((application) => {
		const firstPreference = application.committee_preferences[0];

		return {
			id: application.id,
			applicantName: applicantNameOf(application.applicant_name),
			avatarPath: application.applicant_avatar_path,
			institutionName: application.applicant_institution_name,
			countryCode: application.applicant_country_code,
			// The column has a default of `none` in the database, so this stands in
			// only for an applicant whose profile row could not be read at all.
			experienceLevel: application.applicant_experience_level ?? 'none',
			firstPreference:
				firstPreference === undefined ? null : (committeeHeadings.get(firstPreference) ?? null),
			// The ids as the applicant put them down. Nothing on the row draws them;
			// the seat panel orders its dropdown by them.
			committeePreferences: application.committee_preferences,
			status: application.status,
			submittedAt: application.submitted_at,
			decidedAt: application.decided_at,
			seatLabel: seatLabels.get(application.id) ?? null
		};
	});

	return { rows, total: count ?? 0 };
}

/**
 * How many applications this conference has in each of the five shown statuses.
 *
 * Five counting queries, one per tab, sent at once. Each one asks for the count
 * and for no rows at all (`head: true`), so the answer is a single number that
 * `max_rows` cannot shorten. The earlier version read the status of every
 * application and counted the answers here, which is exactly how a conference
 * with more than a thousand applications came to show tab numbers that were
 * both wrong and smaller than the table underneath them.
 *
 * Drafts are left out here too, because each query names the status it counts,
 * so the numbers on the tabs and the rows under them can never disagree.
 */
export async function countApplicationsByStatus(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<ApplicationStatusCounts> {
	const counted = await Promise.all(
		APPLICATION_STATUS_TABS.map(async (status) => {
			const { count, error } = await supabase
				.from('applications')
				.select('id', { count: 'exact', head: true })
				.eq('conference_id', conferenceId)
				.eq('status', status);

			if (error) {
				throw new Error(`Could not count the applications: ${error.message}`);
			}

			return { status, total: count ?? 0 };
		})
	);

	// A copy, so that counting never writes on the shared empty one.
	const counts: ApplicationStatusCounts = { ...EMPTY_APPLICATION_STATUS_COUNTS };

	for (const tab of counted) {
		counts[tab.status] = tab.total;
	}

	return counts;
}

/**
 * "Maria Kowalska · +48 22 000 0000" for the CSV, or `null` when neither half
 * was ever filled in. One half on its own is written on its own.
 */
function emergencyContactOf(details: PrivateDetailsRow | null): string | null {
	const name = details?.emergency_contact_name ?? '';
	const phone = details?.emergency_contact_phone ?? '';
	const halves: string[] = [];

	if (name !== '') {
		halves.push(name);
	}

	if (phone !== '') {
		halves.push(phone);
	}

	if (halves.length === 0) {
		return null;
	}

	return halves.join(' · ');
}

/**
 * The names of the committees this applicant asked for, in their own order.
 *
 * A committee the organisers have deleted since is left out rather than shown
 * as a gap, which is the same thing `listPreferredCommitteeNames` in
 * `./applications.ts` does for the applicant's own page.
 */
function committeeNamesOf(
	committeePreferences: string[],
	committeeHeadings: Map<string, string>
): string[] {
	const names: string[] = [];

	for (const committeeId of committeePreferences) {
		const heading = committeeHeadings.get(committeeId);

		if (heading !== undefined) {
			names.push(heading);
		}
	}

	return names;
}

/**
 * Every application the export's filter matches, however many there are.
 *
 * PostgREST answers with at most `max_rows` rows whatever is asked of it, so
 * one unbounded query would quietly hand back the first thousand and the file
 * would be short with nothing to say so. This asks for a window of
 * `EXPORT_BATCH_SIZE` rows at a time and moves the window along by however many
 * rows really came back, until one comes back empty.
 *
 * Moving by what came back rather than by what was asked for is deliberate. A
 * batch that is shorter than asked for would be the obvious place to stop, but
 * it is only the end of the list if the server never returns fewer rows than
 * asked; the moment `max_rows` were set below `EXPORT_BATCH_SIZE`, every batch
 * would look like the last one and the file would be silently short again. An
 * empty answer is the one signal that cannot mean anything else, and it costs
 * one extra query per export.
 *
 * The order is the same as the table's, id tie-break included, which is what
 * makes the windows line up: without it a row could be in two batches or in
 * none.
 */
async function readApplicationsForExport(
	supabase: SupabaseClient,
	conferenceId: string,
	query: ApplicationListQuery
): Promise<ApplicationExportQueryRow[]> {
	const applications: ApplicationExportQueryRow[] = [];
	let firstIndex = 0;

	while (true) {
		const { data, error } = await matchingApplicationsRequest(
			supabase,
			conferenceId,
			query,
			APPLICATION_EXPORT_COLUMNS
		)
			.range(firstIndex, firstIndex + EXPORT_BATCH_SIZE - 1)
			.overrideTypes<ApplicationExportQueryRow[], { merge: false }>();

		// The window starts past the last row. That is the end of the list and not
		// a fault, the same way it is for the table's paging.
		if (error?.code === PAGE_OUT_OF_RANGE_CODE) {
			return applications;
		}

		if (error) {
			throw new Error(`Could not read the applications: ${error.message}`);
		}

		const batch: ApplicationExportQueryRow[] = data ?? [];

		if (batch.length === 0) {
			return applications;
		}

		applications.push(...batch);
		firstIndex = firstIndex + batch.length;
	}
}

/**
 * The same filter as the table, every column the CSV needs, and no paging.
 *
 * Four lookups follow the applications, for the four things the view cannot
 * carry: the private details the reader's permissions show (through the two
 * views of `$lib/server/private-details.ts`; the rest stay `null`), the name of every committee each applicant asked
 * for, the seat an accepted application won, and the organisers' own note on
 * each. All four ask in batches, because an export is as many rows as the
 * filter matched rather than the 25 a page holds.
 *
 * The rows come out in the order the organiser was looking at, because the
 * database sorted them, so the spreadsheet matches the screen it was downloaded
 * from.
 */
export async function listApplicationsForExport(
	supabase: SupabaseClient,
	conferenceId: string,
	query: ApplicationListQuery
): Promise<ApplicationExportRow[]> {
	const applications = await readApplicationsForExport(supabase, conferenceId, query);
	const userIds = applications.map((application) => application.user_id);

	// None of these four needs another's answer, so all four are sent at once.
	const [details, committeeHeadings, seatLabels, internalNotes] = await Promise.all([
		readPrivateDetails(supabase, userIds),
		// The CSV has a column for every preference, not just the first one.
		readCommitteeHeadings(supabase, preferredCommitteeIds(applications)),
		readSeatLabels(supabase, acceptedApplicationIds(applications)),
		readInternalNotes(
			supabase,
			applications.map((application) => application.id)
		)
	]);

	return applications.map((application) => {
		const applicantDetails = details.get(application.user_id) ?? null;
		const countryCode = application.applicant_country_code;

		return {
			applicantName: applicantNameOf(application.applicant_name),
			email: applicantDetails?.email ?? null,
			institutionName: application.applicant_institution_name,
			// The CSV writes "Poland" rather than "PL", because a spreadsheet is read
			// by people who do not know the codes.
			countryName: countryCode === null ? null : countryName(countryCode),
			experienceLevel: application.applicant_experience_level ?? 'none',
			dateOfBirth: applicantDetails?.date_of_birth ?? null,
			phone: applicantDetails?.phone ?? null,
			dietaryRequirements: applicantDetails?.dietary_requirements ?? null,
			emergencyContact: emergencyContactOf(applicantDetails),
			committeeNames: committeeNamesOf(application.committee_preferences, committeeHeadings),
			seatPreferences: application.seat_preferences,
			motivation: application.motivation,
			answers: application.answers,
			status: application.status,
			submittedAt: application.submitted_at,
			decidedAt: application.decided_at,
			seatLabel: seatLabels.get(application.id) ?? null,
			decisionNote: application.decision_note,
			internalNote: internalNotes.get(application.id) ?? null
		};
	});
}

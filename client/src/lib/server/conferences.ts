/**
 * Where the conference pages get their data, and where new conferences are saved.
 *
 * Files under `$lib/server` only ever run on the server, so this is where the
 * database is queried. Every function takes the Supabase client as its first
 * argument. Pages pass in `locals.supabase`, the client that knows who is signed in,
 * so the database's Row Level Security rules (see `supabase/policies.sql` in the
 * repository root) decide what each visitor may read and save.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ApplicationStatus } from '$lib/applications';
import {
	PAGE_SIZE,
	type ApplicationOpenMode,
	type Conference,
	type ConferenceLevel,
	type ConferenceQuery,
	type ConferenceStatus,
	type FeeStatus,
	type KnownOrTba,
	type LocationMode,
	type MyDelegation,
	type MySeat
} from '$lib/conferences';
import {
	safeWebAddress,
	type ConferenceDetails,
	type ConferenceEditValues
} from '$lib/conference-details';
import { countryName, toCountryOptions, type CountryOption } from '$lib/countries';
import { addMonths, dayInTimezone } from '$lib/dates';
import { countryCodesInRegions } from '$lib/regions';
import { makeUniqueSlug } from '$lib/slugs';
import { startingApplicationWindow } from '$lib/starting-application-window';
import { listCommitteesWithSeatCounts, type CommitteeWithSeats } from './committees';
import { getMyApplicationFor } from './applications';
import { getMyDelegationFor } from './delegations';
import { listPublicTeam, type TeamMember } from './team';
import { toSafeSearchWords } from './search-text';

/**
 * One row of the `conferences_with_organization` view, with its number of
 * committees attached.
 *
 * The view is the `conferences` table with the name and the slug of the
 * organization joined on; see the comment on the search in `listConferences` for
 * why it exists.
 *
 * We write this shape by hand because the query does not come back in the shape
 * the generated types (`src/lib/database.types.ts`) describe: those give every
 * column of a view as possibly missing, and they know nothing about the
 * `committees` count this query also asks for. It is the same reason
 * `.overrideTypes` is needed further down. If you add a column in Supabase and
 * want to show it, add it here and to `CONFERENCE_COLUMNS` below, otherwise it
 * will not be typed or fetched.
 */
export type ConferenceRow = {
	id: string;
	slug: string;
	name: string;
	description: string | null;
	/** Both `null` for an online conference and for a draft that has not said where yet. */
	city: string | null;
	country_code: string | null;
	location_mode: LocationMode;
	venue_status: KnownOrTba;
	conference_time_status: KnownOrTba;
	/** Postgres `time` columns, which arrive as `HH:MM:SS`; `null` while the times are to be announced. */
	start_time: string | null;
	end_time: string | null;
	fee_status: FeeStatus;
	application_open_mode: ApplicationOpenMode;
	/** `YYYY-MM-DD`. */
	start_date: string;
	end_date: string;
	website_url: string | null;
	banner_path: string | null;
	logo_path: string | null;
	level: ConferenceLevel;
	status: ConferenceStatus;
	/** An IANA name such as `Europe/Amsterdam`. Every time of this conference is shown in it. */
	timezone: string;
	expected_delegates: number | null;
	/** ISO timestamps. `null` means the application window is open on that side. */
	applications_open_at: string | null;
	applications_close_at: string | null;
	/** The one-line summary under the name on the conference's own page. */
	tagline: string | null;
	venue_name: string | null;
	venue_address: string | null;
	contact_email: string | null;
	instagram_url: string | null;
	contact_phone: string | null;
	facebook_url: string | null;
	linkedin_url: string | null;
	youtube_url: string | null;
	tiktok_url: string | null;
	/** The language the conference is debated in, such as `English`. Never missing. */
	language: string;
	/** The ages the conference is for. Either end may be missing, meaning "no limit". */
	min_age: number | null;
	max_age: number | null;
	position_paper_required: boolean;
	/** An ISO timestamp, or `null` when no deadline has been set. */
	position_paper_deadline: string | null;
	/** Which of the two ways in a delegate may apply. Both are on by default. */
	accepts_individual_applications: boolean;
	accepts_delegations: boolean;
	/**
	 * The organization running the conference. These are ordinary columns of the
	 * view, and they are never missing: the view joins on `organization_id`, which
	 * is a `not null` column, so every conference has exactly one organization.
	 */
	organization_name: string;
	organization_slug: string;
	/** The conference's committees, in no particular order; `toConference` sorts them. */
	committees: CommitteeNameRow[];
};

/** The three columns of a committee that a conference card needs for its chips. */
type CommitteeNameRow = {
	name: string;
	abbreviation: string | null;
	/** Where the organiser put the committee in their list, the smallest first. */
	position: number;
};

/**
 * The columns every conference query asks for: what a card in the directory
 * shows, and what the conference's own page shows underneath it. They are all
 * ordinary columns of the view, `organization_name` and `organization_slug`
 * included, the same as `name` and `city`. Only `committees(...)` is a lookup
 * in another table: it asks Supabase for three columns of each of the
 * conference's committees, which the card shows as chips (Trello WMcXfry0) and
 * counts for "8 committees".
 */
const CONFERENCE_COLUMNS =
	'id, slug, name, description, city, country_code, location_mode, venue_status, conference_time_status, start_time, end_time, fee_status, application_open_mode, start_date, end_date, website_url, banner_path, logo_path, level, status, timezone, expected_delegates, applications_open_at, applications_close_at, tagline, venue_name, venue_address, contact_email, instagram_url, contact_phone, facebook_url, linkedin_url, youtube_url, tiktok_url, language, min_age, max_age, position_paper_required, position_paper_deadline, accepts_individual_applications, accepts_delegations, organization_name, organization_slug, committees(name, abbreviation, position)';

/**
 * The third half of "taking applications" in Supabase's filter language: there
 * is an opening date, or the organiser did not choose to open applications by
 * hand. `isAcceptingApplications` in `$lib/conferences.ts` refuses a `manual`
 * conference nobody has opened yet, and the filters have to agree with it or a
 * card would contradict the filter that found it.
 */
const MANUALLY_OPENED_OR_DATED =
	'applications_open_at.not.is.null,application_open_mode.neq.manual';

/**
 * Add the conditions that mean "taking applications right now" to a request.
 *
 * The application window has to contain `now`, and a missing bound counts as
 * open on that side. That is the same rule `isAcceptingApplications` applies in
 * the browser to decide whether a card shows the "Applications open" badge, and
 * the two have to agree or a card would contradict the filter that found it.
 *
 * Three places ask this question: the directory's "open only" filter, the home
 * page's "Open for applications" cards and the count the home page shows
 * somebody with no conference. They all go through here so that they cannot
 * drift apart.
 *
 * The angle brackets make this generic: `Request` stands for whatever kind of
 * request is handed in, so the one the directory builds (which counts its
 * matches) and the one the count builds (which wants nothing but the count)
 * both come back as the same kind they went in. All the helper needs of a
 * request is that `.or(...)` adds a condition and hands the request back, which
 * is what the constraint after `extends` says.
 */
function withOpenApplications<Request extends { or: (filter: string) => Request }>(
	request: Request,
	now: Date
): Request {
	const nowAsIso = now.toISOString();

	// Supabase joins separate `.or()` calls with AND, so this reads as "(no
	// opening date or it has passed) and (no closing date or it has not)". A
	// missing opening date only counts as open when the organiser did not choose
	// to open applications by hand, which they have not done yet.
	return request
		.or(`applications_open_at.is.null,applications_open_at.lte.${nowAsIso}`)
		.or(`applications_close_at.is.null,applications_close_at.gte.${nowAsIso}`)
		.or(MANUALLY_OPENED_OR_DATED);
}

/** The error code Supabase sends when a page number is past the last page of results. */
const PAGE_OUT_OF_RANGE_CODE = 'PGRST103';

/**
 * The timezone the directory counts "today" in when it decides which conferences
 * have already finished.
 *
 * The directory shows conferences from every timezone at once, and `end_date` is a
 * plain `date` column with no timezone of its own, so there is no single right zone
 * to count in. UTC is therefore what "today" means here, the same choice the
 * notifications page made for its day headings (`NOTIFICATION_TIME_ZONE` in
 * `$lib/notifications.ts`). At worst a conference stays listed for a few extra
 * hours on the day it ends.
 */
const DIRECTORY_TIME_ZONE = 'UTC';

/**
 * A Postgres `time` as `HH:MM`. The database sends `10:00:00`, and nobody
 * schedules a committee session to the second.
 */
function toHoursAndMinutes(time: string | null): string | null {
	return time === null ? null : time.slice(0, 5);
}

/**
 * Turn a database row (snake_case names) into the `Conference` shape the pages use.
 *
 * Exported for its test only: a row with no city, which an online conference
 * has, must come through without anything trying to name its country.
 */
export function toConference(row: ConferenceRow): Conference {
	return {
		id: row.id,
		slug: row.slug,
		name: row.name,
		description: row.description,
		organizationName: row.organization_name,
		organizationSlug: row.organization_slug,
		city: row.city,
		countryCode: row.country_code,
		countryName: row.country_code === null ? null : countryName(row.country_code),
		locationMode: row.location_mode,
		venueStatus: row.venue_status,
		conferenceTimeStatus: row.conference_time_status,
		startTime: toHoursAndMinutes(row.start_time),
		endTime: toHoursAndMinutes(row.end_time),
		feeStatus: row.fee_status,
		applicationOpenMode: row.application_open_mode,
		startDate: row.start_date,
		endDate: row.end_date,
		websiteUrl: safeWebAddress(row.website_url),
		bannerPath: row.banner_path,
		logoPath: row.logo_path,
		level: row.level,
		status: row.status,
		timezone: row.timezone,
		expectedDelegates: row.expected_delegates,
		applicationsOpenAt: row.applications_open_at,
		applicationsCloseAt: row.applications_close_at,
		tagline: row.tagline,
		venueName: row.venue_name,
		venueAddress: row.venue_address,
		contactEmail: row.contact_email,
		instagramUrl: safeWebAddress(row.instagram_url),
		contactPhone: row.contact_phone,
		facebookUrl: safeWebAddress(row.facebook_url),
		linkedinUrl: safeWebAddress(row.linkedin_url),
		youtubeUrl: safeWebAddress(row.youtube_url),
		tiktokUrl: safeWebAddress(row.tiktok_url),
		language: row.language,
		minAge: row.min_age,
		maxAge: row.max_age,
		positionPaperRequired: row.position_paper_required,
		positionPaperDeadline: row.position_paper_deadline,
		acceptsIndividualApplications: row.accepts_individual_applications,
		acceptsDelegations: row.accepts_delegations,
		committeeCount: row.committees.length,
		committeeNames: committeeShortNames(row.committees)
	};
}

/**
 * The name each committee goes by on a card, in the organiser's order: its
 * abbreviation, such as "DISEC", when it has one, and its full name otherwise.
 */
function committeeShortNames(committees: CommitteeNameRow[]): string[] {
	// `sort` changes the list it is called on, so it sorts a copy (`[...committees]`)
	// and leaves the row as Supabase sent it.
	const inOrganiserOrder = [...committees].sort(
		(first, second) => first.position - second.position
	);

	return inOrganiserOrder.map((committee) => committee.abbreviation ?? committee.name);
}

/**
 * Find one page of public conferences, in the order the visitor asked for.
 *
 * `total` counts every match rather than just the ones on this page, so the
 * page can say "Showing 1-12 of 37" and work out how many pages there are.
 *
 * `now` is given rather than read from the clock here, so that the two things
 * that depend on it — leaving out conferences that have finished, and the "open
 * for applications" filter — are the same moment, and so a test can decide what
 * "now" is.
 */
export async function listConferences(
	supabase: SupabaseClient,
	query: ConferenceQuery,
	now: Date
): Promise<{ rows: Conference[]; total: number }> {
	// Each step below adds one condition to the request. Nothing is sent to Supabase
	// until the request is awaited further down. `count: 'exact'` also asks for the
	// number of matches in total, not just on this page.
	let request = supabase
		.from('conferences_with_organization')
		.select(CONFERENCE_COLUMNS, { count: 'exact' })
		.eq('status', 'published');

	// A conference that is over is not something anyone can still attend, so the
	// directory stops showing it the day after it ends.
	const today = dayInTimezone(now, DIRECTORY_TIME_ZONE);
	request = request.gte('end_date', today);

	// The search matches each word on its own rather than the whole text in one
	// piece, so a conference's name typed exactly as a card shows it, brackets
	// and all, still finds it (T164). `toSafeSearchWords` is what stops a word
	// being read as filter language itself.
	const searchWords = toSafeSearchWords(query.q);

	for (const word of searchWords) {
		// `.or` takes one piece of text in Supabase's own filter language, and this
		// one means "the conference's name, or its city, or the name of the
		// organisation running it, contains this word". `ilike` ignores upper
		// and lower case, `%` stands for "anything", and the double quotes keep a
		// word with an apostrophe or a hyphen in it together. Each `.or` is one
		// more condition of the request, so a conference has to match every word.
		//
		// The organisation's name can sit beside the other two only because this query
		// reads the `conferences_with_organization` view instead of the `conferences`
		// table: PostgREST cannot put a column of another table inside a top-level
		// `or`, and the view turns `organization_name` into a column of the thing we
		// are already querying. The earlier version searched the organizations table
		// first and wrote `organization_id.in.(<every matching id>)` into this filter,
		// which broke on exactly the words visitors type: hundreds of organisations
		// contain "MUN" or "School", the list of ids made the address longer than the
		// server accepts, and the page answered with an error instead of results.
		const pattern = `"%${word}%"`;
		request = request.or(
			`name.ilike.${pattern},city.ilike.${pattern},organization_name.ilike.${pattern}`
		);
	}

	if (query.country) {
		request = request.eq('country_code', query.country);
	}

	// A region is a list of countries, so "Europe" asks for any of Europe's codes.
	if (query.regions.length > 0) {
		request = request.in('country_code', countryCodesInRegions(query.regions));
	}

	// "Next 3 months" means starting on or before the day three months from today.
	// A conference already under way still counts: it has not ended, which the
	// `end_date` condition above has already made sure of.
	if (query.withinMonths > 0) {
		request = request.lte('start_date', addMonths(today, query.withinMonths));
	}

	// '' means "any level", so the filter is only added when one was chosen.
	if (query.level) {
		request = request.eq('level', query.level);
	}

	if (query.openOnly) {
		// The same conditions the home page's cards and count use, so that the
		// three never disagree about which conferences are open.
		request = withOpenApplications(request, now);
	}

	// `range` counts from 0 and includes both ends, so page 1 is rows 0 to 11.
	const firstIndex = (query.page - 1) * PAGE_SIZE;
	const lastIndex = firstIndex + PAGE_SIZE - 1;

	// `soonest`, the default, puts the conference that starts next first. `newest`
	// puts the most recently added one first, which is `created_at` counting down.
	const isNewestFirst = query.sort === 'newest';
	const sortColumn = isNewestFirst ? 'created_at' : 'start_date';

	const { data, error, count } = await request
		// The sort has to be decided before `range` cuts a page out of the results,
		// because which conferences are on page 2 depends on it.
		.order(sortColumn, { ascending: !isNewestFirst })
		// A second sort keeps the order the same when two conferences tie on the first.
		.order('name', { ascending: true })
		.range(firstIndex, lastIndex)
		// Supabase guesses the shape of a row from the text in `select`, and its guess
		// does not match what comes back: it cannot know the columns of the view, and
		// it types the `committees(...)` lookup loosely. This replaces the guess with
		// our own `ConferenceRow`. It has to come last.
		.overrideTypes<ConferenceRow[], { merge: false }>();

	// Somebody asked for a page past the last one, for example by editing the URL.
	if (error?.code === PAGE_OUT_OF_RANGE_CODE) {
		return { rows: [], total: 0 };
	}

	// A failed query means a bug (a wrong column name, a missing policy), not
	// something the visitor can fix. Throwing shows SvelteKit's error page, and the
	// real message ends up in the server log.
	if (error) {
		throw new Error(`Could not list conferences: ${error.message}`);
	}

	const rows: ConferenceRow[] = data ?? [];

	return { rows: rows.map(toConference), total: count ?? 0 };
}

/**
 * Every country that has a public conference still to come, as dropdown options
 * sorted by name.
 *
 * It filters on the same two things as `listConferences`, so the dropdown never
 * offers a country that would give the visitor no results at all. `now` is given
 * for the same reason as there.
 */
export async function listCountries(supabase: SupabaseClient, now: Date): Promise<CountryOption[]> {
	const today = dayInTimezone(now, DIRECTORY_TIME_ZONE);

	// The directory reads its conferences through the view everywhere, so this is
	// the same set of rows the list itself would find. Only `country_code` is
	// needed here; the organisation's name comes along unused.
	const { data, error } = await supabase
		.from('conferences_with_organization')
		.select('country_code')
		.eq('status', 'published')
		.gte('end_date', today);

	if (error) {
		throw new Error(`Could not list countries: ${error.message}`);
	}

	const rows: { country_code: string | null }[] = data ?? [];
	// An online conference has no country, and there is no country to offer for it.
	const codes = rows.map((row) => row.country_code).filter((code): code is string => code !== null);

	// Supabase has no "distinct" option, so every conference's code comes back and a
	// Set removes the duplicates; the spread turns it back into an array. Supabase
	// returns at most 1000 rows by default, which is plenty while the table is small.
	const uniqueCodes = [...new Set(codes)];

	return toCountryOptions(uniqueCodes);
}

/**
 * Find one conference by its slug, or `null` when there is no such conference,
 * or none this reader is allowed to open.
 */
export async function getConferenceBySlug(
	supabase: SupabaseClient,
	slug: string
): Promise<Conference | null> {
	// There is no status filter on this query. Row Level Security already
	// decides: a visitor reads a conference that is `published` or `archived`,
	// and the people running it read their own `draft` as well, which is how an
	// organiser opens a preview of a page nobody else can see
	// (`specs/02-architecture/permissions.md`). Filtering here would take that
	// preview away again.
	const { data, error } = await supabase
		.from('conferences_with_organization')
		.select(CONFERENCE_COLUMNS)
		.eq('slug', slug)
		// `maybeSingle` returns one row, or `null` when nothing matches, instead of a list.
		.maybeSingle()
		// Replaces Supabase's guess at the row's shape, as explained in `listConferences`.
		.overrideTypes<ConferenceRow, { merge: false }>();

	if (error) {
		throw new Error(`Could not load conference "${slug}": ${error.message}`);
	}

	if (!data) {
		return null;
	}

	return toConference(data);
}

/**
 * How many finished conferences the organisation page lists. Its spec caps the
 * "Past conferences" section at twelve, so an organisation with a long history
 * shows the twelve most recent ones rather than all of them.
 */
const PAST_CONFERENCE_LIMIT = 12;

/**
 * The conferences one organisation runs, split into the ones still to come and
 * the ones that are over. The public organisation page shows the two lists
 * under separate headings.
 *
 * The two halves ask for different statuses on purpose. A conference still to
 * come is only listed once it is `published`, because a `draft` is the
 * organisers' private workspace. A finished one is listed while it is
 * `published` or `archived`, because archiving is what organisers do to a
 * conference that is over and it should stay on the organisation's record.
 * Row Level Security refuses a draft to everybody but its own team in any case;
 * the filter here is what keeps an organiser's own drafts out of the page they
 * are previewing.
 *
 * `now` is given rather than read from the clock here, for the same reason as in
 * `listConferences`: the cut between the two lists and the badges on the cards
 * have to be one moment, and a test has to be able to decide what that moment is.
 */
export async function listOrganizationConferences(
	supabase: SupabaseClient,
	organizationId: string,
	now: Date
): Promise<{ upcoming: Conference[]; past: Conference[] }> {
	// The same UTC day the directory counts in, so that a conference the
	// directory has stopped listing is the same one this page calls finished.
	// `DIRECTORY_TIME_ZONE` above says why the zone is UTC.
	const today = dayInTimezone(now, DIRECTORY_TIME_ZONE);

	// Neither list needs the other's answer, so both are asked for at once.
	const [upcomingAnswer, pastAnswer] = await Promise.all([
		supabase
			.from('conferences_with_organization')
			.select(CONFERENCE_COLUMNS)
			.eq('organization_id', organizationId)
			.eq('status', 'published')
			.gte('end_date', today)
			// Soonest first, and the name breaks a tie so the order never wobbles
			// between two conferences that start on the same day.
			.order('start_date', { ascending: true })
			.order('name', { ascending: true })
			.overrideTypes<ConferenceRow[], { merge: false }>(),
		supabase
			.from('conferences_with_organization')
			.select(CONFERENCE_COLUMNS)
			.eq('organization_id', organizationId)
			.in('status', ['published', 'archived'])
			.lt('end_date', today)
			// Most recently finished first, so the last conference the organisation
			// ran is the one a school reads about first.
			.order('end_date', { ascending: false })
			.order('name', { ascending: true })
			.limit(PAST_CONFERENCE_LIMIT)
			.overrideTypes<ConferenceRow[], { merge: false }>()
	]);

	// A failed query means a bug (a wrong column name, a missing policy), not
	// something the visitor can fix, so it throws the way `listConferences` does.
	if (upcomingAnswer.error) {
		throw new Error(`Could not list upcoming conferences: ${upcomingAnswer.error.message}`);
	}

	if (pastAnswer.error) {
		throw new Error(`Could not list past conferences: ${pastAnswer.error.message}`);
	}

	const upcomingRows: ConferenceRow[] = upcomingAnswer.data ?? [];
	const pastRows: ConferenceRow[] = pastAnswer.data ?? [];

	return { upcoming: upcomingRows.map(toConference), past: pastRows.map(toConference) };
}

/**
 * The conferences this person helps run: the ones belonging to an organisation
 * they are a member of, and the ones they are an organiser of through
 * `conference_staff`. Soonest first.
 *
 * Archived conferences are left out, because the dashboard is about work still
 * to do. A draft is kept: it is the organisers' own workspace and the whole
 * point of the section is to get them back to it. A quick session is left out
 * too (S14): its creator organises it through their personal organisation, but
 * `/home` lists it under "Quick sessions" and nowhere else.
 *
 * Both id lists come from the caller rather than being looked up here, because
 * `loadHomeDashboard` has already read the reader's organisations and staff
 * rows for the hero and the "Also coming up" rows, and asking twice would be a
 * second round trip for the same answer.
 */
export async function listManagedConferences(
	supabase: SupabaseClient,
	organizationIds: string[],
	conferenceIds: string[]
): Promise<Conference[]> {
	// Somebody who belongs to no organisation and organises nothing helps run
	// nothing, and the filter below would have no condition to put in it at all.
	// So nothing is sent.
	if (organizationIds.length === 0 && conferenceIds.length === 0) {
		return [];
	}

	// The two halves of one `.or(...)`: the conference belongs to one of my
	// organisations, or I am named as an organiser of it. A list that is empty is
	// left out rather than written as `in.()`, which PostgREST refuses.
	const conditions: string[] = [];

	if (organizationIds.length > 0) {
		conditions.push(`organization_id.in.(${organizationIds.join(',')})`);
	}

	if (conferenceIds.length > 0) {
		conditions.push(`id.in.(${conferenceIds.join(',')})`);
	}

	const { data, error } = await supabase
		.from('conferences_with_organization')
		.select(CONFERENCE_COLUMNS)
		.eq('kind', 'conference')
		.neq('status', 'archived')
		.or(conditions.join(','))
		// Soonest first, and the name breaks a tie so the order never wobbles
		// between two conferences that start on the same day, the same way
		// `listOrganizationConferences` sorts its upcoming list.
		.order('start_date', { ascending: true })
		.order('name', { ascending: true })
		// There is deliberately no `.limit(...)` here. One person helps run a
		// handful of conferences, and the home page needs every one of them: each
		// is the hero or an "Also coming up" row (`docs/home.md`), and the page
		// itself decides how many rows to draw and lifts that limit on
		// `?all=conferences`.
		//
		// Replaces Supabase's guess at the row's shape, as explained in
		// `listConferences`. It has to come last.
		.overrideTypes<ConferenceRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not list the conferences you help run: ${error.message}`);
	}

	const rows: ConferenceRow[] = data ?? [];

	return rows.map(toConference);
}

/**
 * Every conference of these organisations, whatever its status: the list under
 * each organisation heading in the organiser area.
 *
 * Nothing is left out here, unlike `listManagedConferences` above. `/manage` is
 * the place an organiser reaches a draft they have not finished and an archived
 * conference they still need the records of, so all three statuses come back
 * and the page groups them.
 */
export async function listConferencesForOrganizations(
	supabase: SupabaseClient,
	organizationIds: string[]
): Promise<Conference[]> {
	// Somebody who belongs to no organisation has no conferences to list, and an
	// empty list would have to be written as `in.()`, which PostgREST refuses. So
	// nothing is sent, the same way `listManagedConferences` sends nothing.
	if (organizationIds.length === 0) {
		return [];
	}

	const { data, error } = await supabase
		.from('conferences_with_organization')
		.select(CONFERENCE_COLUMNS)
		.in('organization_id', organizationIds)
		// Drafts first, then published, then archived, which is the order
		// `specs/05-pages/organiser/manage-index.md` asks for. Postgres sorts an
		// enum column by the order its values were declared in rather than
		// alphabetically, and the migration declares `conference_status` as
		// ('draft', 'published', 'archived'), so asking for `status` ascending is
		// exactly that order.
		.order('status', { ascending: true })
		// Soonest first inside each status.
		.order('start_date', { ascending: true })
		// Replaces Supabase's guess at the row's shape, as explained in
		// `listConferences`. It has to come last.
		.overrideTypes<ConferenceRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not list the conferences of your organisations: ${error.message}`);
	}

	const rows: ConferenceRow[] = data ?? [];

	return rows.map(toConference);
}

/**
 * The conferences with these ids, whatever their status, soonest first.
 *
 * The organiser area uses it for the conferences somebody is named staff of:
 * it already knows their ids from their `conference_staff` rows, and a draft
 * has to come back too, because being staff of one is the whole reason it is
 * listed.
 *
 * A quick session is left out (S14). Its creator holds a chair staff row in
 * it, but `/manage`, `/schedule` and `/resources`, the three pages that list
 * a person's conferences through this, are no place for it: `/home` lists it
 * under "Quick sessions" instead.
 */
export async function listConferencesByIds(
	supabase: SupabaseClient,
	conferenceIds: string[]
): Promise<Conference[]> {
	// An empty list would have to be written as `in.()`, which PostgREST refuses,
	// and there is nothing to ask about in any case.
	if (conferenceIds.length === 0) {
		return [];
	}

	const { data, error } = await supabase
		.from('conferences_with_organization')
		.select(CONFERENCE_COLUMNS)
		.in('id', conferenceIds)
		.eq('kind', 'conference')
		// Soonest first, and the name breaks a tie so the order never wobbles
		// between two conferences that start on the same day, the same way
		// `listManagedConferences` sorts.
		.order('start_date', { ascending: true })
		.order('name', { ascending: true })
		.overrideTypes<ConferenceRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not list those conferences: ${error.message}`);
	}

	const rows: ConferenceRow[] = data ?? [];

	return rows.map(toConference);
}

/**
 * Conferences the reader could still apply to, for the home page's "Open for
 * applications" cards: published, not finished, application window open, and
 * not one of the ones they are already part of. The one closing soonest first,
 * so that the cards a reader has least time left for are the ones they see.
 */
export async function listConferencesToExplore(
	supabase: SupabaseClient,
	excludeConferenceIds: string[],
	now: Date,
	limit: number
): Promise<Conference[]> {
	// The same UTC day the directory counts in, so that a conference the
	// directory has stopped listing is not offered here either. `DIRECTORY_TIME_ZONE`
	// above says why the zone is UTC.
	const today = dayInTimezone(now, DIRECTORY_TIME_ZONE);

	// Each step adds one condition. Nothing is sent until the chain is awaited
	// further down. The window conditions are the directory's own, so a card
	// here never contradicts its own "Applications open" badge.
	let request = withOpenApplications(
		supabase
			.from('conferences_with_organization')
			.select(CONFERENCE_COLUMNS)
			.eq('status', 'published')
			.gte('end_date', today),
		now
	);

	// Only when there is something to leave out: PostgREST refuses an empty `in`
	// list, so asking for `not.id.in.()` would answer with an error instead of
	// with every conference.
	if (excludeConferenceIds.length > 0) {
		request = request.not('id', 'in', `(${excludeConferenceIds.join(',')})`);
	}

	const { data, error } = await request
		// Closing soonest first. A conference with no closing date stays open until
		// it starts, so it has the most time left and goes last (`nullsFirst: false`
		// is how Supabase says "nulls last"). The start day and then the name break
		// a tie, so the order never wobbles between two that close together.
		.order('applications_close_at', { ascending: true, nullsFirst: false })
		.order('start_date', { ascending: true })
		.order('name', { ascending: true })
		.limit(limit)
		// Replaces Supabase's guess at the row's shape. It has to come last.
		.overrideTypes<ConferenceRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not list conferences to explore: ${error.message}`);
	}

	const rows: ConferenceRow[] = data ?? [];

	return rows.map(toConference);
}

/**
 * How many conferences are open for applications right now: the number the
 * home page shows somebody with no conference of their own, under "Find your
 * first conference".
 *
 * It is the directory's "open only" filter counted rather than listed, so the
 * number here is the number of cards the reader finds when they follow the
 * button. `now` is given rather than read from the clock, for the same reason
 * as in `listConferences`.
 */
export async function countConferencesOpenForApplications(
	supabase: SupabaseClient,
	now: Date
): Promise<number> {
	// The same UTC day the directory counts in; `DIRECTORY_TIME_ZONE` says why.
	const today = dayInTimezone(now, DIRECTORY_TIME_ZONE);

	// `count: 'exact'` asks for the number of matches, and `head: true` asks for
	// that number instead of the rows, so no conference is sent over the wire
	// only to be counted here.
	const request = supabase
		.from('conferences_with_organization')
		.select('id', { count: 'exact', head: true })
		.eq('status', 'published')
		.gte('end_date', today);

	const { count, error } = await withOpenApplications(request, now);

	if (error) {
		throw new Error(`Could not count the conferences open for applications: ${error.message}`);
	}

	// `null` is what the client answers with when it has no count to report.
	return count ?? 0;
}

/** Everything the public conference page shows, in one object. */
export type ConferencePage = {
	conference: Conference;
	committees: CommitteeWithSeats[];
	/** The organisers and chairs on the "meet the team" list. Empty for anyone who may not read it. */
	team: TeamMember[];
	viewer: ConferenceViewer;
};

/** What this particular reader is allowed to do here, and how they are already involved. */
export type ConferenceViewer = {
	canManage: boolean;
	isStaff: boolean;
	/** The seat this reader holds at this conference, or `null`. */
	seat: MySeat | null;
	/** The reader's own application at this conference, or `null`. */
	application: { id: string; status: ApplicationStatus } | null;
	/** The delegation the reader is in at this conference, or `null`. */
	delegation: MyDelegation | null;
};

/** One row of the seat lookup: the seat's name, with the committee it is in brought along. */
type MySeatRow = {
	name: string;
	/**
	 * One object rather than a list, because a seat belongs to one committee.
	 * `committees!inner(...)` in the select asks for it that way round and, more
	 * importantly, makes the committee part of the match rather than an extra:
	 * without the `!inner` the filter on `committees.conference_id` would not
	 * narrow which seats come back.
	 */
	committees: { slug: string; name: string; conference_id: string };
};

/**
 * The seat this reader holds at this conference, or `null` when they hold none.
 *
 * The `seats` select policy lets somebody read a seat list they sit in, so this
 * query finds their own seat and nothing else, and a person may hold at most
 * one seat per conference.
 */
async function findMySeat(
	supabase: SupabaseClient,
	conferenceId: string,
	userId: string
): Promise<MySeat | null> {
	const { data, error } = await supabase
		.from('seats')
		.select('name, committees!inner(slug, name, conference_id)')
		.eq('user_id', userId)
		.eq('committees.conference_id', conferenceId)
		.maybeSingle()
		.overrideTypes<MySeatRow, { merge: false }>();

	// A reader who may not read any seat list is the ordinary case here rather
	// than a fault: almost everybody reading a conference page has no seat at it.
	// So a refused query means "no seat" instead of an error page.
	if (error || !data) {
		return null;
	}

	return {
		seatName: data.name,
		committeeName: data.committees.name,
		committeeSlug: data.committees.slug
	};
}

/**
 * The reader's own application at this conference, cut down to the two things
 * the page says about it, or `null` when they have none.
 *
 * `getMyApplicationFor` throws when its query fails, because the apply page
 * needs it to: drawing an empty form over somebody's saved draft is worse than
 * an error page. Here the answer is only a line of text and a link, so a
 * failure is caught and answered `null` for the same reason
 * `askConferenceHelper` below answers `false` — everything the viewer decides
 * is an extra link or an extra line, and the worst a wrong `null` does is leave
 * one out, where throwing would replace the whole public page.
 */
async function findMyApplication(
	supabase: SupabaseClient,
	conferenceId: string,
	userId: string
): Promise<{ id: string; status: ApplicationStatus } | null> {
	try {
		const application = await getMyApplicationFor(supabase, conferenceId, userId);

		if (application === null) {
			return null;
		}

		return { id: application.id, status: application.status };
	} catch {
		return null;
	}
}

/**
 * Ask one of the database's permission helpers about the signed-in reader.
 *
 * Both take the conference's id under the argument name `conference_id`,
 * which is what the migrations that define them call it; `has_permission`
 * also takes the permission it is asked about.
 *
 * A helper that fails answers `false` rather than throwing: they decide which
 * extra links and banners the page offers, so the worst a wrong `false` does is
 * hide a link, where throwing would replace the whole page with an error.
 */
async function askConferenceHelper(
	supabase: SupabaseClient,
	helperName: 'has_permission' | 'is_conference_staff',
	helperArguments: { conference_id: string; permission?: 'administrator' }
): Promise<boolean> {
	const { data, error } = await supabase.rpc(helperName, helperArguments);

	if (error) {
		return false;
	}

	return data === true;
}

/**
 * The five things the conference page needs to know about whoever is reading
 * it: what they may do here, and which of the three ways into the conference
 * they have already taken.
 */
async function readConferenceViewer(
	supabase: SupabaseClient,
	conferenceId: string,
	userId: string | null
): Promise<ConferenceViewer> {
	// The two permission helpers are granted to `authenticated` only, so asking
	// them while signed out would fail rather than answer `false`, and a
	// signed-out reader has no seat, no application and no delegation to find
	// either. Nothing is sent at all.
	if (userId === null) {
		return {
			canManage: false,
			isStaff: false,
			seat: null,
			application: null,
			delegation: null
		};
	}

	const [canManage, isStaff, seat, application, delegation] = await Promise.all([
		// "Manage this conference" is offered to an administrator, who may open
		// every page of the management area.
		askConferenceHelper(supabase, 'has_permission', {
			conference_id: conferenceId,
			permission: 'administrator'
		}),
		askConferenceHelper(supabase, 'is_conference_staff', { conference_id: conferenceId }),
		findMySeat(supabase, conferenceId, userId),
		findMyApplication(supabase, conferenceId, userId),
		getMyDelegationFor(supabase, conferenceId, userId)
	]);

	return { canManage, isStaff, seat, application, delegation };
}

/**
 * Everything the public conference page shows, gathered in one call.
 *
 * `null` means there is no conference with that slug, or none this reader may
 * see, and the page turns that into a 404 either way.
 *
 * The conference has to be found first, because everything else is looked up by
 * its id. Once it is there, nothing left needs anything else's answer, so all
 * of it is asked for at once.
 */
export async function getConferencePage(
	supabase: SupabaseClient,
	slug: string,
	userId: string | null
): Promise<ConferencePage | null> {
	const conference = await getConferenceBySlug(supabase, slug);

	if (!conference) {
		return null;
	}

	const [committees, team, viewer] = await Promise.all([
		listCommitteesWithSeatCounts(supabase, conference.id),
		listPublicTeam(supabase, conference.id),
		readConferenceViewer(supabase, conference.id, userId)
	]);

	return { conference, committees, team, viewer };
}

/** What `createConference` needs to save a conference. */
export type NewConference = {
	/** What the visitor filled in on step 1, already checked. */
	details: ConferenceDetails;
	/** The organization that runs the conference. The user must be one of its members. */
	organizationId: string;
	/** The signed-in user, saved as the conference's creator. */
	userId: string;
	/** The moment of creation, which the application window is worked out from. */
	now: Date;
};

/** An empty optional field is saved as "no value" (`null`) rather than as empty text. */
function emptyToNull(text: string): string | null {
	return text === '' ? null : text;
}

/**
 * Save a new conference as a draft and return its slug, which is needed for the
 * link to its page. The database refuses the insert unless `userId` is the
 * signed-in user and a member of the organization.
 */
export async function createConference(
	supabase: SupabaseClient,
	newConference: NewConference
): Promise<string> {
	const { details } = newConference;
	const slug = makeUniqueSlug(details.name);

	// The application window arrives filled in, so the organiser does not have to
	// type one before publishing (`specs/05-pages/organiser/create.md`). The rule
	// lives in `$lib/starting-application-window.ts`.
	const applicationWindow = startingApplicationWindow(
		details.startDate,
		details.timezone,
		newConference.now
	);

	// This is the one function that still names the `conferences` table: the reads
	// above all go through the `conferences_with_organization` view, but a view over
	// a join cannot be written to, and an insert has nothing to write into its two
	// extra columns anyway — the organization is named by `organization_id`.
	//
	// `tagline`, `timezone`, `currency` and `level` are written here because /create
	// asks the organiser for all four (`specs/05-pages/organiser/create.md`).
	// `venue_name`, the ages, the contact details and the rest of the fields are left
	// out, so the database fills in its own defaults for them; the details editor at
	// `/manage/[slug]/details` is where an organiser fills those in later.
	const { error } = await supabase.from('conferences').insert({
		name: details.name,
		slug,
		description: emptyToNull(details.description),
		city: details.city,
		country_code: details.countryCode,
		start_date: details.startDate,
		end_date: details.endDate,
		website_url: emptyToNull(details.websiteUrl),
		tagline: emptyToNull(details.tagline),
		timezone: details.timezone,
		currency: details.currency,
		level: details.level,
		applications_open_at: applicationWindow.opensAt,
		applications_close_at: applicationWindow.closesAt,
		organization_id: newConference.organizationId,
		created_by: newConference.userId,
		// A new conference is a draft, which its organiser publishes from the
		// dashboard once the checklist there is done
		// (`specs/05-pages/organiser/create.md`). Until then it stays out of
		// `/conferences` altogether. `status` replaced the old `is_public` column:
		// 'draft' is the organisers' private workspace, 'published' is visible to
		// visitors.
		status: 'draft'
	});

	if (error) {
		throw new Error(`Could not create conference: ${error.message}`);
	}

	return slug;
}

/**
 * Move one conference to another status: publish it, take it back to a draft,
 * or archive it.
 *
 * Like `createConference` above, this names the `conferences` table rather than
 * the view, for the reason that function's comment gives.
 *
 * The `conferences` update policy asks `edit_conference`, so the database
 * refuses anybody who does not run this conference, however this is called
 * (`specs/02-architecture/permissions.md`). Its column guard
 * (`protect_conferences_columns`) also refuses two moves outright: an archived
 * conference never goes back to a draft, and a published one goes back to a
 * draft only while no seat of it has somebody in it. The dashboard checks the
 * same things first so that it can say why; a refusal here throws.
 */
export async function setConferenceStatus(
	supabase: SupabaseClient,
	conferenceId: string,
	status: ConferenceStatus
): Promise<void> {
	const { error } = await supabase.from('conferences').update({ status }).eq('id', conferenceId);

	if (error) {
		throw new Error(`Could not set this conference to ${status}: ${error.message}`);
	}
}

/**
 * Delete a conference for good.
 *
 * The `conferences` table again rather than the view, as above.
 *
 * Row Level Security allows a delete only while the conference is still a
 * `draft` and has never been public (`first_published_at` is null; see
 * `wasEverPublished` below), so this cannot remove a published or an archived
 * one, nor a draft that was once in the directory, however it is called. The
 * dashboard checks the same things before it offers the button, because it
 * can say "archive it instead" where the database can only refuse.
 */
export async function deleteConference(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<void> {
	const { error } = await supabase.from('conferences').delete().eq('id', conferenceId);

	if (error) {
		throw new Error(`Could not delete this conference: ${error.message}`);
	}
}

/**
 * Whether any seat of this conference has somebody sitting in it.
 *
 * Seats belong to committees and not to conferences, so there is no
 * `conference_id` to filter on and this takes two steps: the conference's
 * committees first, then the seats in them. A conference with no committees has
 * no seats either, so the second step is not sent at all.
 *
 * A lookup that fails answers `true` rather than `false`. Unpublishing is
 * refused on this answer, and a lookup nobody could complete must not be read
 * as permission to take a conference the public can see away from delegates who
 * are already seated at it. That is the opposite of what `hasOrganiserArea` in
 * `./manage.ts` does with a failure, where the worst a wrong answer does is
 * hide a link.
 */
export async function hasSeatedDelegates(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<boolean> {
	const committees = await supabase
		.from('committees')
		.select('id')
		.eq('conference_id', conferenceId)
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<{ id: string }[], { merge: false }>();

	if (committees.error) {
		return true;
	}

	const committeeIds = (committees.data ?? []).map((committee) => committee.id);

	// Nothing to ask about, and an empty list would have to be written as
	// `in.()`, which PostgREST refuses.
	if (committeeIds.length === 0) {
		return false;
	}

	const seats = await supabase
		.from('seats')
		.select('id')
		.in('committee_id', committeeIds)
		// `.not('user_id', 'is', null)` is how PostgREST writes "has somebody in
		// it". One row is enough to answer the question, so that is all it asks for.
		.not('user_id', 'is', null)
		.limit(1)
		.overrideTypes<{ id: string }[], { merge: false }>();

	if (seats.error) {
		return true;
	}

	return (seats.data ?? []).length > 0;
}

/**
 * Whether this conference has ever been public.
 *
 * The database stamps `first_published_at` the first time a conference is
 * published and never clears it, and its delete policy refuses a conference
 * with that stamp however the delete is called: a conference that has been
 * seen, linked to and applied to is unpublished or archived, never deleted.
 * The two "Delete draft" actions ask this first, so that they can say why
 * rather than fail on the database's refusal.
 *
 * A lookup that fails answers `true`, for the reason `hasSeatedDelegates` above
 * gives: a question nobody could answer must not be read as permission to
 * delete.
 */
export async function wasEverPublished(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<boolean> {
	const { data, error } = await supabase
		.from('conferences')
		.select('first_published_at')
		.eq('id', conferenceId)
		.limit(1)
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<{ first_published_at: string | null }[], { merge: false }>();

	if (error) {
		return true;
	}

	const row = (data ?? [])[0];

	return row !== undefined && row.first_published_at !== null;
}

/**
 * A number column the details editor left empty is saved as "no value"
 * (`null`), and anything else as the number the text reads as.
 *
 * Nothing is checked here: `validateConferenceEdit` in `$lib/conference-details`
 * has already refused text that is not a number and numbers outside the range
 * the field allows, and the `conferences` table has `check` constraints of its
 * own underneath that.
 */
function emptyToNumberOrNull(text: string): number | null {
	return text === '' ? null : Number(text);
}

/**
 * Save every column the details editor at `/manage/[slug]/details` can change.
 *
 * Like `createConference` above, this names the `conferences` table rather than
 * the view, for the reason that function's comment gives. An optional field that
 * was left empty is saved as `null` rather than as empty text.
 *
 * Two columns of the table are deliberately missing. `organization_id` is not
 * written because a conference never changes hands: migration 0008's
 * `protect_conferences_columns` trigger refuses an update that moves one, so
 * sending even the organisation it already belongs to would be asking for
 * trouble. `status` is not written because `setConferenceStatus` owns it, and
 * the dashboard's publish checklist decides when it may change.
 *
 * The `conferences` update policy asks `edit_conference`, so the database
 * refuses anybody who does not run this conference, however this is called
 * (`specs/02-architecture/permissions.md`).
 */
export async function updateConference(
	supabase: SupabaseClient,
	conferenceId: string,
	values: ConferenceEditValues
): Promise<void> {
	const { error } = await supabase
		.from('conferences')
		.update({
			name: values.name,
			description: emptyToNull(values.description),
			city: values.city,
			country_code: values.countryCode,
			start_date: values.startDate,
			end_date: values.endDate,
			website_url: emptyToNull(values.websiteUrl),
			tagline: emptyToNull(values.tagline),
			venue_name: emptyToNull(values.venueName),
			venue_address: emptyToNull(values.venueAddress),
			timezone: values.timezone,
			level: values.level,
			language: values.language,
			expected_delegates: emptyToNumberOrNull(values.expectedDelegates),
			min_age: emptyToNumberOrNull(values.minAge),
			max_age: emptyToNumberOrNull(values.maxAge),
			currency: values.currency,
			contact_email: emptyToNull(values.contactEmail),
			instagram_url: emptyToNull(values.instagramUrl),
			contact_phone: emptyToNull(values.contactPhone),
			facebook_url: emptyToNull(values.facebookUrl),
			linkedin_url: emptyToNull(values.linkedinUrl),
			youtube_url: emptyToNull(values.youtubeUrl),
			tiktok_url: emptyToNull(values.tiktokUrl)
		})
		.eq('id', conferenceId);

	if (error) {
		throw new Error(`Could not save the conference details: ${error.message}`);
	}
}

/** Which of a conference's two pictures is meant. */
export type ConferenceImageKind = 'logo' | 'banner';

/**
 * The Storage bucket the pictures live in. It is the same public bucket the
 * avatars are in; see `specs/02-architecture/storage.md`.
 */
const PUBLIC_MEDIA_BUCKET = 'public-media';

/** The column each of the two pictures is remembered in. */
const CONFERENCE_IMAGE_COLUMNS: Record<ConferenceImageKind, string> = {
	logo: 'logo_path',
	banner: 'banner_path'
};

/**
 * The file ending that goes with each picture type the details editor accepts.
 *
 * The type is what the browser sends about the file, and it is what the ending
 * is worked out from, rather than the name the file happened to have on
 * somebody's computer. The form has already refused every type that is not one
 * of these three, the same way the avatar form does.
 */
const CONFERENCE_IMAGE_EXTENSIONS: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp'
};

/**
 * Where a new picture goes: `conferences/<conference id>/<kind>-<uuid>.<ext>`,
 * the path `02-architecture/storage.md` lays down.
 *
 * The server builds it and the browser never does, because the storage policies
 * decide who may write a file by reading the folders of its path. The uuid in
 * the name means a new picture is always a new address, so a browser that
 * cached the old one cannot show it in the new one's place.
 */
function buildConferenceImagePath(
	conferenceId: string,
	kind: ConferenceImageKind,
	file: File
): string {
	const extension = CONFERENCE_IMAGE_EXTENSIONS[file.type];

	if (!extension) {
		throw new Error(`Not a picture the details editor accepts: ${file.type}`);
	}

	return `conferences/${conferenceId}/${kind}-${crypto.randomUUID()}.${extension}`;
}

/** Where one of the two pictures sits at the moment, or `null` when there is none. */
async function readConferenceImagePath(
	supabase: SupabaseClient,
	conferenceId: string,
	kind: ConferenceImageKind
): Promise<string | null> {
	// Both columns are asked for, rather than the one this call is about, because
	// Supabase works out the shape of a row from the text in `select` and cannot
	// do that with a column name that is decided while the code runs.
	const { data, error } = await supabase
		.from('conferences')
		.select('logo_path, banner_path')
		.eq('id', conferenceId)
		.single();

	if (error || !data) {
		throw new Error(`Could not read the conference: ${error?.message ?? 'no row'}`);
	}

	// The client is not told the shape of the database, so what a query answers
	// with is loosely typed. Naming the column here is what says that this
	// function gives back a path or nothing.
	const currentPath: string | null = kind === 'logo' ? data.logo_path : data.banner_path;

	return currentPath;
}

/**
 * Take an object out of the bucket, if there is one to take out.
 *
 * Whatever goes wrong here is deliberately swallowed, the way it is for an
 * avatar. By the time this is called the conference already points at the new
 * picture, or at no picture at all, so an object nobody points at is a smaller
 * problem than an error page telling an organiser their change did not happen
 * when it did. `02-architecture/storage.md` says so in as many words.
 */
async function deleteConferenceImageObject(
	supabase: SupabaseClient,
	path: string | null
): Promise<void> {
	if (path === null) {
		return;
	}

	await supabase.storage.from(PUBLIC_MEDIA_BUCKET).remove([path]);
}

/**
 * Put a picture in the `public-media` bucket, point the conference at it and
 * delete the one it replaces.
 *
 * The order is the one `02-architecture/storage.md` gives, and the same one
 * `uploadAvatar` in `./profiles.ts` follows: the new file is uploaded, then the
 * new path is saved, and the old object is deleted once the row has been
 * written. So a step that fails halfway leaves the conference with the picture
 * it already had rather than pointing at nothing.
 *
 * The upload goes through the signed-in organiser's own client, so the storage
 * policies are a second guard: `may_write_public_media` reads the first two
 * folders of the path and allows `conferences/<id>` only to somebody who can
 * manage that conference.
 */
export async function uploadConferenceImage(
	supabase: SupabaseClient,
	conferenceId: string,
	kind: ConferenceImageKind,
	file: File
): Promise<void> {
	const previousPath = await readConferenceImagePath(supabase, conferenceId, kind);
	const newPath = buildConferenceImagePath(conferenceId, kind, file);

	const { error: uploadError } = await supabase.storage
		.from(PUBLIC_MEDIA_BUCKET)
		.upload(newPath, file);

	if (uploadError) {
		throw new Error(`Could not upload the ${kind}: ${uploadError.message}`);
	}

	// The square brackets are how JavaScript writes a key whose name is worked out
	// rather than typed in: this sets `logo_path` or `banner_path`, whichever of
	// the two this call is about.
	const { error: conferenceError } = await supabase
		.from('conferences')
		.update({ [CONFERENCE_IMAGE_COLUMNS[kind]]: newPath })
		.eq('id', conferenceId);

	if (conferenceError) {
		throw new Error(`Could not save the ${kind}: ${conferenceError.message}`);
	}

	await deleteConferenceImageObject(supabase, previousPath);
}

/**
 * Take one of the two pictures away again: clear the column and delete the
 * object behind it.
 *
 * The same order as `uploadConferenceImage`, the other way round: the column is
 * cleared first and the object deleted second, so no page is ever left pointing
 * at a file that has gone. A conference with no picture of that kind has nothing
 * to clear and nothing to delete, so nothing at all is written.
 */
export async function removeConferenceImage(
	supabase: SupabaseClient,
	conferenceId: string,
	kind: ConferenceImageKind
): Promise<void> {
	const currentPath = await readConferenceImagePath(supabase, conferenceId, kind);

	if (currentPath === null) {
		return;
	}

	const { error } = await supabase
		.from('conferences')
		.update({ [CONFERENCE_IMAGE_COLUMNS[kind]]: null })
		.eq('id', conferenceId);

	if (error) {
		throw new Error(`Could not remove the ${kind}: ${error.message}`);
	}

	await deleteConferenceImageObject(supabase, currentPath);
}

/**
 * The conference's own currency, such as `EUR`. Every fee and every invoice of
 * the conference is in it, which is why `hasInvoices` below can lock it.
 */
export async function readConferenceCurrency(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<string> {
	const { data, error } = await supabase
		.from('conferences')
		.select('currency')
		.eq('id', conferenceId)
		.single();

	if (error || !data) {
		throw new Error(
			`Could not read the currency of this conference: ${error?.message ?? 'no row'}`
		);
	}

	// Loosely typed for the same reason as in `readConferenceImagePath` above.
	const currency: string = data.currency;

	return currency;
}

/**
 * Whether this conference has any invoice at all, which is what locks its
 * currency: money that has already been asked for cannot quietly change
 * denomination (`specs/05-pages/organiser/details.md`).
 *
 * The database's `conference_has_invoices` answers it, because the details
 * are edited with `edit_conference` and the invoices read with `read_invoices`
 * (`docs/roles-and-permissions.md`, section 8): an editor who may not read a
 * single invoice still has to be told the currency is locked.
 *
 * A failure throws rather than answering `false`. The page cannot decide whether
 * the currency is locked without this, and guessing "not locked" would offer an
 * organiser a change the database would then refuse.
 */
export async function hasInvoices(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<boolean> {
	const { data, error } = await supabase.rpc('conference_has_invoices', {
		conference_id: conferenceId
	});

	if (error) {
		throw new Error(`Could not check whether this conference has invoices: ${error.message}`);
	}

	return data === true;
}

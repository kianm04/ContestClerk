/**
 * What the rest of the app asks about delegations: registering one, looking one
 * up by the code a head shares, joining it, and everything the pages under
 * `/delegations/[delegationId]` show the people in it.
 *
 * Three of the calls below are not queries at all but database functions asked
 * for by name — `create_delegation`, `preview_delegation` and `join_delegation`
 * — because each does something a plain insert or select cannot. Registering a
 * group is two rows that have to appear together. The preview hands somebody
 * holding a join code a fixed handful of facts about a delegation they may not
 * read. Joining writes a `delegation_members` row, and that table has no insert
 * policy at all, because the code is the permission and a policy would have to
 * let anybody read the table to check it.
 *
 * Files under `$lib/server` only ever run on the server, so this is where the
 * database is queried. Every function takes the Supabase client as its first
 * argument. Pages pass in `locals.supabase`, the client that knows who is
 * signed in, so the database's Row Level Security rules (see
 * `specs/02-architecture/permissions.md`) decide what each caller may read and
 * write.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { readPrivateDetails, type PrivateDetailsRow } from './private-details';
// The rows of the list at `/applications` live with the list they are part of,
// in `$lib/applications.ts`, which is also where `mergeIntoApplicationList` puts
// the two kinds of row together.
import type {
	ApplicationListConference,
	ApplicationListSeat,
	MyDelegationListItem
} from '$lib/applications';
import {
	DELEGATIONS_PAGE_SIZE,
	delegationInvoiceSummary,
	delegationProgress,
	EMPTY_DELEGATION_STATUS_COUNTS,
	sortDelegationMembers
} from '$lib/delegations';
import { committeeHeading } from '$lib/committees';
import type { ApplicationOpenMode, ConferenceStatus, LocationMode } from '$lib/conferences';
// The shapes the organiser's review page reads these rows into. They live with
// the wording of that page, in `$lib/delegation-review.ts`, because the page is
// the only thing that asks for them.
import type { DelegationInvoiceLine, OrganiserDelegationDetail } from '$lib/delegation-review';
import type {
	AssignSeatRefusal,
	Delegation,
	DelegationConference,
	DelegationInvoiceStatus,
	DelegationListQuery,
	DelegationListSort,
	DelegationMember,
	DelegationMemberDetails,
	DelegationMemberSeat,
	DelegationPreview,
	DelegationRole,
	DelegationSeat,
	DelegationSeatCommittee,
	DelegationSeatGroup,
	DelegationSeatHolder,
	ExperienceLevel,
	JoinRefusalKind,
	DelegationSeatCounts,
	DelegationStatus,
	DelegationStatusCounts,
	DelegationSummary,
	ListedDelegationStatus,
	OrganiserDelegationRow,
	MyDelegationSeat,
	RouteIntoConference,
	UnassignSeatRefusal,
	UnseatedMember
} from '$lib/delegations';
// The one rule for making search box text safe inside a Supabase `.or(...)`,
// shared with the conference directory and the organiser's applications table.
import { removeOrphanedDocumentFiles } from './orphaned-document-files';
import { toSafeSearchText } from './search-text';

/**
 * The delegation columns its own pages ask for.
 *
 * `internal_note` is deliberately not among them, the same omission
 * `./applications.ts` makes for the same reason: a policy decides rows and not
 * columns, so a head's own row carries what the organisers wrote to each other,
 * and nothing here asks for it.
 */
const DELEGATION_COLUMNS =
	'id, conference_id, name, institution_name, country_code, status, requested_seats, note, join_code, submitted_at, decided_at, decision_note';

/** The conference columns a delegation page shows, brought along with the delegation. */
const DELEGATION_CONFERENCE_COLUMNS =
	'id, slug, name, start_date, end_date, timezone, status, accepts_delegations, application_open_mode, applications_open_at, applications_close_at';

/** One `delegations` row, under the database's own column names. */
type DelegationRow = {
	id: string;
	conference_id: string;
	name: string;
	institution_name: string;
	country_code: string | null;
	status: DelegationStatus;
	requested_seats: number;
	note: string | null;
	join_code: string;
	/** ISO timestamps. `submitted_at` is `null` while the delegation is a draft. */
	submitted_at: string | null;
	decided_at: string | null;
	/** What the organisers wrote to the head, or `null` when they wrote nothing. */
	decision_note: string | null;
};

/** One `conferences` row as a delegation page reads it, under the database's own names. */
type DelegationConferenceRow = {
	id: string;
	slug: string;
	name: string;
	/** `YYYY-MM-DD`. */
	start_date: string;
	end_date: string;
	timezone: string;
	status: ConferenceStatus;
	accepts_delegations: boolean;
	application_open_mode: ApplicationOpenMode;
	/** ISO timestamps. `null` means no bound on that side of the window. */
	applications_open_at: string | null;
	applications_close_at: string | null;
};

/** A delegation with the conference it belongs to brought along. */
type DelegationWithConferenceRow = DelegationRow & {
	/**
	 * One object rather than a list, because a delegation belongs to exactly one
	 * conference. `conferences!inner(...)` in the select asks for it that way
	 * round and, more importantly, makes the conference part of the match: a
	 * delegation whose conference could not be read comes back as no delegation
	 * at all rather than as one with nothing to name it.
	 */
	conferences: DelegationConferenceRow;
};

/** Turn a database row (snake_case names) into the shape the pages use. */
function toDelegation(row: DelegationRow): Delegation {
	return {
		id: row.id,
		conferenceId: row.conference_id,
		name: row.name,
		institutionName: row.institution_name,
		countryCode: row.country_code,
		status: row.status,
		requestedSeats: row.requested_seats,
		note: row.note,
		joinCode: row.join_code,
		submittedAt: row.submitted_at,
		decidedAt: row.decided_at,
		decisionNote: row.decision_note
	};
}

/** Turn the conference the delegation carries into the shape the pages use. */
function toDelegationConference(row: DelegationConferenceRow): DelegationConference {
	return {
		id: row.id,
		slug: row.slug,
		name: row.name,
		startDate: row.start_date,
		endDate: row.end_date,
		timezone: row.timezone,
		status: row.status,
		acceptsDelegations: row.accepts_delegations,
		applicationOpenMode: row.application_open_mode,
		applicationsOpenAt: row.applications_open_at,
		applicationsCloseAt: row.applications_close_at
	};
}

/** One row of the membership lookup: the delegation the membership is in. */
type MyDelegationRow = {
	/**
	 * One object rather than a list, because a membership belongs to one
	 * delegation. `delegations!inner(...)` in the select asks for it that way
	 * round and, more importantly, makes the delegation part of the match rather
	 * than an extra: without the `!inner` the filter on
	 * `delegations.conference_id` would not narrow which memberships come back.
	 * It is the same `!inner` `findMySeat` in `./conferences.ts` explains.
	 */
	delegations: { id: string; name: string; conference_id: string };
};

/**
 * The delegation this person belongs to at this conference, or `null` when they
 * belong to none.
 *
 * Changed from the `getMyDelegationNameFor` T24 opened this file with: it now
 * answers the id as well as the name, because `/delegations/[delegationId]`
 * exists and the sentence the apply panel writes has become a link.
 *
 * Nobody is in two delegations at one conference: `check_one_route_per_conference`
 * refuses the second, which is why one row is asked for rather than a list.
 */
export async function getMyDelegationFor(
	supabase: SupabaseClient,
	conferenceId: string,
	userId: string
): Promise<{ id: string; name: string } | null> {
	const { data, error } = await supabase
		.from('delegation_members')
		.select('delegations!inner(id, name, conference_id)')
		.eq('user_id', userId)
		.eq('delegations.conference_id', conferenceId)
		// `maybeSingle` returns one row, or `null` when nothing matches, instead of a list.
		.maybeSingle()
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<MyDelegationRow, { merge: false }>();

	// Being in no delegation here is the ordinary case rather than a fault: the
	// `delegations` select policy is "member", so somebody who is in none reads
	// none and is turned away rather than answered. A refused or failed query
	// therefore means "no delegation" instead of an error page, exactly as
	// `findMySeat` in `./conferences.ts` treats a seat list it may not read.
	if (error || !data) {
		return null;
	}

	return { id: data.delegations.id, name: data.delegations.name };
}

/** One `conferences` row as the list at `/applications` reads it, under the database's own names. */
type MembershipConferenceRow = {
	id: string;
	slug: string;
	name: string;
	logo_path: string | null;
	/** The wide banner's path in the `public-media` bucket, or `null` when there is none. */
	banner_path: string | null;
	/** `YYYY-MM-DD`. */
	start_date: string;
	end_date: string;
	timezone: string;
	status: ConferenceStatus;
	/** An ISO timestamp, or `null` when the conference set no closing time. */
	applications_close_at: string | null;
	/** Where it is held: `null`s for an online conference or one with no place yet. */
	city: string | null;
	venue_name: string | null;
	location_mode: LocationMode;
	/** The organisation running the conference, or `null` when it could not be read. */
	organizations: { name: string } | null;
};

/** One row of the membership list: the delegation, with its conference brought along. */
type MyDelegationMembershipRow = {
	/**
	 * Two `!inner`s, one object each. A membership belongs to exactly one
	 * delegation and a delegation to exactly one conference, so each embed
	 * answers with one object rather than with a list. Making each one part of
	 * the match rather than an extra is what matters: a membership whose
	 * delegation or whose conference could not be read drops out of the answer
	 * instead of arriving with nothing to name it.
	 *
	 * Neither is likely to be refused. The reader is a member, and the
	 * `delegations` select policy is "member; org.", so their own delegations are
	 * theirs to read. The `conferences` policy shows a signed-in reader
	 * `published` and `archived` conferences, so a conference the organisers have
	 * put back to `draft` drops off the list, as it does in the applications half
	 * in `./applications.ts`. It does not drop off quietly:
	 * `./unpublished-conference-applications.ts` counts the rows missing this way
	 * and `/applications` says how many there are (T112).
	 */
	delegations: {
		id: string;
		name: string;
		status: DelegationStatus;
		conferences: MembershipConferenceRow;
	};
};

/**
 * Turn the conference a membership carries into the shape the list uses.
 *
 * `./applications.ts` has the same mapper over its own row type for the other
 * half of the list. The two are kept apart rather than shared, so that neither
 * module reaches into the other's queries.
 */
function toListConference(row: MembershipConferenceRow): ApplicationListConference {
	return {
		id: row.id,
		slug: row.slug,
		name: row.name,
		// `null` when Row Level Security withheld the organisation itself.
		organizationName: row.organizations?.name ?? null,
		logoPath: row.logo_path,
		bannerPath: row.banner_path,
		startDate: row.start_date,
		endDate: row.end_date,
		timezone: row.timezone,
		// The list only ever asks whether the conference is over and done with, so
		// the status becomes the one question it answers rather than travelling on.
		isArchived: row.status === 'archived',
		applicationsCloseAt: row.applications_close_at,
		city: row.city,
		venueName: row.venue_name,
		locationMode: row.location_mode
	};
}

/** One row of the seat lookup: the seat, with the committee it is in brought along. */
type MySeatByConferenceRow = {
	name: string;
	/**
	 * An ISO two-letter country code, or `null` for a seat that is not a country, such as "Press".
	 */
	country_code: string | null;
	/**
	 * One object rather than a list, because a seat belongs to one committee.
	 * `committees!inner(...)` asks for it that way round, the way `findMySeat` in
	 * `./conferences.ts` does, and `conference_id` is among its columns because
	 * that is the only place the seat's conference is written down.
	 */
	committees: { conference_id: string; name: string; abbreviation: string | null };
};

/**
 * How many rows one query of the reader's own list asks for, in both halves
 * below: the delegations they belong to and the seats they hold.
 *
 * Nobody joins five hundred delegations, so in practice the first window is
 * the whole answer and the second comes back empty. It is a window all the
 * same because `max_rows` in `supabase/config.toml` would otherwise cut the
 * answer off at a thousand without saying so, and the page would draw a short
 * list as if it were the whole one.
 */
const MY_LIST_READ_BATCH_SIZE = 500;

/**
 * Every seat this person holds, with its committee along, however many there are.
 *
 * PostgREST answers with at most `max_rows` rows whatever is asked of it, so
 * this asks for a window at a time and moves it along by the rows that really
 * came back until one comes back empty, the way `readConferenceInvoiceRows` in
 * `./invoices.ts` does. Ordering by the seat's id is what makes the windows
 * line up; the order means nothing else, because the answer becomes a map.
 */
async function readMySeatRows(
	supabase: SupabaseClient,
	userId: string
): Promise<MySeatByConferenceRow[]> {
	const seats: MySeatByConferenceRow[] = [];
	let firstIndex = 0;

	while (true) {
		const { data, error } = await supabase
			.from('seats')
			.select('name, country_code, committees!inner(conference_id, name, abbreviation)')
			.eq('user_id', userId)
			.order('id', { ascending: true })
			.range(firstIndex, firstIndex + MY_LIST_READ_BATCH_SIZE - 1)
			.overrideTypes<MySeatByConferenceRow[], { merge: false }>();

		// The window starts past the last row, which is the end of the list.
		if (error?.code === PAGE_OUT_OF_RANGE_CODE) {
			return seats;
		}

		if (error) {
			throw new Error(`Could not read your seats: ${error.message}`);
		}

		const batch: MySeatByConferenceRow[] = data ?? [];

		if (batch.length === 0) {
			return seats;
		}

		seats.push(...batch);
		firstIndex = firstIndex + batch.length;
	}
}

/**
 * The seat this person holds at each conference, by conference id.
 *
 * A person holds at most one seat per conference, so one seat per key is all
 * there ever is. `seats` carries no `conference_id` of its own, so the seat is
 * found through the committee it is in.
 *
 * A failed query raises rather than answering with an empty map: a seat that
 * exists but could not be read would leave an accepted delegation row saying
 * "Seat pending", which is worse than an error page because it reads as a fact.
 */
async function readMySeatsByConference(
	supabase: SupabaseClient,
	userId: string
): Promise<Map<string, ApplicationListSeat>> {
	const rows = await readMySeatRows(supabase, userId);
	const seats = new Map<string, ApplicationListSeat>();

	for (const row of rows) {
		seats.set(row.committees.conference_id, {
			seatName: row.name,
			committeeHeading: committeeHeading(row.committees),
			countryCode: row.country_code
		});
	}

	return seats;
}

/**
 * Every delegation this person belongs to, with its conference along, however
 * many there are.
 *
 * The same window-at-a-time reading as `readMySeatRows` above, for the same
 * reason. A person is in any one delegation once, so ordering by the
 * delegation's id gives every row a place of its own and the windows line up.
 */
async function readMyMembershipRows(
	supabase: SupabaseClient,
	userId: string
): Promise<MyDelegationMembershipRow[]> {
	const memberships: MyDelegationMembershipRow[] = [];
	let firstIndex = 0;

	while (true) {
		const { data, error } = await supabase
			.from('delegation_members')
			.select(
				'delegations!inner(id, name, status, conferences!inner(id, slug, name, logo_path, banner_path, start_date, end_date, timezone, status, applications_close_at, city, venue_name, location_mode, organizations(name)))'
			)
			.eq('user_id', userId)
			.order('delegation_id', { ascending: true })
			.range(firstIndex, firstIndex + MY_LIST_READ_BATCH_SIZE - 1)
			// Replaces Supabase's guess at the row's shape with ours. It has to come last.
			.overrideTypes<MyDelegationMembershipRow[], { merge: false }>();

		// The window starts past the last row, which is the end of the list.
		if (error?.code === PAGE_OUT_OF_RANGE_CODE) {
			return memberships;
		}

		if (error) {
			throw new Error(`Could not list your delegations: ${error.message}`);
		}

		const batch: MyDelegationMembershipRow[] = data ?? [];

		if (batch.length === 0) {
			return memberships;
		}

		memberships.push(...batch);
		firstIndex = firstIndex + batch.length;
	}
}

/**
 * Every delegation this person belongs to, for the list at `/applications`.
 *
 * Unlike `getMyDelegationFor` above, a failed query here raises rather than
 * answering "none": `05-pages/delegate/applications.md` says query errors
 * throw, and half a list shown as a whole list would be worse than an error
 * page, because nothing on the page would say that anything is missing. For
 * the same reason both of its queries read in windows, so a list longer than
 * `max_rows` in `supabase/config.toml` arrives whole rather than quietly short.
 */
export async function listMyDelegationMemberships(
	supabase: SupabaseClient,
	userId: string
): Promise<MyDelegationListItem[]> {
	const rows = await readMyMembershipRows(supabase, userId);

	// This person is in no delegation at all, so there is no row for a seat to
	// sit on and the second query is not sent.
	if (rows.length === 0) {
		return [];
	}

	const seats = await readMySeatsByConference(supabase, userId);

	return rows.map((row) => ({
		id: row.delegations.id,
		name: row.delegations.name,
		status: row.delegations.status,
		conference: toListConference(row.delegations.conferences),
		seat: seats.get(row.delegations.conferences.id) ?? null
	}));
}

/**
 * The id alone of this person's application at this conference, or `null` when
 * they have none.
 *
 * `getMyApplicationFor` in `./applications.ts` answers the whole application
 * and throws when its query fails, because the apply form needs it to. The one
 * question here is "is this road already taken?", so it asks for the id by
 * itself and treats a refusal as "no application", the way the delegation
 * lookup above does.
 */
async function findMyApplicationIdFor(
	supabase: SupabaseClient,
	conferenceId: string,
	userId: string
): Promise<string | null> {
	const { data, error } = await supabase
		.from('applications')
		.select('id')
		.eq('conference_id', conferenceId)
		.eq('user_id', userId)
		.maybeSingle()
		.overrideTypes<{ id: string }, { merge: false }>();

	if (error || !data) {
		return null;
	}

	return data.id;
}

/**
 * How this person is already attached to this conference — an application of
 * their own, or a delegation they are in — or `null` when they are attached
 * neither way.
 *
 * `check_one_route_per_conference` makes it impossible to be both, so the two
 * lookups can never disagree, and neither needs the other's answer: both are
 * sent at once and the page waits for the slower of them rather than for the
 * sum.
 */
export async function findMyRouteIntoConference(
	supabase: SupabaseClient,
	conferenceId: string,
	userId: string
): Promise<RouteIntoConference | null> {
	const [applicationId, delegation] = await Promise.all([
		findMyApplicationIdFor(supabase, conferenceId, userId),
		getMyDelegationFor(supabase, conferenceId, userId)
	]);

	if (applicationId !== null) {
		return { kind: 'application', applicationId };
	}

	if (delegation !== null) {
		return { kind: 'delegation', delegationId: delegation.id, delegationName: delegation.name };
	}

	return null;
}

/** What the register a delegation form writes. */
export type CreateDelegationInput = {
	conferenceId: string;
	name: string;
	institutionName: string;
	countryCode: string;
	requestedSeats: number;
	/** `null` when the head left the note box empty. */
	note: string | null;
};

/**
 * Register one delegation through the `create_delegation` function, and answer
 * with the id of the row it wrote.
 *
 * The function writes the delegation and its first head together, in one
 * transaction, and mints the join code itself. It asks the same questions
 * `canCreateDelegation` in `$lib/delegations.ts` asks on the page — published,
 * accepting delegations, inside its window, and no other road into this
 * conference already taken — so a window that closed while somebody was typing
 * is refused here even though the page let them press the button.
 */
export async function createDelegation(
	supabase: SupabaseClient,
	input: CreateDelegationInput
): Promise<string> {
	const { data, error } = await supabase.rpc('create_delegation', {
		conference_id: input.conferenceId,
		name: input.name,
		institution_name: input.institutionName,
		country_code: input.countryCode,
		requested_seats: input.requestedSeats,
		note: input.note
	});

	if (error) {
		throw new Error(`Could not register the delegation: ${error.message}`);
	}

	const delegationId: string = data;

	return delegationId;
}

/**
 * A join code as the database stores it: the characters with no spaces between
 * them, in upper case.
 *
 * `create_delegation` mints codes in upper case and the two functions below
 * compare them exactly, so `05-pages/delegation/join.md`'s "codes are matched
 * case-insensitively" and "lower-case or spaced codes are normalised" are made
 * true by tidying what arrives rather than by loosening the comparison. It
 * happens here, in the one place both the preview and the join go through, so a
 * code somebody typed by hand works whichever of the two it reaches first.
 */
function normalizeJoinCode(code: string): string {
	return code.replace(/\s/g, '').toUpperCase();
}

/** One row of `preview_delegation`'s answer, under the database's own column names. */
type DelegationPreviewRow = {
	id: string;
	name: string;
	institution_name: string;
	country_code: string | null;
	status: DelegationStatus;
	conference_name: string;
	conference_slug: string;
	conference_status: ConferenceStatus;
	/** `YYYY-MM-DD`. */
	conference_start_date: string;
	conference_end_date: string;
	conference_city: string;
	conference_country_code: string;
	/** The full names of the heads, already sorted by the function. */
	head_names: string[];
	member_count: number;
};

/** Turn one preview row into the shape `/join/[joinCode]` draws. */
function toDelegationPreview(row: DelegationPreviewRow): DelegationPreview {
	return {
		id: row.id,
		name: row.name,
		institutionName: row.institution_name,
		countryCode: row.country_code,
		status: row.status,
		conferenceName: row.conference_name,
		conferenceSlug: row.conference_slug,
		conferenceStatus: row.conference_status,
		conferenceStartDate: row.conference_start_date,
		conferenceEndDate: row.conference_end_date,
		conferenceCity: row.conference_city,
		conferenceCountryCode: row.conference_country_code,
		headNames: row.head_names,
		memberCount: row.member_count
	};
}

/**
 * The words `preview_delegation` and `join_delegation` raise once somebody has
 * sent ten wrong codes in the last hour, to either of them (migration
 * 20261022161000). Until the hour has passed both refuse every code, the right
 * one too, so a guesser learns nothing from the answer.
 */
const TOO_MANY_WRONG_CODES_RAISED = 'Too many wrong codes';

/**
 * What `/join/[joinCode]` shows somebody holding a link, `null` for a code
 * nobody has, or `'too_many_wrong_codes'` while this person is locked out for
 * sending too many codes nobody has.
 *
 * It goes through `preview_delegation` rather than reading `delegations`,
 * because the person is not a member yet and the select policy gives them
 * nothing. Holding the code is what earns them this much and no more.
 *
 * The conference is named by its slug here and not by its id. The function
 * hands out the facts the card prints and nothing that would let somebody walk
 * from a join code to the rest of a conference's rows, so a page that needs the
 * id asks `findConferenceIdBySlug` below for it.
 */
export async function getDelegationByJoinCode(
	supabase: SupabaseClient,
	code: string
): Promise<DelegationPreview | null | 'too_many_wrong_codes'> {
	const { data, error } = await supabase.rpc('preview_delegation', {
		code: normalizeJoinCode(code)
	});

	// The lock-out is something the visitor did, so it is an answer for the
	// page to put in words rather than a fault.
	if (error?.message.includes(TOO_MANY_WRONG_CODES_RAISED)) {
		return 'too_many_wrong_codes';
	}

	// A code nobody has is an empty answer rather than a failure, so a failure
	// here is a real fault and the page should say so rather than quietly
	// telling the visitor their link is wrong.
	if (error) {
		throw new Error(`Could not look up that join code: ${error.message}`);
	}

	// `preview_delegation` is a "returns table" function, so it answers with a
	// list of rows and not with one object. An unknown code gives an empty list.
	const rows: DelegationPreviewRow[] = data ?? [];

	if (rows.length === 0) {
		return null;
	}

	return toDelegationPreview(rows[0]);
}

/**
 * Which row of `05-pages/delegation/join.md`'s refusal table the database meant.
 *
 * `join_delegation` and the `check_one_route_per_conference` trigger both
 * `raise exception` with plain text rather than with an SQLSTATE code of their
 * own, so the only thing there is to match on is the message, and `contains`
 * holds the part of it that will not change if the wording around it does.
 *
 * What is matched here is the *reason*, never the sentence. The sentences
 * belong to `joinRefusalSentence` in `$lib/delegations.ts`, because four of the
 * seven name the conference or the other delegation and the database knows
 * neither of those names. The first row is the lock-out after ten wrong codes
 * in an hour; the rest are the moments the page's own `canJoinDelegation`
 * check and the database's differ, because they happen at two different
 * times. A code nobody has is not in the table, because `join_delegation`
 * answers it with null rather than raising (see `joinDelegation` below).
 */
const JOIN_REFUSALS: {
	contains: string;
	kind: JoinRefusalKind | 'too_many_wrong_codes';
}[] = [
	{ contains: TOO_MANY_WRONG_CODES_RAISED, kind: 'too_many_wrong_codes' },
	{ contains: 'team cannot join', kind: 'conference_staff' },
	{ contains: 'was not accepted', kind: 'rejected' },
	{ contains: 'withdrew its request', kind: 'withdrawn' },
	{ contains: 'has already taken place', kind: 'conference_over' },
	{ contains: 'already in this delegation', kind: 'already_in_this' },
	{ contains: 'already have an application for this conference', kind: 'already_applied' },
	{ contains: 'already part of a delegation for this conference', kind: 'in_other_delegation' }
];

/** What `joinDelegation` answers with when it would not let this person in. */
export type JoinDelegationRefusal =
	| { ok: false; kind: JoinRefusalKind | 'unknown_code' | 'too_many_wrong_codes' }
	/** A refusal nothing in the table above recognises, which is a fault of ours. */
	| { ok: false; kind: 'unknown' };

/** Work out which refusal the database raised, from the words it raised it with. */
function joinRefusalKind(
	databaseMessage: string
): JoinRefusalKind | 'too_many_wrong_codes' | 'unknown' {
	for (const refusal of JOIN_REFUSALS) {
		if (databaseMessage.includes(refusal.contains)) {
			return refusal.kind;
		}
	}

	// `join.md` asks for these to be logged: a refusal nothing here recognises is
	// a fault of ours rather than something the visitor did wrong.
	console.error(`join_delegation refused with a message nothing here knows: ${databaseMessage}`);

	return 'unknown';
}

/**
 * Join the delegation this code belongs to, through the `join_delegation`
 * function.
 *
 * A refusal is an answer rather than a thrown error, because every one of them
 * is something to tell the visitor in words on the page they are already on.
 * What comes back is which row of the refusal table it was, not a sentence; the
 * page puts the names into the sentence, because it is the half that knows them.
 * The database is the real guard here, which is what `join.md`'s third
 * acceptance criterion asks for.
 */
export async function joinDelegation(
	supabase: SupabaseClient,
	code: string
): Promise<{ ok: true; delegationId: string } | JoinDelegationRefusal> {
	const { data, error } = await supabase.rpc('join_delegation', {
		code: normalizeJoinCode(code)
	});

	if (error) {
		return { ok: false, kind: joinRefusalKind(error.message) };
	}

	// A code nobody has comes back as null rather than as an exception, because
	// an exception would roll back the wrong code the function writes down and
	// the lock-out could never fill. That can only happen here if the
	// delegation went away between the page being drawn and the button being
	// pressed, which a head throwing their own draft away does.
	if (data === null) {
		return { ok: false, kind: 'unknown_code' };
	}

	const delegationId: string = data;

	return { ok: true, delegationId };
}

/** The delegation and its conference, or `null` when this reader may not have it. */
async function findDelegationWithConference(
	supabase: SupabaseClient,
	delegationId: string
): Promise<DelegationWithConferenceRow | null> {
	const { data, error } = await supabase
		.from('delegations')
		.select(`${DELEGATION_COLUMNS}, conferences!inner(${DELEGATION_CONFERENCE_COLUMNS})`)
		.eq('id', delegationId)
		.maybeSingle()
		.overrideTypes<DelegationWithConferenceRow, { merge: false }>();

	// The `delegations` select policy is "member; org.", so a stranger is turned
	// away rather than answered, and that is the ordinary case for a page anybody
	// can type the address of. It becomes the same 404 "no such delegation" that
	// a wrong id gives, which is what `requireDelegationMember` in `./access.ts`
	// turns both into.
	if (error || !data) {
		return null;
	}

	return data;
}

/** The caller's own role in this delegation, or `null` when they are in none. */
async function findMyRoleInDelegation(
	supabase: SupabaseClient,
	delegationId: string,
	userId: string
): Promise<DelegationRole | null> {
	const { data, error } = await supabase
		.from('delegation_members')
		.select('role')
		.eq('delegation_id', delegationId)
		.eq('user_id', userId)
		.maybeSingle()
		.overrideTypes<{ role: DelegationRole }, { merge: false }>();

	if (error || !data) {
		return null;
	}

	return data.role;
}

/**
 * The delegation, its conference and the caller's role in it, or `null` when
 * they are in no such delegation.
 *
 * Both halves have to be there. The delegation alone is not enough, because the
 * select policy also hands one to the organisers of its conference, and
 * `05-pages/delegation/dashboard.md` sends everybody who is not a member of
 * this delegation the 404 a stranger gets — organisers read a delegation on
 * their own review page instead.
 *
 * Neither lookup needs the other's answer, so both are sent at once.
 */
export async function getDelegationForMember(
	supabase: SupabaseClient,
	delegationId: string,
	userId: string
): Promise<{
	delegation: Delegation;
	conference: DelegationConference;
	myRole: DelegationRole;
} | null> {
	const [row, myRole] = await Promise.all([
		findDelegationWithConference(supabase, delegationId),
		findMyRoleInDelegation(supabase, delegationId, userId)
	]);

	if (row === null || myRole === null) {
		return null;
	}

	return {
		delegation: toDelegation(row),
		conference: toDelegationConference(row.conferences),
		myRole
	};
}

/**
 * How many people are in this delegation. The heads count: a delegation of one
 * head has one member, which is why `dashboard.md` can say a group of one may
 * be submitted.
 */
export async function countDelegationMembers(
	supabase: SupabaseClient,
	delegationId: string
): Promise<number> {
	// `count: 'exact'` asks for the number of matching rows, and `head: true`
	// asks for that number without any of the rows themselves.
	const { count, error } = await supabase
		.from('delegation_members')
		.select('user_id', { count: 'exact', head: true })
		.eq('delegation_id', delegationId);

	if (error) {
		throw new Error(`Could not count the members of the delegation: ${error.message}`);
	}

	return count ?? 0;
}

/**
 * The seats the organisers reserved for this delegation, and how many of them
 * the head has put somebody in.
 *
 * Both numbers come out of the same rows, so this is one query with the
 * counting done here rather than two `count: 'exact'` queries that would ask
 * the database the same question twice. The `seats` select policy gives the
 * whole row to the participants of the conference, and a delegation member is
 * one, so `user_id` is there to be looked at.
 */
export async function countDelegationSeats(
	supabase: SupabaseClient,
	delegationId: string
): Promise<DelegationSeatCounts> {
	const { data, error } = await supabase
		.from('seats')
		.select('user_id')
		.eq('delegation_id', delegationId)
		.overrideTypes<{ user_id: string | null }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not count the seats of the delegation: ${error.message}`);
	}

	const rows: { user_id: string | null }[] = data ?? [];
	const filled = rows.filter((row) => row.user_id !== null);

	return { allocated: rows.length, assigned: filled.length };
}

/** One row of the seat lookup: the seat itself, with the committee it is in brought along. */
type MyDelegationSeatRow = {
	name: string;
	/** Nullable: a seat that is a role rather than a country has no flag to draw. */
	country_code: string | null;
	/**
	 * One object rather than a list, because a seat belongs to one committee, the
	 * way `findSeatForApplication` in `./applications.ts` reads it.
	 */
	committees: { name: string; slug: string };
};

/**
 * The caller's own seat in this delegation, or `null` when their head has not
 * given them one.
 *
 * Having no seat yet is the ordinary case — nobody has one until the organisers
 * allocate and the head assigns — so a refused query answers `null` as well,
 * and the member view says "No seat assigned yet." either way.
 */
export async function findMyDelegationSeat(
	supabase: SupabaseClient,
	delegationId: string,
	userId: string
): Promise<MyDelegationSeat | null> {
	const { data, error } = await supabase
		.from('seats')
		.select('name, country_code, committees!inner(name, slug)')
		.eq('delegation_id', delegationId)
		.eq('user_id', userId)
		.maybeSingle()
		.overrideTypes<MyDelegationSeatRow, { merge: false }>();

	if (error || !data) {
		return null;
	}

	return {
		seatName: data.name,
		countryCode: data.country_code,
		committeeName: data.committees.name,
		committeeSlug: data.committees.slug
	};
}

/**
 * Save the five columns a head may write.
 *
 * Nothing else is sent. `guard_delegation_update` refuses a head who touches
 * the join code, the conference, or any of the columns the organisers decide
 * with, and it refuses the whole update rather than ignoring the extra field,
 * so a page that sent one would simply be turned away.
 */
export async function updateDelegationDetails(
	supabase: SupabaseClient,
	delegationId: string,
	input: Omit<CreateDelegationInput, 'conferenceId'>
): Promise<void> {
	const { error } = await supabase
		.from('delegations')
		.update({
			name: input.name,
			institution_name: input.institutionName,
			country_code: input.countryCode,
			requested_seats: input.requestedSeats,
			note: input.note
		})
		.eq('id', delegationId);

	if (error) {
		throw new Error(`Could not save the delegation: ${error.message}`);
	}
}

/**
 * Move a delegation to `submitted` or to `withdrawn`, the two moves a head may
 * make.
 *
 * `submitted_at` is deliberately absent. `guard_delegation_update` refuses a
 * change to it from a browser and stamps it itself whenever the status moves,
 * the same rule `upsertApplication` in `./applications.ts` explains.
 */
export async function setDelegationStatus(
	supabase: SupabaseClient,
	delegationId: string,
	status: 'submitted' | 'withdrawn'
): Promise<void> {
	const { error } = await supabase.from('delegations').update({ status }).eq('id', delegationId);

	if (error) {
		throw new Error(`Could not change the status of the delegation: ${error.message}`);
	}
}

/**
 * The id of the conference with this slug, or `null` when there is no such
 * conference, or none this reader may open.
 *
 * `/join/[joinCode]` needs it and has nothing else to go on:
 * `preview_delegation` names the conference by its slug, and
 * `findMyRouteIntoConference` above asks about it by its id. Only the id is
 * read, so this is a much smaller question than `getConferenceBySlug` in
 * `./conferences.ts` and does not build a whole `Conference` to throw most of
 * it away.
 */
export async function findConferenceIdBySlug(
	supabase: SupabaseClient,
	slug: string
): Promise<string | null> {
	const { data, error } = await supabase
		.from('conferences')
		.select('id')
		.eq('slug', slug)
		.maybeSingle()
		.overrideTypes<{ id: string }, { merge: false }>();

	if (error || !data) {
		return null;
	}

	return data.id;
}

// -----------------------------------------------------------------------------
// The organiser's side
// -----------------------------------------------------------------------------
// Everything below belongs to `/manage/[slug]/delegations`, where the people
// running the conference read every group that wants to attend at once, rather
// than to the head's and the member's own pages above.
//
// One rule runs through all of it. The `delegations` select policy is
// "member; org.", and a policy decides rows and not columns, so an organiser
// really can read a group's unsent draft. Nothing here leaves keeping drafts out
// to Row Level Security. The table always shows one of the four listed statuses,
// so filtering on `query.status` already does that job as well, and the summary,
// which counts all four at once, says `.neq('status', 'draft')` in so many words.

/** What the table calls a head whose account has gone since. */
const DELETED_ACCOUNT_NAME = 'Deleted account';

/** The error code Postgres sends when an id is not a uuid at all. */
const INVALID_ID_CODE = '22P02';

/** The error code Supabase sends when a page number is past the last page of results. */
const PAGE_OUT_OF_RANGE_CODE = 'PGRST103';

/**
 * The view the organiser's table reads: the delegation's own columns with its
 * heads' names beside them. `supabase/migrations/20260925120000_delegation_list_views.sql`
 * says why it exists, and `02-architecture/data-model.md` lists it under "Views".
 */
const DELEGATIONS_WITH_HEADS = 'delegations_with_heads';

/**
 * The view the tabs and the sentence under the heading read: how many
 * delegations each status has at a conference, and how many seats they asked
 * for between them. It comes from the same migration as the one above.
 */
const DELEGATION_STATUS_TOTALS = 'delegation_status_totals';

/**
 * The columns the organiser's table reads, with the three lists a row counts
 * brought along with them.
 *
 * `delegation_members`, `seats` and `invoices` can all be embedded like this,
 * although the view is not a table, because PostgREST sees that the view's `id`
 * is `delegations.id` and each of those tables has a `delegation_id` foreign
 * key naming it. Only `user_id` of a member is asked for: the table shows how
 * many members there are, and the heads' names are the view's own `head_names`.
 */
const ORGANISER_DELEGATION_COLUMNS =
	'id, name, institution_name, country_code, status, requested_seats, submitted_at, head_names, delegation_members(user_id), seats(user_id), invoices(status)';

/** One row of the view as the organiser's table reads it, under the database's own names. */
type OrganiserDelegationQueryRow = {
	id: string;
	name: string;
	institution_name: string;
	country_code: string | null;
	/** Never `draft`: the query asks for the one status the open tab shows. */
	status: ListedDelegationStatus;
	requested_seats: number;
	/** An ISO timestamp. The column is nullable because a draft has no date yet. */
	submitted_at: string | null;
	/**
	 * The heads' names, oldest membership first. A head whose profile could not
	 * be read is a `null` here rather than missing, because the view joins the
	 * profiles with a left join.
	 */
	head_names: (string | null)[];
	/** One entry per member of the group, heads and members alike. */
	delegation_members: { user_id: string }[];
	/** One entry per seat the organisers reserved; `user_id` is `null` until the head fills it. */
	seats: { user_id: string | null }[];
	/** One entry per invoice written against the delegation. */
	invoices: { status: DelegationInvoiceStatus }[];
};

/**
 * What to call this head: their own name, or a word for an account that is no
 * longer there.
 *
 * `05-pages/organiser/delegations.md` asks for the second case by name: a
 * delegation whose head deleted their account is still a row the organiser has
 * to see, and a blank cell would look like a fault rather than a fact.
 * `./application-table.ts` says the same words about the same situation for its
 * own table, because `05-pages/organiser/applications.md` asks it to as well.
 */
function headNameOf(fullName: string | null): string {
	if (fullName === null) {
		return DELETED_ACCOUNT_NAME;
	}

	return fullName;
}

/**
 * The seats this delegation has, and how many of them hold somebody.
 *
 * It is the same pair of numbers `countDelegationSeats` above reads for one
 * delegation, counted here off the seats the query already brought along, so
 * that a table of twenty-five delegations is not twenty-five more queries.
 */
function seatCountsOf(row: OrganiserDelegationQueryRow): DelegationSeatCounts {
	const filled = row.seats.filter((seat) => seat.user_id !== null);

	return { allocated: row.seats.length, assigned: filled.length };
}

/** Turn one row of the view into what the table draws. */
function toOrganiserDelegationRow(row: OrganiserDelegationQueryRow): OrganiserDelegationRow {
	return {
		id: row.id,
		name: row.name,
		institutionName: row.institution_name,
		countryCode: row.country_code,
		// The view has already put the heads in the order they joined, which puts
		// the head who registered the group first.
		headNames: row.head_names.map((fullName) => headNameOf(fullName)),
		// The heads count as members, the way `countDelegationMembers` above counts
		// them, so a group of one head has one member.
		memberCount: row.delegation_members.length,
		status: row.status,
		submittedAt: row.submitted_at,
		// `delegationProgress` in `$lib/delegations.ts` is the one place the three
		// seat numbers are worked out, so this table and the delegation's own pages
		// can never disagree about them.
		progress: delegationProgress({ requestedSeats: row.requested_seats }, seatCountsOf(row)),
		invoice: delegationInvoiceSummary(row.invoices.map((invoice) => invoice.status))
	};
}

/** Which column the sort dropdown puts the table in order by, and which way round. */
type DelegationOrder = {
	column: string;
	ascending: boolean;
	/** Where a row with nothing in that column goes. */
	nullsFirst: boolean;
};

/**
 * The order the sort dropdown asked for, as the database takes it.
 *
 * `submitted` is oldest first, so that the queue is fair and nobody is left at
 * the bottom of it forever; a delegation with no date at all goes to the end
 * rather than to the top. Only a draft is really dateless and no draft reaches
 * this table, so that is there for the shape of the column. `size` is the
 * biggest request first, because the question it answers is "who is asking for
 * the most seats?".
 */
function delegationOrderFor(sort: DelegationListSort): DelegationOrder {
	if (sort === 'name') {
		return { column: 'name', ascending: true, nullsFirst: false };
	}

	if (sort === 'size') {
		return { column: 'requested_seats', ascending: false, nullsFirst: false };
	}

	return { column: 'submitted_at', ascending: true, nullsFirst: false };
}

/** One page of the organiser's table, and how many rows matched altogether. */
export type DelegationListPage = {
	rows: OrganiserDelegationRow[];
	/** Every row that matched, not just the ones on this page. */
	total: number;
};

/**
 * The delegations of one conference as the organiser's table shows them: one
 * page of them, and how many matched altogether.
 *
 * Drafts are left out by the query itself and never by Row Level Security.
 *
 * It is one query of the `delegations_with_heads` view, which puts the heads'
 * names beside each delegation. Nothing in the schema joins `delegation_members`
 * to `profiles` — `delegation_members.user_id` points at `auth.users`, and
 * PostgREST can only bring along a table that a foreign key of the one being
 * read actually names — so without the view the search box, which matches a
 * head's name, could not be a condition on the query. With it the search, the
 * country, the sort and the page are all conditions, and the database answers
 * with the 25 rows the table draws. Nothing is read that is not shown, which is
 * what keeps `max_rows` in `supabase/config.toml` out of the answer.
 *
 * The applications table does exactly the same through
 * `applications_with_applicant`, in `listApplications` in `./application-table.ts`.
 */
export async function listDelegationsForOrganiser(
	supabase: SupabaseClient,
	conferenceId: string,
	query: DelegationListQuery
): Promise<DelegationListPage> {
	// Each step below adds one condition. Nothing is sent to Supabase until the
	// request is awaited at the end.
	let request = supabase
		.from(DELEGATIONS_WITH_HEADS)
		// `count: 'exact'` asks for the number of matches in total as well, not
		// just for the ones on this page.
		.select(ORGANISER_DELEGATION_COLUMNS, { count: 'exact' })
		.eq('conference_id', conferenceId)
		// This is what keeps drafts out, for the reason at the top of this section.
		// A tab only ever shows one status, so naming it does both jobs at once.
		.eq('status', query.status);

	if (query.country !== '') {
		request = request.eq('country_code', query.country);
	}

	const searchText = toSafeSearchText(query.q);

	if (searchText !== '') {
		// `.or` takes one piece of text in Supabase's own filter language, and this
		// one means "the delegation's name, its institution or one of its heads'
		// names contains the search text". `ilike` ignores upper and lower case,
		// `%` stands for "anything", and the double quotes keep the spaces in the
		// search text together. `toSafeSearchText` is what stops the text being
		// read as filter language itself.
		const pattern = `"%${searchText}%"`;
		request = request.or(
			`name.ilike.${pattern},institution_name.ilike.${pattern},head_names_text.ilike.${pattern}`
		);
	}

	const order = delegationOrderFor(query.sort);

	// `range` counts from 0 and includes both ends, and `query.page` is 1-based,
	// the way the address bar writes it, so page 1 is rows 0 to 24.
	const firstIndex = (query.page - 1) * DELEGATIONS_PAGE_SIZE;
	const lastIndex = firstIndex + DELEGATIONS_PAGE_SIZE - 1;

	const { data, error, count } = await request
		.order(order.column, { ascending: order.ascending, nullsFirst: order.nullsFirst })
		// A second sort on the id keeps the order the same when two rows tie on
		// the first, which is what makes paging safe: without it, two rows the
		// dropdown cannot tell apart would come back in whatever order the
		// database happened to find them, and page two could repeat a row page one
		// had already shown.
		.order('id', { ascending: true })
		.range(firstIndex, lastIndex)
		// Supabase guesses the shape of a row from the text in `select`, and it
		// cannot know that `head_names` holds a `null` for a missing profile. This
		// replaces the guess with ours, and it has to come last.
		.overrideTypes<OrganiserDelegationQueryRow[], { merge: false }>();

	// Somebody asked for a page past the last one, for example by editing the URL.
	if (error?.code === PAGE_OUT_OF_RANGE_CODE) {
		return { rows: [], total: 0 };
	}

	if (error) {
		throw new Error(`Could not read the delegations: ${error.message}`);
	}

	const delegations: OrganiserDelegationQueryRow[] = data ?? [];

	return {
		rows: delegations.map((delegation) => toOrganiserDelegationRow(delegation)),
		total: count ?? 0
	};
}

/** One row of `delegation_status_totals`: one status at one conference. */
type DelegationStatusTotalRow = {
	/** Never `draft`: the query leaves that status out. */
	status: ListedDelegationStatus;
	delegation_count: number;
	requested_seats: number;
};

/**
 * How many delegations this conference has in each of the four shown statuses,
 * and how many seats they asked for between them.
 *
 * One query of the `delegation_status_totals` view, which does the counting and
 * the adding up in the database and answers with one row per status, so at
 * most four rows come back however many delegations there are. The earlier
 * version read the status and the seats of every delegation and added them up
 * here, which `max_rows` would have cut short at a thousand. The applications
 * tabs are counted with one head-only query per tab instead, in
 * `countApplicationsByStatus` in `./application-table.ts`; that works for a count,
 * but the sentence under this heading also needs a sum, which only rows can
 * carry.
 *
 * Drafts are left out here too, so the numbers on the tabs and the rows under
 * them can never disagree.
 */
export async function summariseDelegations(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<DelegationSummary> {
	const { data, error } = await supabase
		.from(DELEGATION_STATUS_TOTALS)
		.select('status, delegation_count, requested_seats')
		.eq('conference_id', conferenceId)
		// The table leaves drafts out by naming the status it wants; this asks for
		// all four at once, so it has to say so itself.
		.neq('status', 'draft')
		.overrideTypes<DelegationStatusTotalRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not count the delegations: ${error.message}`);
	}

	// A copy, so that counting never writes on the shared empty one. A status
	// with no delegations has no row in the view and keeps its zero.
	const counts: DelegationStatusCounts = { ...EMPTY_DELEGATION_STATUS_COUNTS };
	let requestedSeatsTotal = 0;

	for (const row of data ?? []) {
		counts[row.status] = row.delegation_count;
		requestedSeatsTotal = requestedSeatsTotal + row.requested_seats;
	}

	return { counts, requestedSeatsTotal };
}

// -----------------------------------------------------------------------------
// The head's seats page
// -----------------------------------------------------------------------------
// Everything below belongs to `/delegations/[delegationId]/seats`, built by
// T29, where the head of a delegation puts each of their members into one of
// the seats the organisers reserved for the group.
//
// Two database rules run through all of it, and neither is checked again here.
// The `seats` update policy gives a head the rows carrying their own
// `delegation_id` and no others, and the `check_seat_allocation` trigger
// decides the rest — only `user_id` may change, only to somebody in the
// delegation or back to null, and only before the conference's `start_date` —
// because a policy decides rows and not columns.
// `specs/02-architecture/permissions.md` has both, and
// `specs/06-features/allocation.md` has them in words under "Head assigns
// members".

/** The seat columns the page reads, with the committee each seat sits in brought along. */
const DELEGATION_SEAT_COLUMNS =
	'id, name, country_code, position, user_id, committees!inner(id, name, abbreviation, level, position)';

/** One `seats` row as the seats page reads it, under the database's own names. */
type DelegationSeatRow = {
	id: string;
	name: string;
	/** Nullable: a seat that is a role rather than a country has no flag to draw. */
	country_code: string | null;
	/** The order the organisers put the seats of this committee in. */
	position: number;
	/** The member sitting in the seat, or `null` while nobody is. */
	user_id: string | null;
	/**
	 * One object rather than a list, because a seat belongs to exactly one
	 * committee. `committees!inner(...)` in the select asks for it that way round,
	 * the same way `findMyDelegationSeat` above does, and makes the committee part
	 * of the match: a seat whose committee could not be read comes back as no seat
	 * rather than as one with no heading to put it under.
	 */
	committees: {
		id: string;
		name: string;
		abbreviation: string | null;
		level: ExperienceLevel;
		/** The order the organisers put the committees of the conference in. */
		position: number;
	};
};

/** One `profiles` row: everything this page has to say about a person. */
type SeatsPageProfileRow = {
	id: string;
	full_name: string;
	avatar_path: string | null;
	experience_level: ExperienceLevel;
};

/**
 * Every seat the organisers reserved for this delegation, with its committee.
 *
 * `is_available` is not read. A seat held for a delegation is never hidden:
 * both organiser pages refuse to hide a reserved or filled seat ("Free the seat
 * first."), and every way a seat reaches a delegation refuses a hidden one.
 */
async function readDelegationSeatRows(
	supabase: SupabaseClient,
	delegationId: string
): Promise<DelegationSeatRow[]> {
	const { data, error } = await supabase
		.from('seats')
		.select(DELEGATION_SEAT_COLUMNS)
		.eq('delegation_id', delegationId)
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<DelegationSeatRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the seats of the delegation: ${error.message}`);
	}

	return data ?? [];
}

/**
 * The user id of everybody in this delegation, heads included.
 *
 * Only the id is read. What to call each of them is the profiles query below,
 * for the reason `readSeatsPageProfiles` below gives.
 */
async function readDelegationMemberIds(
	supabase: SupabaseClient,
	delegationId: string
): Promise<string[]> {
	const { data, error } = await supabase
		.from('delegation_members')
		.select('user_id')
		.eq('delegation_id', delegationId)
		.overrideTypes<{ user_id: string }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the members of the delegation: ${error.message}`);
	}

	return (data ?? []).map((row) => row.user_id);
}

/**
 * The profile of each of these people, by user id.
 *
 * It is a query of its own because nothing in the schema joins `seats.user_id`
 * or `delegation_members.user_id` to `profiles`: both point at `auth.users`,
 * and PostgREST can only bring along a table that a foreign key of the one
 * being read actually names. The organiser's table above gets round the same
 * gap with the `delegations_with_heads` view instead, because it has to search
 * and page by a head's name, which this page never does.
 *
 * It is one query for the seat holders and the members together rather than two,
 * because a member sitting in a seat is in both lists and the page needs the
 * same four columns for either.
 *
 * Anybody signed in may read every profile, so a refusal here is a fault in the
 * page rather than somebody's permissions, and it raises.
 */
async function readSeatsPageProfiles(
	supabase: SupabaseClient,
	userIds: string[]
): Promise<Map<string, SeatsPageProfileRow>> {
	const profiles = new Map<string, SeatsPageProfileRow>();

	// Nobody to ask about, and `.in('id', [])` would be a request that cannot
	// match anything.
	if (userIds.length === 0) {
		return profiles;
	}

	const { data, error } = await supabase
		.from('profiles')
		.select('id, full_name, avatar_path, experience_level')
		.in('id', userIds)
		.overrideTypes<SeatsPageProfileRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the names of the delegation members: ${error.message}`);
	}

	for (const row of data ?? []) {
		profiles.set(row.id, row);
	}

	return profiles;
}

/**
 * Every user id the page has a name to find: whoever is sitting in one of the
 * seats, and everybody in the delegation.
 *
 * A `Set` because a member holding a seat is in both lists, and asking the
 * database about the same person twice would be one wasted row.
 */
function peopleOnTheSeatsPage(seatRows: DelegationSeatRow[], memberIds: string[]): string[] {
	const userIds = new Set<string>(memberIds);

	for (const row of seatRows) {
		if (row.user_id !== null) {
			userIds.add(row.user_id);
		}
	}

	return [...userIds];
}

/**
 * Who is sitting in this seat, or `null` when nobody is.
 *
 * Somebody whose account has gone since is still in the seat, and is named
 * `DELETED_ACCOUNT_NAME` exactly as `headNameOf` above names a head in the same
 * position: a blank where a person is would read as a free seat, and the seat is
 * not free.
 */
function seatHolderOf(
	userId: string | null,
	profiles: Map<string, SeatsPageProfileRow>
): DelegationSeatHolder | null {
	if (userId === null) {
		return null;
	}

	const profile = profiles.get(userId);

	return {
		userId,
		fullName: profile?.full_name ?? DELETED_ACCOUNT_NAME,
		avatarPath: profile?.avatar_path ?? null,
		experienceLevel: profile?.experience_level ?? null
	};
}

/** Turn one seat row into the shape the page draws, holder and all. */
function toDelegationSeat(
	row: DelegationSeatRow,
	profiles: Map<string, SeatsPageProfileRow>
): DelegationSeat {
	return {
		id: row.id,
		name: row.name,
		countryCode: row.country_code,
		holder: seatHolderOf(row.user_id, profiles)
	};
}

/** One committee's seats while they are still being gathered, with what the two sorts need. */
type SeatGroupInProgress = {
	committee: DelegationSeatCommittee;
	/** `committees.position`, which is the order the groups end up in. */
	position: number;
	/** The rows themselves, because the sort inside a group is on `seats.position`. */
	rows: DelegationSeatRow[];
};

/**
 * The delegation's seats as one group per committee.
 *
 * The groups come out in `committees.position` order and the seats inside each
 * one in `seats.position` order, which is the order the organisers put them in
 * on the committee editor. Grouping by the committee's id first, and sorting
 * afterwards, is what keeps two seats of one committee together even when two
 * committees happen to share a position.
 */
function groupSeatsByCommittee(
	rows: DelegationSeatRow[],
	profiles: Map<string, SeatsPageProfileRow>
): DelegationSeatGroup[] {
	const groups = new Map<string, SeatGroupInProgress>();

	for (const row of rows) {
		const started = groups.get(row.committees.id);

		if (started) {
			started.rows.push(row);
			continue;
		}

		groups.set(row.committees.id, {
			committee: {
				id: row.committees.id,
				name: row.committees.name,
				abbreviation: row.committees.abbreviation,
				level: row.committees.level
			},
			position: row.committees.position,
			rows: [row]
		});
	}

	const inCommitteeOrder = [...groups.values()];
	inCommitteeOrder.sort((one, other) => one.position - other.position);

	return inCommitteeOrder.map((group) => {
		// `group.rows` is a list this function built, so sorting it in place leaves
		// the rows the query answered with as they came back.
		group.rows.sort((one, other) => one.position - other.position);

		return {
			committee: group.committee,
			seats: group.rows.map((row) => toDelegationSeat(row, profiles))
		};
	});
}

/**
 * The members of this delegation who are in none of its seats, sorted by name.
 *
 * Somebody with no profile row at all is left out of this list altogether. It is
 * what the "Choose member" dropdown offers, and a name nobody can read is not a
 * name a head can choose from it. The groups above are the other way round on
 * purpose: a seat with such a person in it still has to say that somebody is
 * sitting there.
 */
function unseatedMembersOf(
	memberIds: string[],
	seatRows: DelegationSeatRow[],
	profiles: Map<string, SeatsPageProfileRow>
): UnseatedMember[] {
	const seatedUserIds = new Set<string>();

	for (const row of seatRows) {
		if (row.user_id !== null) {
			seatedUserIds.add(row.user_id);
		}
	}

	const unseated: UnseatedMember[] = [];

	for (const userId of memberIds) {
		if (seatedUserIds.has(userId)) {
			continue;
		}

		const profile = profiles.get(userId);

		if (!profile) {
			continue;
		}

		unseated.push({
			userId,
			fullName: profile.full_name,
			experienceLevel: profile.experience_level,
			avatarPath: profile.avatar_path
		});
	}

	// `localeCompare` sorts the way a reader expects rather than by character
	// code, so an accented name lands beside its neighbours.
	unseated.sort((one, other) => one.fullName.localeCompare(other.fullName));

	return unseated;
}

/** The seats of one delegation, grouped by committee, and the members still waiting for one. */
export type DelegationSeating = {
	groups: DelegationSeatGroup[];
	unseatedMembers: UnseatedMember[];
};

/**
 * Everything the head's seats page shows: the delegation's seats under their
 * committees, and the members who have none yet.
 *
 * Three queries. The first two — the seats and the memberships — need nothing
 * from each other, so they are asked side by side. The third puts a name to
 * every person the first two turned up and has to wait for both.
 */
export async function listDelegationSeats(
	supabase: SupabaseClient,
	delegationId: string
): Promise<DelegationSeating> {
	// `Promise.all` starts both and waits for the pair, so the page pays for one
	// round trip rather than two.
	const [seatRows, memberIds] = await Promise.all([
		readDelegationSeatRows(supabase, delegationId),
		readDelegationMemberIds(supabase, delegationId)
	]);

	const profiles = await readSeatsPageProfiles(supabase, peopleOnTheSeatsPage(seatRows, memberIds));

	return {
		groups: groupSeatsByCommittee(seatRows, profiles),
		unseatedMembers: unseatedMembersOf(memberIds, seatRows, profiles)
	};
}

/**
 * The sentence `check_seat_allocation` raises when somebody is already sitting
 * somewhere else in this conference, word for word from
 * `supabase/migrations/20260918120000_applications_delegations_seat_links.sql`.
 *
 * This one and the two below it are matched on their words rather than on a
 * code of our own, because a Postgres exception arrives as a sentence and not as
 * a code. `src/routes/manage/[slug]/allocation/+page.server.ts` names
 * `TARGET_SEAT_NOT_FREE` and its neighbours for exactly the same reason.
 */
const ALREADY_SEATED_MESSAGE = 'already has a seat in this conference';

/** The sentence it raises when the person is in no delegation this seat is reserved for. */
const NOT_A_MEMBER_MESSAGE = 'not a member of the delegation';

/** The sentence it raises once the conference's `start_date` has arrived. */
const CONFERENCE_STARTED_MESSAGE = 'The conference has started';

/**
 * Which refusal one of the trigger's sentences is.
 *
 * Anything else is not a sentence `check_seat_allocation` wrote for a head to
 * read — a driver's, Postgres's, PostgREST's — so it is raised rather than worded
 * as a refusal, and the page's error handling deals with it.
 */
function assignRefusalFor(databaseMessage: string): AssignSeatRefusal {
	if (databaseMessage.includes(ALREADY_SEATED_MESSAGE)) {
		return 'already_seated';
	}

	if (databaseMessage.includes(NOT_A_MEMBER_MESSAGE)) {
		return 'not_a_member';
	}

	if (databaseMessage.includes(CONFERENCE_STARTED_MESSAGE)) {
		return 'locked';
	}

	throw new Error(`Could not assign the seat: ${databaseMessage}`);
}

/**
 * Put one member of this delegation into one of its seats.
 *
 * Answers `null` when the seat was written, or which refusal the page should
 * show. Only `user_id` is sent: `check_seat_allocation` refuses a head who
 * changes any other column, and it refuses the whole update rather than ignoring
 * the extra field.
 *
 * `'seat_taken'` and `'no_member'` are never answered here. The database is
 * perfectly happy to overwrite a seat that already has somebody in it, and it
 * has nothing to say about a form that named nobody, so the page's action
 * decides those two from the seating it has just read. This function is the last
 * word only on what the database itself refuses.
 */
export async function assignDelegationSeat(
	supabase: SupabaseClient,
	seatId: string,
	userId: string
): Promise<AssignSeatRefusal | null> {
	const { data, error } = await supabase
		.from('seats')
		.update({ user_id: userId })
		.eq('id', seatId)
		.select('id')
		.overrideTypes<{ id: string }[], { merge: false }>();

	if (error) {
		return assignRefusalFor(error.message);
	}

	// Row Level Security refusing an update comes back with no error and no rows
	// at all: a seat the update policy does not give this head simply is not
	// written, and the database says nothing about why. `tests/db/allocation.test.ts`
	// has that exact case — "refuses a head who reaches for a seat reserved for
	// another delegation" — and expects `data` to equal `[]`.
	const written = data ?? [];

	if (written.length === 0) {
		return 'not_your_delegation';
	}

	return null;
}

/**
 * Take whoever is in one of this delegation's seats out of it.
 *
 * Answers `null` when the seat was written, or which refusal the page should
 * show. The seat itself stays reserved for the delegation; only the person
 * leaves it.
 *
 * When the seat was written, the file of the paper the database deleted is
 * removed from the bucket as well, by `removeOrphanedDocumentFiles`.
 *
 * It never answers `'already_empty'`. Writing `null` over a `user_id` that is
 * already `null` changes nothing, so the trigger and the policy both allow it
 * and a row still comes back. The page's action decides that one from the
 * seating it has just read, the same way it decides `'seat_taken'` for the other
 * direction.
 */
export async function unassignDelegationSeat(
	supabase: SupabaseClient,
	seatId: string
): Promise<UnassignSeatRefusal | null> {
	const { data, error } = await supabase
		.from('seats')
		.update({ user_id: null })
		.eq('id', seatId)
		.select('id')
		.overrideTypes<{ id: string }[], { merge: false }>();

	if (error) {
		if (error.message.includes(CONFERENCE_STARTED_MESSAGE)) {
			return 'locked';
		}

		throw new Error(`Could not empty the seat: ${error.message}`);
	}

	// No error and no rows is Row Level Security turning the update away, exactly
	// as in `assignDelegationSeat` above.
	const written = data ?? [];

	if (written.length === 0) {
		return 'not_your_delegation';
	}

	// Emptying the seat deleted the person's position paper row, through the
	// `seats_clear_position_paper` trigger, but not the file itself. A head may
	// not touch that file, so the service role removes it (T96).
	await removeOrphanedDocumentFiles();

	return null;
}

/** What the refusal calls somebody with no profile row at all. */
export const UNKNOWN_MEMBER_NAME = 'That person';

/**
 * What to call the person with this id.
 *
 * Only one refusal needs it — "{name} is not in this delegation." names somebody
 * who is, by definition, not in the list the page already holds — so this is
 * asked for on that one path and nowhere else. Anybody signed in may read every
 * profile. Somebody with no profile row at all is "That person", which still
 * reads as a sentence, so a refused or empty answer is not raised either: the
 * head is being told something went wrong already.
 */
export async function readMemberName(supabase: SupabaseClient, userId: string): Promise<string> {
	const { data } = await supabase
		.from('profiles')
		.select('full_name')
		.eq('id', userId)
		// `maybeSingle` returns one row, or `null` when nothing matches, instead of a list.
		.maybeSingle()
		.overrideTypes<{ full_name: string }, { merge: false }>();

	return data?.full_name ?? UNKNOWN_MEMBER_NAME;
}

// -----------------------------------------------------------------------------
// The head's members page
// -----------------------------------------------------------------------------
// The other half of the pair the seats section above belongs to. Everything
// below belongs to `/delegations/[delegationId]/members`, where the head of a
// delegation sees who has joined, makes a second head, and takes somebody out of
// the group again.
//
// Two database rules run through all of it, and neither is asked again here.
// `protect_delegation_member_columns` lets a head write the `role` column of a
// membership and nothing else, because a policy decides rows and not columns;
// `prevent_last_delegation_head_removal` refuses the update or the delete that
// would leave a delegation with no head at all. `specs/02-architecture/permissions.md`
// has the policies and
// `supabase/migrations/20260918120000_applications_delegations_seat_links.sql`
// has both triggers.

/** One `delegation_members` row as the members page reads it, under the database's own names. */
type DelegationMemberRow = {
	user_id: string;
	role: DelegationRole;
	/** An ISO timestamp: when the membership row was written. */
	joined_at: string;
};

/** One `profiles` row: everything the members page says about a person in public. */
type MembersPageProfileRow = {
	id: string;
	full_name: string;
	avatar_path: string | null;
	institution_name: string | null;
	experience_level: ExperienceLevel;
};

/** One `delegation_member_details` row: the two private facts a head may read. */
type MemberDetailsRow = {
	user_id: string;
	phone: string | null;
	dietary_requirements: string | null;
};

/** The three private facts the review page shows, or `null` when neither view answered for them. */
function staffMemberDetailsOf(row: PrivateDetailsRow | undefined): DelegationMemberDetails | null {
	if (row === undefined) {
		return null;
	}

	return {
		dateOfBirth: row.date_of_birth,
		phone: row.phone,
		dietaryRequirements: row.dietary_requirements
	};
}

/**
 * Every membership of this delegation, in whatever order they came back in.
 *
 * `readDelegationMemberIds` further up asks the same table for the seats page
 * and reads the id alone, because all that page needs to know is who is in the
 * delegation. This one shows what each of them is and when they joined, so it
 * reads all three columns. Putting them in order is `sortDelegationMembers`'s
 * job and not the query's.
 */
async function readDelegationMemberRows(
	supabase: SupabaseClient,
	delegationId: string
): Promise<DelegationMemberRow[]> {
	const { data, error } = await supabase
		.from('delegation_members')
		.select('user_id, role, joined_at')
		.eq('delegation_id', delegationId)
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<DelegationMemberRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the members of the delegation: ${error.message}`);
	}

	return data ?? [];
}

/**
 * The profile of each of these members, by user id.
 *
 * A query of its own for the reason `readSeatsPageProfiles` above gives:
 * `delegation_members.user_id` points at `auth.users`, and PostgREST can only
 * bring along a table that a foreign key of the one being read actually names.
 * It is not that function reused, because this page shows the institution behind
 * each person and the seats page does not.
 *
 * Anybody signed in may read every profile, so a refusal here is a fault in the
 * page rather than somebody's permissions, and it raises.
 */
async function readMembersPageProfiles(
	supabase: SupabaseClient,
	userIds: string[]
): Promise<Map<string, MembersPageProfileRow>> {
	const profiles = new Map<string, MembersPageProfileRow>();

	// Nobody to ask about, and `.in('id', [])` would be a request that cannot
	// match anything, exactly as in `readSeatsPageProfiles` above.
	if (userIds.length === 0) {
		return profiles;
	}

	const { data, error } = await supabase
		.from('profiles')
		.select('id, full_name, avatar_path, institution_name, experience_level')
		.in('id', userIds)
		.overrideTypes<MembersPageProfileRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the names of the delegation members: ${error.message}`);
	}

	for (const row of data ?? []) {
		profiles.set(row.id, row);
	}

	return profiles;
}

/**
 * The phone number and dietary requirements of each of these members of this
 * delegation, by user id.
 *
 * A query of its own as well, because the details key on `auth.users` too.
 * They come from the `delegation_member_details` view, which answers a head
 * about the members of the delegations they head, with these two columns and
 * no others, and only while the delegation is neither withdrawn nor rejected
 * (security review 2026-10-10, M19). The `profile_details` table itself opens
 * to nobody but the person; the conference team reads it through the views in
 * `./private-details.ts` instead, which `getDelegationForOrganiser` below does.
 *
 * This is the one query in this file whose empty answer is neither a fault nor
 * a reason to raise. A caller who is not a head of this delegation is simply
 * answered with nothing, and every row of their list ends up with
 * `details: null`. An `error` is read the same way, as "no details" rather
 * than as a failure, because the page has nothing to put behind the "Details"
 * toggle either way.
 */
async function readMemberDetails(
	supabase: SupabaseClient,
	delegationId: string,
	userIds: string[]
): Promise<Map<string, MemberDetailsRow>> {
	const details = new Map<string, MemberDetailsRow>();

	// Nobody to ask about, and `.in('user_id', [])` would be a request that
	// cannot match anything.
	if (userIds.length === 0) {
		return details;
	}

	// The view has a row per membership, so the delegation is part of the
	// question: somebody heading two delegations at two conferences could
	// otherwise be answered about the same person twice.
	const { data, error } = await supabase
		.from('delegation_member_details')
		.select('user_id, phone, dietary_requirements')
		.eq('delegation_id', delegationId)
		.in('user_id', userIds)
		.overrideTypes<MemberDetailsRow[], { merge: false }>();

	// Deliberately not raised, for the reason the comment above gives.
	if (error) {
		return details;
	}

	for (const row of data ?? []) {
		details.set(row.user_id, row);
	}

	return details;
}

/**
 * The seat each of the delegation's seats holds somebody in, by that person's
 * user id.
 *
 * An empty seat is not in the map at all, and nobody is in two of them:
 * `check_seat_allocation` refuses a second seat in the same conference, so one
 * seat per key is all there ever is.
 */
function seatsByHolder(seatRows: DelegationSeatRow[]): Map<string, DelegationMemberSeat> {
	const seats = new Map<string, DelegationMemberSeat>();

	for (const row of seatRows) {
		if (row.user_id === null) {
			continue;
		}

		seats.set(row.user_id, {
			seatName: row.name,
			countryCode: row.country_code,
			committeeName: row.committees.name,
			committeeAbbreviation: row.committees.abbreviation
		});
	}

	return seats;
}

/**
 * The two private facts this member's row can show, or `null` when the caller
 * may not read them.
 *
 * A head reading a member who filled in neither box gets a row with two `null`s
 * in it, which is not the same answer as `null` itself: the first means "nothing
 * to say", the second means "not yours to see".
 */
function memberDetailsOf(
	userId: string,
	details: Map<string, MemberDetailsRow>
): DelegationMemberDetails | null {
	const row = details.get(userId);

	if (row === undefined) {
		return null;
	}

	return {
		// A head never reads a member's date of birth: the view has no such
		// column, and their page shows no age. The organiser's review page
		// fills this in through `staffMemberDetailsOf` above.
		dateOfBirth: null,
		phone: row.phone,
		dietaryRequirements: row.dietary_requirements
	};
}

/** Turn one membership, and everything read beside it, into what the page draws. */
function toDelegationMember(
	row: DelegationMemberRow,
	profiles: Map<string, MembersPageProfileRow>,
	details: Map<string, MemberDetailsRow>,
	seats: Map<string, DelegationMemberSeat>
): DelegationMember {
	const profile = profiles.get(row.user_id);

	return {
		userId: row.user_id,
		role: row.role,
		joinedAt: row.joined_at,
		// Somebody whose account has gone is still in the delegation, and is named
		// the way `seatHolderOf` above names a seat holder in the same position: a
		// blank row would read as a fault rather than as a fact.
		fullName: profile?.full_name ?? DELETED_ACCOUNT_NAME,
		avatarPath: profile?.avatar_path ?? null,
		institutionName: profile?.institution_name ?? null,
		// `none` is the first of the four `experience_level` values and the one a
		// profile that has never said anything about experience carries anyway.
		experienceLevel: profile?.experience_level ?? 'none',
		seat: seats.get(row.user_id) ?? null,
		details: memberDetailsOf(row.user_id, details)
	};
}

/**
 * Everybody in this delegation, heads first and then oldest membership first.
 *
 * Four queries in two rounds, because the second pair needs the first pair's
 * answer and nothing else does. First the memberships and the delegation's
 * seats, side by side; then the profiles and the private details of the people
 * the memberships named, side by side as well.
 *
 * `05-pages/delegation/members.md` asks for "the seat the member holds in this
 * conference", and reading the delegation's *own* seats answers exactly that
 * question. `check_one_route_per_conference` means a member of this delegation
 * cannot have reached a seat in the same conference by any other road, so the two
 * questions have the same answer, and this one needs no conference id — which is
 * what lets the signature stay the `(supabase, delegationId)` the spec fixes.
 *
 * A member whose `profiles` row has gone is still a member and still listed.
 * A caller who is not a head of the delegation is answered no details at all
 * and gets `details: null` on every row rather than a short list, which is the
 * half of the rule `readMemberDetails` above explains.
 *
 * The order comes from `sortDelegationMembers` in `$lib/delegations.ts`, so that
 * it stays a pure rule the page's own tests can exercise without a database.
 */
export async function listDelegationMembers(
	supabase: SupabaseClient,
	delegationId: string
): Promise<DelegationMember[]> {
	// `Promise.all` starts both and waits for the pair, so the page pays for one
	// round trip rather than two.
	const [memberRows, seatRows] = await Promise.all([
		readDelegationMemberRows(supabase, delegationId),
		readDelegationSeatRows(supabase, delegationId)
	]);

	const memberIds = memberRows.map((row) => row.user_id);

	const [profiles, details] = await Promise.all([
		readMembersPageProfiles(supabase, memberIds),
		readMemberDetails(supabase, delegationId, memberIds)
	]);

	const seats = seatsByHolder(seatRows);
	const rows = memberRows.map((row) => toDelegationMember(row, profiles, details, seats));

	return sortDelegationMembers(rows);
}

/**
 * The sentence `prevent_last_delegation_head_removal` raises when a change would
 * leave the delegation with no head, word for word from
 * `supabase/migrations/20260918120000_applications_delegations_seat_links.sql`.
 *
 * Matched on its words rather than on a code of our own, for the reason
 * `ALREADY_SEATED_MESSAGE` above gives: a Postgres exception arrives as a
 * sentence and not as a code. It lives down here beside the two functions that
 * read it rather than up with that one, because it belongs to this page.
 */
const LAST_HEAD_MESSAGE = 'A delegation needs at least one head';

/**
 * Make one member of this delegation a head, or take one back to a plain member.
 *
 * `'last_head'` is the `prevent_last_delegation_head_removal` trigger refusing
 * to leave the group without a head, which is the database half of the rule
 * `members.md`'s "A delegation needs at least one head." refusal states; the
 * page asks the same question of the list it has just read before it ever posts,
 * so this is the second of the two guards the acceptance criterion asks for.
 *
 * Only `role` is sent. `protect_delegation_member_columns` refuses a head who
 * touches any other column of a membership, and it refuses the whole update
 * rather than ignoring the extra field, the same rule `updateDelegationDetails`
 * one level up explains for the delegation itself.
 */
export async function setDelegationMemberRole(
	supabase: SupabaseClient,
	delegationId: string,
	userId: string,
	role: DelegationRole
): Promise<'written' | 'not_a_member' | 'last_head'> {
	const { data, error } = await supabase
		.from('delegation_members')
		.update({ role })
		.eq('delegation_id', delegationId)
		.eq('user_id', userId)
		.select('user_id')
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<{ user_id: string }[], { merge: false }>();

	if (error) {
		if (error.message.includes(LAST_HEAD_MESSAGE)) {
			return 'last_head';
		}

		throw new Error(`Could not change the role of the member: ${error.message}`);
	}

	// No error and no rows at all is Row Level Security turning the update away
	// without a word, exactly as in `assignDelegationSeat` above. Both keys are on
	// the query and the update policy gives a head every membership of their own
	// delegation, so the one thing an empty answer can mean here is that nobody
	// with that id is in this delegation.
	const written = data ?? [];

	if (written.length === 0) {
		return 'not_a_member';
	}

	return 'written';
}

/**
 * Take one member out of this delegation.
 *
 * `'refused'` is the delete policy matching nothing. It carries
 * `and not exists (select 1 from seats where ... user_id = delegation_members.user_id)`,
 * so a member who is sitting in one of this delegation's seats is turned away
 * silently: no rows and no error, the same shape a membership that was never
 * there gives. That is the one refusal this function answers, and `'refused'` is
 * the whole of what it can honestly say, because a policy that matched nothing
 * cannot report which half of it failed. The action calling it has just read the
 * member list, so it is the half that knows whether this person holds a seat and
 * can word `members.md`'s "{name} holds a seat; unassign it on the Seats page
 * first."
 *
 * The last-head trigger can refuse this too, and that one raises rather than
 * being worded: the page checks the rule itself before it posts, so reaching the
 * trigger means the delegation changed underneath the page, and a flash saying
 * somebody was removed who is still there would be worse than an error.
 */
export async function removeDelegationMember(
	supabase: SupabaseClient,
	delegationId: string,
	userId: string
): Promise<'removed' | 'refused'> {
	const { data, error } = await supabase
		.from('delegation_members')
		.delete()
		.eq('delegation_id', delegationId)
		.eq('user_id', userId)
		.select('user_id')
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<{ user_id: string }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not remove the member from the delegation: ${error.message}`);
	}

	const removed = data ?? [];

	if (removed.length === 0) {
		return 'refused';
	}

	return 'removed';
}

// -----------------------------------------------------------------------------
// The organiser's review page
// -----------------------------------------------------------------------------
// Everything below belongs to `/manage/[slug]/delegations/[delegationId]`,
// where one school's request is read in full and decided. What the page makes
// of these rows — the wording of every refusal and every flash — is
// `$lib/delegation-review.ts`, so nothing here decides what anything says.

/**
 * The columns the review page reads off the delegation itself. The organisers'
 * own note is not one of them any more: it lives in `delegation_internal_notes`,
 * a table only they can read (migration 20261022132000), which
 * `readDelegationInternalNote` below fetches.
 */
const ORGANISER_DELEGATION_DETAIL_COLUMNS =
	'id, conference_id, name, institution_name, country_code, status, requested_seats, note, submitted_at, decided_at, decision_note';

/** One `delegations` row as the review page reads it, under the database's own names. */
type OrganiserDelegationDetailRow = {
	id: string;
	conference_id: string;
	name: string;
	institution_name: string;
	country_code: string | null;
	status: DelegationStatus;
	requested_seats: number;
	note: string | null;
	submitted_at: string | null;
	decided_at: string | null;
	decision_note: string | null;
};

/**
 * The note only the organisers of this conference ever read, or `null` when
 * nobody has written one or the box was emptied.
 *
 * A row of its own table rather than a column of the delegation, because the
 * head, the members and the chairs who list its seats may all read the
 * delegation row, and a policy decides rows, not columns. The table's own
 * policies let `read_applications` read and `decide_applications` write.
 */
async function readDelegationInternalNote(
	supabase: SupabaseClient,
	delegationId: string
): Promise<string | null> {
	const { data, error } = await supabase
		.from('delegation_internal_notes')
		.select('note')
		.eq('delegation_id', delegationId)
		.maybeSingle()
		.overrideTypes<{ note: string | null }, { merge: false }>();

	if (error) {
		throw new Error(`Could not read the internal note: ${error.message}`);
	}

	return data?.note ?? null;
}

/** One `invoices` row as the Invoices card lists it, under the database's own names. */
type DelegationInvoiceRow = {
	id: string;
	number: string;
	description: string;
	amount_cents: number;
	currency: string;
	status: DelegationInvoiceStatus;
};

/**
 * Every invoice written against this delegation, newest first.
 *
 * The newest is first because the `allocate` action reads this list twice — once
 * before it reserves the seats and once after — and the invoice that was not
 * there the first time is the one the flash names. `06-features/fees.md` makes
 * one allocation one invoice, so there is never more than one new row to find.
 */
export async function listDelegationInvoices(
	supabase: SupabaseClient,
	delegationId: string
): Promise<DelegationInvoiceLine[]> {
	const { data, error } = await supabase
		.from('invoices')
		.select('id, number, description, amount_cents, currency, status')
		.eq('delegation_id', delegationId)
		.order('created_at', { ascending: false })
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<DelegationInvoiceRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the invoices of the delegation: ${error.message}`);
	}

	return (data ?? []).map((row) => ({
		id: row.id,
		number: row.number,
		description: row.description,
		amountCents: row.amount_cents,
		currency: row.currency,
		status: row.status
	}));
}

/**
 * Everything the organiser's review page shows about one delegation, or `null`
 * when there is no such delegation, when it belongs to another conference, or
 * when it is still a `draft`.
 *
 * The conference is part of the question rather than only the delegation, so a
 * delegation id from somebody else's conference is nothing rather than a page
 * an organiser can reach by guessing an id. A `draft` is nothing here too:
 * `05-pages/organiser/delegation-review.md` asks for a 404, because a group the
 * head has not sent yet is not a request anybody may decide.
 *
 * Four queries in two rounds. The delegation first, because the three lists are
 * only worth reading once it is a delegation this organiser may decide; then
 * the members, the reserved seats and the invoices side by side.
 * `listDelegationMembers` and `listDelegationSeats` above are the head's own
 * queries reused: the organiser reads the same rows through the same policies.
 * The members' private details are the exception. The team does not read
 * `profile_details`, so a third round reads them through the two views, which
 * answer only for what this reader's permissions open
 * (`docs/roles-and-permissions.md`, section 5).
 */
export async function getDelegationForOrganiser(
	supabase: SupabaseClient,
	conferenceId: string,
	delegationId: string
): Promise<OrganiserDelegationDetail | null> {
	const { data, error } = await supabase
		.from('delegations')
		.select(ORGANISER_DELEGATION_DETAIL_COLUMNS)
		.eq('id', delegationId)
		.eq('conference_id', conferenceId)
		// `maybeSingle` returns one row, or `null` when nothing matches, instead of a list.
		.maybeSingle()
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<OrganiserDelegationDetailRow, { merge: false }>();

	// A malformed id is refused by Postgres rather than simply not found. It can
	// only come from an address somebody typed or edited by hand, and it names
	// nothing, so the page answers 404 like any other id it cannot find.
	if (error?.code === INVALID_ID_CODE) {
		return null;
	}

	if (error) {
		throw new Error(`Could not read the delegation: ${error.message}`);
	}

	if (!data || data.status === 'draft') {
		return null;
	}

	const [members, seating, invoices, internalNote] = await Promise.all([
		listDelegationMembers(supabase, delegationId),
		listDelegationSeats(supabase, delegationId),
		listDelegationInvoices(supabase, delegationId),
		readDelegationInternalNote(supabase, delegationId)
	]);
	const privateDetails = await readPrivateDetails(
		supabase,
		members.map((member) => member.userId)
	);

	return {
		delegation: {
			id: data.id,
			conferenceId: data.conference_id,
			name: data.name,
			institutionName: data.institution_name,
			countryCode: data.country_code,
			status: data.status,
			requestedSeats: data.requested_seats,
			note: data.note,
			submittedAt: data.submitted_at,
			decidedAt: data.decided_at,
			decisionNote: data.decision_note,
			internalNote
		},
		members: members.map((member) => ({
			...member,
			details: staffMemberDetailsOf(privateDetails.get(member.userId))
		})),
		seatGroups: seating.groups,
		invoices
	};
}

/**
 * Write the note the head reads with the decision, and stamp who decided and
 * when.
 *
 * `allocate_delegation_seats` moves a `submitted` delegation to `accepted` with
 * `decided_at` and `decided_by`, but it writes no `decision_note`, and
 * `05-pages/organiser/delegation-review.md` asks the `allocate` action for one.
 * The note cannot be added to that function, because three other tasks already
 * depend on the applied migration, so it is a second, small write from here —
 * the same shape `writeSeatReleasedNote` in `./allocation-grid.ts` takes for the same
 * reason. `guard_delegation_update` lists `decision_note` among the columns an
 * organiser may write.
 */
export async function saveDelegationDecisionNote(
	supabase: SupabaseClient,
	delegationId: string,
	decisionNote: string
): Promise<void> {
	const { error } = await supabase
		.from('delegations')
		.update({ decision_note: decisionNote })
		.eq('id', delegationId);

	if (error) {
		throw new Error(`Could not save the decision note: ${error.message}`);
	}
}

/**
 * Turn a delegation down: `rejected`, with the note the head reads and the
 * stamp of who decided it.
 *
 * Whether it may be turned down at all is `rejectRefusal` in
 * `$lib/delegation-review.ts` and the action that calls it, not this function.
 * `guard_delegation_update` lets an organiser move a submitted or accepted
 * delegation to rejected and nothing else, but it does not count seats, so the
 * rule that a delegation gives its seats back first lives in the page; this is
 * only the write.
 *
 * `decided_at` and `decided_by` are sent from here rather than left to a
 * trigger, because no trigger writes them for a rejection:
 * `allocate_delegation_seats` is the only thing that stamps them, and it is not
 * involved in turning a delegation down.
 */
export async function rejectDelegation(
	supabase: SupabaseClient,
	delegationId: string,
	decidedBy: string,
	decisionNote: string
): Promise<void> {
	const { error } = await supabase
		.from('delegations')
		.update({
			status: 'rejected',
			decided_at: new Date().toISOString(),
			decided_by: decidedBy,
			decision_note: decisionNote
		})
		.eq('id', delegationId);

	if (error) {
		throw new Error(`Could not turn the delegation down: ${error.message}`);
	}
}

/**
 * Save the organisers' own note about this delegation.
 *
 * An upsert into `delegation_internal_notes`, because the first note on a
 * delegation makes its row and every later one changes it. An emptied box
 * stores `null` rather than an empty string, so "no note" always reads the
 * same way, as `updateApplicationInternalNote` in `./application-review.ts`
 * does for applications.
 */
export async function updateDelegationInternalNote(
	supabase: SupabaseClient,
	delegationId: string,
	internalNote: string
): Promise<void> {
	const { error } = await supabase
		.from('delegation_internal_notes')
		.upsert({ delegation_id: delegationId, note: internalNote === '' ? null : internalNote });

	if (error) {
		throw new Error(`Could not save the note: ${error.message}`);
	}
}

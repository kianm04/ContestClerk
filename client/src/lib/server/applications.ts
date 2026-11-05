/**
 * The applicant's own side of the `applications` table: the row the apply form
 * fills in, the page that shows what became of it, and the two buttons that
 * withdraw it or throw the draft away.
 *
 * Files under `$lib/server` only ever run on the server, so this is where the
 * database is queried. Every function takes the Supabase client as its first
 * argument. Pages pass in `locals.supabase`, the client that knows who is
 * signed in, so the database's Row Level Security rules (see
 * `specs/02-architecture/permissions.md`) decide what each caller may read and
 * write.
 *
 * One thing here is not left to those rules. The `applications` select policy
 * is "self; org.", so an organiser of the conference reads an application just
 * as the person who wrote it does. A query that must only ever answer about the
 * reader therefore filters on `user_id` itself rather than leaning on Row Level
 * Security to do it. That filter is what keeps an organiser off
 * `/applications/[id]`, which `specs/05-pages/delegate/application.md` sends
 * them a 404 for: organisers read an application at
 * `/manage/[slug]/applications/[applicationId]` instead.
 *
 * The organiser's side of the same table is in three files of its own, one
 * topic each: `./application-table.ts` for the table, its tab counts and the
 * CSV, `./application-bulk-decisions.ts` for the table's two bulk decisions,
 * and `./application-review.ts` for the page that reads one application in
 * full.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	ApplicationAnswers,
	ApplicationConference,
	ApplicationListConference,
	ApplicationListSeat,
	ApplicationStatus,
	InvoiceStatus,
	MyApplication,
	MyApplicationInvoice,
	MyApplicationListItem,
	MyApplicationSeat
} from '$lib/applications';
import type { ApplicationQuestion } from '$lib/application-questions';
import { committeeHeading } from '$lib/committees';
import type { ApplicationOpenMode, ConferenceStatus, LocationMode } from '$lib/conferences';
import { listApplicationQuestions } from './application-questions';

/** Everything the applicant's own application page shows, in one object. */
export type MyApplicationPage = {
	application: MyApplication;
	conference: ApplicationConference;
	questions: ApplicationQuestion[];
	/**
	 * The names of `application.committeePreferences`, in the same order, each
	 * one as `committeeHeading` words it. A committee that has since been deleted
	 * is left out.
	 */
	committeeNames: string[];
	seat: MyApplicationSeat | null;
	invoice: MyApplicationInvoice | null;
};

/**
 * What the apply form writes.
 *
 * The status is a separate argument of `upsertApplication` rather than a field
 * here, because it is the one thing the page's two buttons disagree about: they
 * send the same answers and mean "keep this for later" or "this is my
 * application".
 */
export type ApplicationInput = {
	committeePreferences: string[];
	seatPreferences: string | null;
	motivation: string | null;
	answers: ApplicationAnswers;
};

/**
 * The application columns the applicant's own pages ask for.
 *
 * `internal_note` is deliberately not among them. The applicant's own row
 * carries it, because a policy decides rows and not columns, but nothing here
 * asks for it, so what the organisers wrote to each other never reaches a page.
 */
const APPLICATION_COLUMNS =
	'id, conference_id, user_id, status, committee_preferences, seat_preferences, motivation, answers, submitted_at, decision_note, updated_at';

/** The conference columns the application page shows, brought along with the application. */
const APPLICATION_CONFERENCE_COLUMNS =
	'id, slug, name, logo_path, start_date, end_date, timezone, status, application_open_mode, applications_open_at, applications_close_at, committee_preference_count, ask_motivation';

/** The error code Postgres sends when an id is not a uuid at all. */
const INVALID_ID_CODE = '22P02';

/** The error code Supabase sends when a page number is past the last page of results. */
const PAGE_OUT_OF_RANGE_CODE = 'PGRST103';

/**
 * How many ids one `.in(...)` lookup asks about at a time.
 *
 * The list at `/applications` asks about one id per application, and all of
 * those ids in a single request could be both more rows than `max_rows` will
 * answer with and a web address longer than the server accepts. A hundred
 * uuids is about four kilobytes of address, which nothing objects to.
 */
const ID_LOOKUP_BATCH_SIZE = 100;

/** One `applications` row, under the database's own column names. */
type ApplicationRow = {
	id: string;
	conference_id: string;
	user_id: string;
	status: ApplicationStatus;
	/** The committee ids the applicant put down, in their own order. */
	committee_preferences: string[];
	/** Free text, or `null` when the applicant left the field empty. */
	seat_preferences: string | null;
	motivation: string | null;
	/** One object keyed by `application_questions.id`. */
	answers: ApplicationAnswers;
	/** ISO timestamps. `submitted_at` is `null` while the application is a draft. */
	submitted_at: string | null;
	/** What the organisers wrote to the applicant, or `null` when they wrote nothing. */
	decision_note: string | null;
	updated_at: string;
};

/** One `conferences` row as the application page reads it, under the database's own names. */
type ApplicationConferenceRow = {
	id: string;
	slug: string;
	name: string;
	logo_path: string | null;
	/** `YYYY-MM-DD`. */
	start_date: string;
	end_date: string;
	timezone: string;
	status: ConferenceStatus;
	application_open_mode: ApplicationOpenMode;
	/** ISO timestamps. `null` means no bound on that side of the window. */
	applications_open_at: string | null;
	applications_close_at: string | null;
	committee_preference_count: number;
	ask_motivation: boolean;
};

/** An application with the conference it belongs to brought along. */
type ApplicationWithConferenceRow = ApplicationRow & {
	/**
	 * One object rather than a list, because an application belongs to exactly
	 * one conference. `conferences!inner(...)` in the select asks for it that way
	 * round and, more importantly, makes the conference part of the match: an
	 * application whose conference could not be read comes back as no application
	 * at all rather than as one with nothing to name it.
	 */
	conferences: ApplicationConferenceRow;
};

/** Turn a database row (snake_case names) into the shape the pages use. */
function toMyApplication(row: ApplicationRow): MyApplication {
	return {
		id: row.id,
		conferenceId: row.conference_id,
		status: row.status,
		committeePreferences: row.committee_preferences,
		// The two text columns are empty text here although the database allows no
		// value at all. Both fill a text box on the apply form, and a text box's
		// value is text: "never answered" and "answered with nothing" read the same
		// on the page, so they are the same empty string.
		seatPreferences: row.seat_preferences ?? '',
		motivation: row.motivation ?? '',
		answers: row.answers,
		submittedAt: row.submitted_at,
		decisionNote: row.decision_note,
		updatedAt: row.updated_at
	};
}

/** Turn the conference the application carries into the shape the page uses. */
function toApplicationConference(row: ApplicationConferenceRow): ApplicationConference {
	return {
		id: row.id,
		slug: row.slug,
		name: row.name,
		logoPath: row.logo_path,
		startDate: row.start_date,
		endDate: row.end_date,
		timezone: row.timezone,
		status: row.status,
		applicationOpenMode: row.application_open_mode,
		applicationsOpenAt: row.applications_open_at,
		applicationsCloseAt: row.applications_close_at,
		committeePreferenceCount: row.committee_preference_count,
		askMotivation: row.ask_motivation
	};
}

/**
 * The application this person has at this conference, or `null` when they have
 * none.
 *
 * This is the row the apply form prefills from and the row `canApply` in
 * `$lib/applications.ts` is asked about. The person is part of the question and
 * not only the conference, for the reason at the top of this file.
 */
export async function getMyApplicationFor(
	supabase: SupabaseClient,
	conferenceId: string,
	userId: string
): Promise<MyApplication | null> {
	const { data, error } = await supabase
		.from('applications')
		.select(APPLICATION_COLUMNS)
		.eq('conference_id', conferenceId)
		.eq('user_id', userId)
		// `maybeSingle` returns one row, or `null` when nothing matches, instead of
		// a list. There is never more than one: `unique (conference_id, user_id)`
		// on the table says so.
		.maybeSingle()
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<ApplicationRow, { merge: false }>();

	if (error) {
		throw new Error(`Could not read your application: ${error.message}`);
	}

	if (!data) {
		return null;
	}

	return toMyApplication(data);
}

/** One committee of the preference list: its id, and the two fields its heading is made of. */
type PreferredCommitteeRow = {
	id: string;
	name: string;
	abbreviation: string | null;
};

/**
 * The names of the committees the applicant put down, in the order they put
 * them.
 *
 * Each one is named by `committeeHeading` — its short name when it has one, its
 * full name otherwise — which is the rule the committee's own page and the home
 * dashboard use as well, so that one committee is never worded three ways. That
 * is why the query asks for `abbreviation` beside `name`: those two fields are
 * all the rule reads.
 *
 * `.in(...)` answers in whatever order the database finds the rows, so the
 * names are put back into the applicant's order here. A committee the
 * organisers have deleted since is left out rather than shown as a gap, which
 * is what `application.committeePreferences` says above.
 */
export async function listPreferredCommitteeNames(
	supabase: SupabaseClient,
	committeeIds: string[]
): Promise<string[]> {
	// Nothing to look up, and `.in('id', [])` would be a pointless request, the
	// way `listCommitteesWithSeatCounts` in `./committees.ts` skips one too.
	if (committeeIds.length === 0) {
		return [];
	}

	const { data, error } = await supabase
		.from('committees')
		.select('id, name, abbreviation')
		.in('id', committeeIds)
		.overrideTypes<PreferredCommitteeRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the committees you chose: ${error.message}`);
	}

	const rows: PreferredCommitteeRow[] = data ?? [];
	const committeeById = new Map(rows.map((row) => [row.id, row]));
	const names: string[] = [];

	for (const committeeId of committeeIds) {
		const committee = committeeById.get(committeeId);

		if (committee !== undefined) {
			names.push(committeeHeading(committee));
		}
	}

	return names;
}

/** One row of the seat lookup: the seat itself, with the committee it is in brought along. */
type ApplicationSeatRow = {
	/** Asked for because the invoice below is found by it, not because a page shows it. */
	id: string;
	name: string;
	/**
	 * An ISO two-letter country code, or `null` for a seat that is not a country, such as "Press".
	 */
	country_code: string | null;
	/**
	 * One object rather than a list, because a seat belongs to one committee.
	 * `committees!inner(...)` in the select asks for it that way round and makes
	 * the committee part of the match, the way `findMySeat` in `./conferences.ts`
	 * does.
	 */
	committees: { slug: string; name: string; abbreviation: string | null };
};

/**
 * The seat this application won, or `null` when it has not won one.
 *
 * A query Row Level Security refuses answers `null` as well, the way
 * `findMySeat` in `./conferences.ts` does: an applicant who is still waiting
 * for a decision holds no seat and reads no seat list, and that is the ordinary
 * case here rather than a fault worth an error page.
 */
export async function findSeatForApplication(
	supabase: SupabaseClient,
	applicationId: string
): Promise<ApplicationSeatRow | null> {
	const { data, error } = await supabase
		.from('seats')
		.select('id, name, country_code, committees!inner(slug, name, abbreviation)')
		.eq('application_id', applicationId)
		.maybeSingle()
		.overrideTypes<ApplicationSeatRow, { merge: false }>();

	if (error || !data) {
		return null;
	}

	return data;
}

/** One `invoices` row as the applicant's page shows it, under the database's own names. */
type ApplicationInvoiceRow = {
	id: string;
	/** The human number on the invoice, such as `delftmun-2026-0031`. */
	number: string;
	status: InvoiceStatus;
	amount_cents: number;
	/** A three-letter ISO 4217 code, such as `EUR`. */
	currency: string;
};

/**
 * The newest invoice raised for this seat, or `null` when there is none.
 *
 * A conference that charges nothing raises no invoice, so "none" is an ordinary
 * answer, and a refused query is answered the same way for the same reason as
 * the seat above.
 */
export async function findInvoiceForSeat(
	supabase: SupabaseClient,
	seatId: string
): Promise<MyApplicationInvoice | null> {
	const { data, error } = await supabase
		.from('invoices')
		.select('id, number, status, amount_cents, currency')
		.eq('seat_id', seatId)
		// Newest first, and only the first one is asked for. A seat can carry more
		// than one invoice: `revoke_seat` voids an invoice without clearing its
		// `seat_id`, so a seat that was taken away and given again has the voided
		// one and the new one both pointing at it. Without this order `maybeSingle`
		// would answer with an error, which this function reads as "no invoice" and
		// the page would then show none at all.
		.order('created_at', { ascending: false })
		.limit(1)
		.maybeSingle()
		.overrideTypes<ApplicationInvoiceRow, { merge: false }>();

	if (error || !data) {
		return null;
	}

	return {
		id: data.id,
		number: data.number,
		status: data.status,
		amountCents: data.amount_cents,
		currency: data.currency
	};
}

/**
 * Everything the applicant's own page at `/applications/[applicationId]` shows,
 * gathered in one call.
 *
 * `null` means there is no application with that id that belongs to this
 * person, and the page turns that into a 404 whichever of the two it was.
 *
 * The application has to be found first, because everything else is looked up
 * by what it holds: the questions by its conference, the committee names by its
 * preferences, and the seat by its own id.
 */
export async function getMyApplication(
	supabase: SupabaseClient,
	applicationId: string,
	userId: string
): Promise<MyApplicationPage | null> {
	const { data, error } = await supabase
		.from('applications')
		.select(`${APPLICATION_COLUMNS}, conferences!inner(${APPLICATION_CONFERENCE_COLUMNS})`)
		.eq('id', applicationId)
		.eq('user_id', userId)
		.maybeSingle()
		.overrideTypes<ApplicationWithConferenceRow, { merge: false }>();

	// A malformed id is refused by Postgres rather than simply not found. It can
	// only come from an address somebody typed or edited by hand, and it names
	// nothing, so the page answers 404 like any other id it cannot find.
	if (error?.code === INVALID_ID_CODE) {
		return null;
	}

	if (error) {
		throw new Error(`Could not load the application: ${error.message}`);
	}

	if (!data) {
		return null;
	}

	const application = toMyApplication(data);
	const conference = toApplicationConference(data.conferences);

	// None of these three needs another's answer, so all three are sent at once
	// and the page waits for the slowest of them rather than for the sum.
	const [questions, committeeNames, seatRow] = await Promise.all([
		listApplicationQuestions(supabase, application.conferenceId),
		listPreferredCommitteeNames(supabase, application.committeePreferences),
		findSeatForApplication(supabase, applicationId)
	]);

	// The invoice is found by the seat's id, so it cannot be asked for until the
	// seat has answered, and not at all when there is no seat. It is a second
	// small wave rather than an `invoices(...)` embed on the seat query because
	// the two rows answer to two different policies — the seat to the
	// conference's participants and staff, the invoice to the payer, the
	// delegation head and the organisers — and two named lookups say which of the
	// two came back where one nested list would leave a reader guessing.
	const invoice = seatRow === null ? null : await findInvoiceForSeat(supabase, seatRow.id);

	let seat: MyApplicationSeat | null = null;

	if (seatRow !== null) {
		seat = {
			seatName: seatRow.name,
			committeeName: seatRow.committees.name,
			committeeSlug: seatRow.committees.slug,
			countryCode: seatRow.country_code
		};
	}

	return { application, conference, questions, committeeNames, seat, invoice };
}

/**
 * Write the applicant's answers, as a draft or as a submitted application, and
 * answer with the id of the row.
 *
 * Almost every line of this is a rule somebody has to know.
 *
 * `submitted_at` is deliberately absent. `guard_application_update` refuses a
 * change to it from a browser and sets it itself whenever the status moves, so
 * a page that sent one would simply be turned away. Submitting stamps the
 * column and saving a draft again clears it, without either page saying so.
 *
 * `onConflict` names the `unique (conference_id, user_id)` index on the table.
 * That index is also what makes a second tab's stray insert a conflict this
 * update settles rather than a second application for the same person.
 *
 * The insert policy checks that the conference is published, accepts individual
 * applications and is inside its own window, so the database asks the same
 * question `canApply` in `$lib/applications.ts` asks on the page. A window that
 * closed while somebody was typing is refused here even though the page let
 * them press the button.
 */
export async function upsertApplication(
	supabase: SupabaseClient,
	conferenceId: string,
	userId: string,
	status: 'draft' | 'submitted',
	input: ApplicationInput
): Promise<string> {
	const { data, error } = await supabase
		.from('applications')
		.upsert(
			{
				conference_id: conferenceId,
				user_id: userId,
				status,
				committee_preferences: input.committeePreferences,
				seat_preferences: input.seatPreferences,
				motivation: input.motivation,
				answers: input.answers
			},
			{ onConflict: 'conference_id,user_id' }
		)
		// Ask for the id of the saved row back, as a single object rather than a list.
		.select('id')
		.single();

	if (error) {
		throw new Error(`Could not save your application: ${error.message}`);
	}

	const row: { id: string } = data;

	return row.id;
}

/**
 * Withdraw an application, and answer whether it really went.
 *
 * `false` means no row came back, which means the status moved between the page
 * being drawn and the button being pressed: an organiser decided it, or another
 * tab withdrew it already. The page turns that into "This application can no
 * longer be withdrawn." rather than an error.
 *
 * The `in(...)` is not the guard. The update policy and
 * `guard_application_update` are what really refuse every other move, and they
 * would refuse this one with a message from the database. The condition is here
 * so that "no longer possible" arrives as an answer the page can word, because
 * a row that does not match is quietly not updated and nothing comes back.
 * Asking for `.select('id')` is what tells "nothing matched" from "it worked",
 * the way `deleteFee` in `./fees.ts` does.
 */
export async function withdrawApplication(
	supabase: SupabaseClient,
	applicationId: string
): Promise<boolean> {
	const { data, error } = await supabase
		.from('applications')
		.update({ status: 'withdrawn' })
		.eq('id', applicationId)
		.in('status', ['submitted', 'waitlisted'])
		.select('id')
		.overrideTypes<{ id: string }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not withdraw the application: ${error.message}`);
	}

	const withdrawn: { id: string }[] = data ?? [];

	return withdrawn.length > 0;
}

/**
 * Throw away a draft, and answer whether it really went.
 *
 * The delete policy is "self while `draft`", so a draft somebody submitted in
 * another tab a moment ago is no longer theirs to delete and simply does not
 * match. `false` is that, and it is not an error: the page says so in words and
 * shows the application as it now stands.
 */
export async function deleteDraftApplication(
	supabase: SupabaseClient,
	applicationId: string
): Promise<boolean> {
	const { data, error } = await supabase
		.from('applications')
		.delete()
		.eq('id', applicationId)
		.eq('status', 'draft')
		.select('id')
		.overrideTypes<{ id: string }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not delete the draft: ${error.message}`);
	}

	const deleted: { id: string }[] = data ?? [];

	return deleted.length > 0;
}

/**
 * The conference columns the list at `/applications` brings along with each
 * application.
 *
 * Fewer than `APPLICATION_CONFERENCE_COLUMNS` at the top of the file asks for:
 * a row in a list names its conference, says when it runs and when its window
 * shuts, and needs none of the settings the apply form reads.
 */
const APPLICATION_LIST_CONFERENCE_COLUMNS =
	'conferences!inner(id, slug, name, logo_path, banner_path, start_date, end_date, timezone, status, applications_close_at, city, venue_name, location_mode, organizations(name))';

/** One `conferences` row as the list reads it, under the database's own names. */
type ApplicationListConferenceRow = {
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

/** One row of the list: an application with the conference it belongs to brought along. */
type MyApplicationListRow = {
	id: string;
	status: ApplicationStatus;
	/** ISO timestamps. `submitted_at` is `null` while the application is a draft. */
	submitted_at: string | null;
	updated_at: string;
	/**
	 * One object rather than a list, because an application belongs to exactly
	 * one conference. `conferences!inner(...)` in the select asks for it that way
	 * round and, more importantly, makes the conference part of the match: an
	 * application whose conference could not be read comes back as no row at all
	 * rather than as one with nothing to name it.
	 *
	 * The `conferences` select policy shows a signed-in reader `published` and
	 * `archived` conferences only, so an application at a conference the
	 * organisers have put back to `draft` drops off this list, the same way
	 * `getMyApplication` above answers `null` for it. It does not drop off
	 * quietly: `./unpublished-conference-applications.ts` counts the rows missing
	 * this way and `/applications` says how many there are (T112).
	 */
	conferences: ApplicationListConferenceRow;
};

/** Turn the conference a list row carries into the shape the list uses. */
function toApplicationListConference(row: ApplicationListConferenceRow): ApplicationListConference {
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

/**
 * These ids cut into lists of at most `ID_LOOKUP_BATCH_SIZE`, so that every
 * lookup asks a question the server will answer in full.
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

/** One row of the list's seat lookup: the seat, with the committee it is in brought along. */
type ApplicationListSeatRow = {
	application_id: string;
	name: string;
	/**
	 * An ISO two-letter country code, or `null` for a seat that is not a country, such as "Press".
	 */
	country_code: string | null;
	/**
	 * One object rather than a list, because a seat belongs to one committee, and
	 * the same query can bring it along because `seats.committee_id` really is a
	 * foreign key to `committees`. `readSeatLabels` in `./application-table.ts`
	 * says the same thing.
	 */
	committees: { name: string; abbreviation: string | null };
};

/**
 * The seat each of these applications won, by application id.
 *
 * An application that has won none is simply not in the map, which is the
 * ordinary case for every row that is not accepted.
 *
 * A failed query raises here, unlike `findSeatForApplication` above which reads
 * a refusal as "no seat": a seat that exists but could not be read would turn
 * an accepted row into one with nothing under it, and "you were given nothing"
 * is a worse answer than an error page.
 */
async function readApplicationListSeats(
	supabase: SupabaseClient,
	applicationIds: string[]
): Promise<Map<string, ApplicationListSeat>> {
	const seats = new Map<string, ApplicationListSeat>();

	// Nothing to look up, and `.in('application_id', [])` would be a request that
	// cannot match anything, the way `readSeatLabels` in `./application-table.ts`
	// skips one too.
	if (applicationIds.length === 0) {
		return seats;
	}

	// A hundred ids at a time, the way the export's lookups in
	// `./application-table.ts` ask. One
	// application wins at most one seat, so a batch can never answer with more
	// rows than `max_rows` allows, and the address stays a length the server takes.
	for (const batch of idBatches(applicationIds)) {
		const { data, error } = await supabase
			.from('seats')
			.select('application_id, name, country_code, committees!inner(name, abbreviation)')
			.in('application_id', batch)
			.overrideTypes<ApplicationListSeatRow[], { merge: false }>();

		if (error) {
			throw new Error(`Could not read your seats: ${error.message}`);
		}

		for (const row of data ?? []) {
			seats.set(row.application_id, {
				seatName: row.name,
				committeeHeading: committeeHeading(row.committees),
				countryCode: row.country_code
			});
		}
	}

	return seats;
}

/**
 * How many of this person's applications one query of their list asks for.
 *
 * Nobody applies to five hundred conferences, so in practice the first window
 * is the whole list and the second comes back empty. It is a window all the
 * same because `max_rows` in `supabase/config.toml` would otherwise cut the
 * list off at a thousand without saying so.
 */
const MY_APPLICATION_READ_BATCH_SIZE = 500;

/**
 * Every application this person has written, with its conference along,
 * newest change first, however many there are.
 *
 * PostgREST answers with at most `max_rows` rows whatever is asked of it, so
 * this asks for a window at a time and moves it along by the rows that really
 * came back until one comes back empty, for the reason `readApplicationsForExport`
 * in `./application-table.ts` gives. The id comes last in the order so that two applications changed
 * in the same instant cannot swap places between two windows.
 */
async function readMyApplicationListRows(
	supabase: SupabaseClient,
	userId: string
): Promise<MyApplicationListRow[]> {
	const applications: MyApplicationListRow[] = [];
	let firstIndex = 0;

	while (true) {
		const { data, error } = await supabase
			.from('applications')
			.select(`id, status, submitted_at, updated_at, ${APPLICATION_LIST_CONFERENCE_COLUMNS}`)
			// Written by hand rather than left to Row Level Security, for the reason at
			// the top of this file: the select policy is "self; org.", so without this
			// an organiser would read their conference's applications here as well.
			.eq('user_id', userId)
			// Newest change first, which is the order `05-pages/delegate/applications.md`
			// asks the query for. The page sorts the rows again by conference start date
			// once it has merged them with the delegation memberships, so this order
			// decides what a row means to the query and never how the list is drawn.
			.order('updated_at', { ascending: false })
			.order('id', { ascending: false })
			.range(firstIndex, firstIndex + MY_APPLICATION_READ_BATCH_SIZE - 1)
			// Replaces Supabase's guess at the row's shape with ours. It has to come last.
			.overrideTypes<MyApplicationListRow[], { merge: false }>();

		// The window starts past the last row, which is the end of the list.
		if (error?.code === PAGE_OUT_OF_RANGE_CODE) {
			return applications;
		}

		if (error) {
			throw new Error(`Could not list your applications: ${error.message}`);
		}

		const batch: MyApplicationListRow[] = data ?? [];

		if (batch.length === 0) {
			return applications;
		}

		applications.push(...batch);
		firstIndex = firstIndex + batch.length;
	}
}

/**
 * Every application this person has written, for the list at `/applications`.
 *
 * The applications with their conferences first, and then the seats of all of
 * those applications, a hundred at a time. Both halves read in windows, so a
 * list longer than `max_rows` in `supabase/config.toml` arrives whole rather
 * than quietly short.
 */
export async function listMyApplications(
	supabase: SupabaseClient,
	userId: string
): Promise<MyApplicationListItem[]> {
	const rows = await readMyApplicationListRows(supabase, userId);
	const applicationIds = rows.map((row) => row.id);
	const seats = await readApplicationListSeats(supabase, applicationIds);

	return rows.map((row) => ({
		id: row.id,
		status: row.status,
		submittedAt: row.submitted_at,
		updatedAt: row.updated_at,
		conference: toApplicationListConference(row.conferences),
		seat: seats.get(row.id) ?? null
	}));
}

/**
 * Whether this person has taken part anywhere yet: at least one application,
 * in any state, or a membership of a delegation. The top bar asks, because
 * `03-design/app-shell.md` shows its "Applications" link only then; for
 * anybody else `/applications` would be an empty list (streamlining principle
 * P7).
 *
 * Both lookups filter on `user_id` themselves, for the reason at the top of
 * this file: an organiser may read their conference's applications and
 * delegation members too, and those are not *their* applications.
 *
 * Both ask for one column of at most one row, because the answer is only "is
 * there anything", and this runs on every signed-in page through the root
 * layout. A failed lookup counts as "found nothing", as `hasOrganiserArea` in
 * `./manage.ts` explains: the worst a wrong `false` does is hide one link.
 */
export async function hasApplications(supabase: SupabaseClient, userId: string): Promise<boolean> {
	// Neither needs the other's answer, so both are sent at once.
	const [applicationAnswer, membershipAnswer] = await Promise.all([
		supabase.from('applications').select('id').eq('user_id', userId).limit(1),
		supabase.from('delegation_members').select('user_id').eq('user_id', userId).limit(1)
	]);

	const hasApplication = (applicationAnswer.data ?? []).length > 0;
	const isDelegationMember = (membershipAnswer.data ?? []).length > 0;

	return hasApplication || isDelegationMember;
}

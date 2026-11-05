/**
 * Where the home dashboard gets its data.
 *
 * Files under `$lib/server` only ever run on the server, so this is where the
 * database is queried. Like the other modules here, every function takes the
 * Supabase client as its first argument. The page passes in `locals.supabase`,
 * the client that knows who is signed in, so the database's Row Level Security
 * rules decide what comes back.
 *
 * `docs/home.md` ("Your next conference") is the contract. The shapes these
 * queries fill in live in `$lib/home.ts`, which the browser reads as well; the
 * cards the hero and the "Also coming up" rows are drawn from are worked out
 * by `$lib/upcoming-conferences.ts`, and the "To do" list by `$lib/tasks.ts`,
 * both from rows read here.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
	mergeIntoApplicationList,
	withoutPastConferences,
	type ApplicationListConference,
	type ApplicationListEntry,
	type ApplicationStatus,
	type MyApplicationListItem,
	type MyDelegationListItem
} from '$lib/applications';
import { committeeHeading, hasConferenceFinished } from '$lib/committees';
import type { Conference, ConferenceStatus, LocationMode } from '$lib/conferences';
import {
	EXPLORE_CONFERENCE_LIMIT,
	MY_APPLICATION_LIMIT,
	UPCOMING_EVENT_LIMIT,
	type HomeDashboard,
	type UpcomingEvent
} from '$lib/home';
import {
	isRunningToday,
	todayItems,
	type TodayConference,
	type TodayDelegation,
	type TodayItem
} from '$lib/home-today';
import { isQuickSession, type ConferenceKind } from '$lib/my-quick-sessions';
import type { ExperienceLevel, ProfileFieldsToCheck } from '$lib/profiles';
import { publishChecklistItems } from '$lib/publish-checklist';
import {
	deriveTasks,
	setupStepCounts,
	type ChairedCommitteePapers,
	type DelegationWithEmptySeats,
	type HomeTask,
	type ManagedConferenceFacts,
	type PositionPaperSeat,
	type UnpaidInvoice,
	type WaitingApplications
} from '$lib/tasks';
import {
	upcomingConferences,
	type PositionPaperState,
	type UpcomingCommitteeRole,
	type UpcomingConferenceCard,
	type UpcomingConferenceFacts,
	type UpcomingConferenceSource,
	type UpcomingDelegation,
	type UpcomingOrganisedConference
} from '$lib/upcoming-conferences';
import { listMyApplications } from './applications';
import {
	countConferencesOpenForApplications,
	listConferencesToExplore,
	listManagedConferences
} from './conferences';
import { listMyDelegationMemberships } from './delegations';
import { listHomeAnnouncements } from './home-announcements';
import { readTodayFacts, type CommitteeOfToday, type TodayParts } from './home-today';
import { readChecklistCounts, type ChecklistCountsById } from './manage';
import { readSeatsOnOffer } from './manage-list';
import { listMyQuickSessions, type QuickSessionCommittee } from './my-quick-sessions';

/**
 * The conference a committee belongs to, as both committee lookups bring it
 * along.
 *
 * `null` means Row Level Security withheld the row. A committee's conference can
 * be withheld even though the committee itself came back: a draft is readable
 * only by the people running it.
 *
 * `banner_path`, `city`, `venue_name` and `location_mode` are what the hero
 * and a conference row draw beside the name: the organiser's photograph and
 * the place. `start_date` and `end_date` say whether the conference runs
 * today or is over, `status` whether the organisers have cancelled it (which
 * is the `archived` status), and `kind` whether it is a quick session, which
 * only "Quick sessions" lists (S14). The last two columns are the position
 * paper rule's in `$lib/tasks.ts`: whether this conference asks its delegates
 * for a paper, and when it wants it.
 */
type EmbeddedConference = {
	id: string;
	kind: ConferenceKind;
	slug: string;
	name: string;
	status: ConferenceStatus;
	banner_path: string | null;
	start_date: string;
	end_date: string;
	timezone: string;
	city: string | null;
	venue_name: string | null;
	location_mode: LocationMode;
	position_paper_required: boolean;
	position_paper_deadline: string | null;
};

/** The committee a seat or a chair row belongs to, brought along the same way. */
type EmbeddedCommittee = {
	id: string;
	slug: string;
	name: string;
	abbreviation: string | null;
	conferences: EmbeddedConference | null;
};

/** A committee row whose conference came back too, so there is something to name and link to. */
type ReadableCommittee = EmbeddedCommittee & { conferences: EmbeddedConference };

/** One row of the seat lookup: the seat itself, with its committee attached. */
type MySeatRow = {
	id: string;
	name: string;
	/**
	 * An ISO two-letter country code, or `null` for a seat that is not a country, such as "Press".
	 */
	country_code: string | null;
	committees: EmbeddedCommittee | null;
};

/**
 * One row of the chair lookup: the chair's title, with the committee attached.
 *
 * `title` is never missing. `committee_chairs.title` is `not null default 'Chair'`, so a
 * row that says nothing about it already says "Chair", which is why the page shows the
 * column itself rather than a word of its own: a vice chair then reads as one.
 */
type MyChairRow = {
	title: string;
	committees: EmbeddedCommittee | null;
};

/**
 * The committee, and the conference it belongs to, that both lookups below ask
 * for: enough to name each of them, to link to them, to say where and when the
 * conference is, and to know what it asks of a delegate.
 *
 * `committees(...)` and `conferences(...)` follow a foreign key into another
 * table and bring the row it points at along. Each of them points at exactly one
 * row, so Supabase answers with one object rather than with a list, which is why
 * the row types above nest an object and not an array.
 */
const MY_COMMITTEE_COLUMNS =
	'committees(id, slug, name, abbreviation, conferences(id, kind, slug, name, status, banner_path, start_date, end_date, timezone, city, venue_name, location_mode, position_paper_required, position_paper_deadline))';

/** What the seat lookup asks for: the seat itself and the committee it is in. */
const MY_SEAT_COLUMNS = `id, name, country_code, ${MY_COMMITTEE_COLUMNS}`;

/** What the chair lookup asks for: the chair's title and the committee they chair. */
const MY_CHAIR_COLUMNS = `title, ${MY_COMMITTEE_COLUMNS}`;

/**
 * One row of the memberships lookup: the organisation itself, not only its id.
 *
 * Whether Stripe is connected belongs to the organisation, and the "Publish
 * {conference}" task needs it, because the publish checklist has a "Connect
 * Stripe" line whenever the conference charges for anything through MUNMeet.
 * `null` means Row Level Security withheld the organisation.
 */
type MembershipRow = {
	organizations: {
		id: string;
		slug: string;
		stripe_onboarding_completed_at: string | null;
	} | null;
};

/**
 * A conference as the staff lookup brings it along: enough to know whether it
 * runs today or is over, what a volunteer's card says and shows, and whether
 * it is a quick session, which the page leaves out (S14).
 */
type StaffConferenceRow = {
	id: string;
	kind: ConferenceKind;
	slug: string;
	name: string;
	status: ConferenceStatus;
	banner_path: string | null;
	start_date: string;
	end_date: string;
	timezone: string;
	city: string | null;
	venue_name: string | null;
	location_mode: LocationMode;
};

/**
 * One row of the staff lookup. `conferences` is `null` when Row Level Security
 * withheld the conference.
 */
type StaffQueryRow = {
	conference_id: string;
	conferences: StaffConferenceRow | null;
};

/**
 * One row of the role lookup: which conference, and what the role grants. The
 * role comes along because `role_id` points at `conference_roles`, which is
 * the kind of join PostgREST can make.
 */
type RoleMembershipRow = {
	conference_id: string;
	conference_roles: { permissions: string[]; scope: 'conference' | 'committees' } | null;
};

/**
 * A staff row with what the reader is there worked out from their roles. A
 * staff row no longer says that itself (`docs/roles-and-permissions.md`):
 * somebody is an organiser of a conference when a conference-wide role of
 * theirs holds `administrator`, and a volunteer when they are neither that nor
 * a chair of one of its committees.
 */
type StaffRow = StaffQueryRow & {
	isAdministrator: boolean;
	isVolunteer: boolean;
};

/** One row of the "which delegations do I head" lookup. */
type HeadMembershipRow = { delegation_id: string };

/** One row of the profile lookup: the four fields an organiser needs filled in. */
type ProfileRow = {
	full_name: string;
	institution_name: string | null;
	country_code: string | null;
	experience_level: ExperienceLevel;
};

/**
 * One row of the unpaid invoices lookup, with its conference attached: the
 * task names the conference beside the amount, and the due date is a day where
 * the conference is.
 */
type InvoiceRow = {
	id: string;
	number: string;
	due_at: string | null;
	amount_cents: number;
	currency: string;
	conference_id: string;
	conferences: { name: string; timezone: string } | null;
};

/** One row of the position paper lookup: which seat already has a paper. */
type PositionPaperRow = { seat_id: string | null };

/** One row of the waiting papers lookup: the committee a paper awaiting review belongs to. */
type WaitingPaperRow = { committee_id: string | null };

/** One row of the delegation seats lookup: whose seat, and whether anybody sits in it yet. */
type DelegationSeatRow = {
	delegation_id: string | null;
	user_id: string | null;
};

/** How many seats a delegation holds, and how many of them nobody sits in yet. */
type DelegationSeatCounts = {
	seatCount: number;
	emptySeatCount: number;
};

/** A delegation the seats lookup brought nothing back for. */
const NO_SEATS: DelegationSeatCounts = { seatCount: 0, emptySeatCount: 0 };

/** One row of the waiting applications lookup: which conference, and when it was sent. */
type WaitingApplicationRow = {
	conference_id: string;
	submitted_at: string | null;
};

/** How many applications wait for a decision at one conference, and since when. */
type WaitingApplicationCount = {
	count: number;
	/** An ISO timestamp, or `null` when none of them says when it was sent. */
	oldestSubmittedAt: string | null;
};

/** A conference nobody has applied to. */
const NOBODY_WAITING: WaitingApplicationCount = { count: 0, oldestSubmittedAt: null };

/** One row of the programme lookup, with the conference it belongs to attached. */
type ScheduleEventRow = {
	id: string;
	title: string;
	starts_at: string;
	ends_at: string;
	location: string | null;
	conferences: { name: string; slug: string; timezone: string } | null;
};

/** Every id in the list once, in the order they first appear. */
function uniqueIds(ids: string[]): string[] {
	// A Set removes the duplicates and the spread turns it back into an array.
	return [...new Set(ids)];
}

/**
 * Whether a committee and its conference were both read.
 *
 * Row Level Security can withhold either: a committee of a draft conference
 * the reader is not staff of comes back as `null`, and so can the conference
 * on its own. A row with no conference has no name to put beside the committee
 * and nothing to link to, so every list below leaves it out rather than
 * showing it half empty.
 */
function isReadable(committee: EmbeddedCommittee | null): committee is ReadableCommittee {
	return committee !== null && committee.conferences !== null;
}

/**
 * Whether a conference, as a lookup here brings its row along, is over: its
 * last day is behind today where it is held, or the organisers have cancelled
 * it, which is the `archived` status.
 *
 * The page is about what is next. A seat, a chair, a staff row or a delegation
 * at a conference that is over gives no task, because a task is pressing the
 * moment it is overdue and would take the page's one button for something
 * nobody can act on any more; and the programme and announcements are read for
 * the conferences that have not ended, not for every conference the reader was
 * ever at. Both rules are this one test, so they cannot disagree. An unpaid
 * invoice is the one exception: money owed is owed whether or not the
 * conference is over, so `readMyUnpaidInvoices` does not ask.
 *
 * The rule itself is `hasConferenceFinished` in `$lib/committees.ts`, which
 * `/committees` and `/applications` hide their past rows with; this only
 * reads it off a row under the database's own column names.
 */
export function hasConferenceRowEnded(
	conference: { end_date: string; timezone: string; status: ConferenceStatus },
	now: Date
): boolean {
	return hasConferenceFinished(
		{
			endDate: conference.end_date,
			timezone: conference.timezone,
			isArchived: conference.status === 'archived'
		},
		now
	);
}

/**
 * Whether a seat's or a chair's committee is at a conference that is over.
 * A row whose committee or conference was withheld is not: nothing says when
 * it ends, and every list below leaves such a row out in any case.
 */
function isAtConferenceOver(row: { committees: EmbeddedCommittee | null }, now: Date): boolean {
	return isReadable(row.committees) && hasConferenceRowEnded(row.committees.conferences, now);
}

/**
 * The organisations this person is a member of, with the one fact about each
 * that the publish checklist needs.
 */
async function readMyOrganizations(
	supabase: SupabaseClient,
	userId: string
): Promise<MembershipRow[]> {
	const { data, error } = await supabase
		.from('organization_members')
		.select('organizations(id, slug, stripe_onboarding_completed_at)')
		.eq('user_id', userId)
		// Supabase guesses the shape of a row from the text in `select`, and its
		// guess types every column as possibly missing. This replaces the guess
		// with our own row type, the way `$lib/server/conferences.ts` does. It has
		// to come last.
		.overrideTypes<MembershipRow[], { merge: false }>();

	// A failed query means a bug (a wrong column name, a missing policy), not
	// something the reader can fix. Throwing shows SvelteKit's error page, and the
	// real message ends up in the server log. Every lookup in this file does the
	// same: the dashboard is all or nothing, because a page that quietly said
	// "nothing to do" would hide the bug.
	if (error) {
		throw new Error(`Could not list your organisations: ${error.message}`);
	}

	return data ?? [];
}

/**
 * The conferences this person is on the team of, with the conference itself.
 *
 * Every staff row comes back, a chair's too: which of them count as helping
 * run the conference and which as volunteering is worked out afterwards by
 * `describeStaffRows`, from the reader's roles and the chair lookup below.
 */
async function readMyStaffRows(supabase: SupabaseClient, userId: string): Promise<StaffQueryRow[]> {
	const { data, error } = await supabase
		.from('conference_staff')
		.select(
			'conference_id, conferences(id, kind, slug, name, status, banner_path, start_date, end_date, timezone, city, venue_name, location_mode)'
		)
		.eq('user_id', userId)
		.overrideTypes<StaffQueryRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not list the conferences you help at: ${error.message}`);
	}

	return data ?? [];
}

/** The roles this person holds on every conference, one row per role. */
async function readMyRoleMemberships(
	supabase: SupabaseClient,
	userId: string
): Promise<RoleMembershipRow[]> {
	const { data, error } = await supabase
		.from('conference_role_members')
		.select('conference_id, conference_roles(permissions, scope)')
		.eq('user_id', userId)
		.overrideTypes<RoleMembershipRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not list your roles: ${error.message}`);
	}

	return data ?? [];
}

/**
 * Each staff row with what the reader is there (see `StaffRow`). Only the
 * organiser rows count as helping run a conference, and only the volunteer
 * rows feed the "Today" items' volunteering line; a chair's row is neither,
 * because their committee already comes from the chair lookup.
 */
function describeStaffRows(
	staffRows: StaffQueryRow[],
	roleMemberships: RoleMembershipRow[],
	chairRows: MyChairRow[]
): StaffRow[] {
	const administeredConferenceIds = new Set<string>();

	for (const membership of roleMemberships) {
		const role = membership.conference_roles;

		if (
			role !== null &&
			role.scope === 'conference' &&
			role.permissions.includes('administrator')
		) {
			administeredConferenceIds.add(membership.conference_id);
		}
	}

	const chairedConferenceIds = new Set<string>();

	for (const row of chairRows) {
		const conferenceId = row.committees?.conferences?.id;

		if (conferenceId !== undefined) {
			chairedConferenceIds.add(conferenceId);
		}
	}

	return staffRows.map((row) => {
		const isAdministrator = administeredConferenceIds.has(row.conference_id);

		return {
			...row,
			isAdministrator,
			isVolunteer: !isAdministrator && !chairedConferenceIds.has(row.conference_id)
		};
	});
}

/** The seats this person holds, each with its committee and that committee's conference. */
async function readMySeatRows(supabase: SupabaseClient, userId: string): Promise<MySeatRow[]> {
	const { data, error } = await supabase
		.from('seats')
		.select(MY_SEAT_COLUMNS)
		.eq('user_id', userId)
		.overrideTypes<MySeatRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not list the committees you sit in: ${error.message}`);
	}

	return data ?? [];
}

/** The committees this person chairs, each with that committee's conference. */
async function readMyChairRows(supabase: SupabaseClient, userId: string): Promise<MyChairRow[]> {
	const { data, error } = await supabase
		.from('committee_chairs')
		.select(MY_CHAIR_COLUMNS)
		.eq('user_id', userId)
		.overrideTypes<MyChairRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not list the committees you chair: ${error.message}`);
	}

	return data ?? [];
}

/**
 * The ids of the delegations this person is a head of.
 *
 * Only a head assigns seats, which is what the task the ids feed asks for, so
 * an ordinary member's row is left out here rather than filtered afterwards.
 */
async function readMyHeadDelegationIds(
	supabase: SupabaseClient,
	userId: string
): Promise<string[]> {
	const { data, error } = await supabase
		.from('delegation_members')
		.select('delegation_id')
		.eq('user_id', userId)
		.eq('role', 'head')
		.overrideTypes<HeadMembershipRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not list the delegations you lead: ${error.message}`);
	}

	const rows: HeadMembershipRow[] = data ?? [];

	return rows.map((row) => row.delegation_id);
}

/** An optional column as the plain text `profileCompleteness` expects. */
function textOrEmpty(value: string | null): string {
	return value ?? '';
}

/**
 * The four profile fields the "Complete your profile" task asks about.
 *
 * `getMyProfile` in `./profiles.ts` reads the whole profile and its details in
 * two queries. This one asks for four columns of one table, because that is the
 * whole of the question the task rule has.
 *
 * There is always a row: `requireOnboarded` has already read this person's
 * profile before `load` gets here, so a missing one means something is wrong
 * rather than that this person has not filled anything in.
 */
async function readMyProfileFields(
	supabase: SupabaseClient,
	userId: string
): Promise<ProfileFieldsToCheck> {
	const { data, error } = await supabase
		.from('profiles')
		.select('full_name, institution_name, country_code, experience_level')
		.eq('id', userId)
		.overrideTypes<ProfileRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read your profile: ${error.message}`);
	}

	const row = data?.[0];

	if (row === undefined) {
		throw new Error('Could not read your profile: there is no profile row for you.');
	}

	// `institution_name` and `country_code` may be empty in the database, and
	// `profileCompleteness` asks its question of plain text, so an absent column
	// arrives as the empty string it means.
	return {
		fullName: row.full_name,
		institutionName: textOrEmpty(row.institution_name),
		countryCode: textOrEmpty(row.country_code),
		experienceLevel: row.experience_level
	};
}

/**
 * The invoices this person still owes money on, whatever the conference's
 * dates: money owed from a conference that is over is still owed, and
 * `docs/home.md` makes such a bill the hero's next step (section 4, rule 2).
 * Every other task stops with its conference; see `hasConferenceRowEnded`.
 *
 * `payer_user_id` is written by hand rather than left to Row Level Security: a
 * delegation head reads the whole group's invoices and an organiser reads their
 * conference's, and neither of those is a bill the reader has to pay.
 */
async function readMyUnpaidInvoices(
	supabase: SupabaseClient,
	userId: string
): Promise<UnpaidInvoice[]> {
	const { data, error } = await supabase
		.from('invoices')
		.select(
			'id, number, due_at, amount_cents, currency, conference_id, conferences(name, timezone)'
		)
		.eq('payer_user_id', userId)
		.eq('status', 'unpaid')
		.overrideTypes<InvoiceRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not list your invoices: ${error.message}`);
	}

	const invoices: UnpaidInvoice[] = [];

	for (const row of data ?? []) {
		// A conference that could not be read leaves the task with no name to put
		// beside the amount and no zone to date it in, so it is left out rather
		// than drawn half empty. `listUpcomingEvents` below follows the same rule.
		if (row.conferences === null) {
			continue;
		}

		invoices.push({
			id: row.id,
			number: row.number,
			conferenceId: row.conference_id,
			conferenceName: row.conferences.name,
			amountCents: row.amount_cents,
			currency: row.currency,
			dueAt: row.due_at,
			conferenceTimezone: row.conferences.timezone
		});
	}

	return invoices;
}

/**
 * The ids of the seats among these whose position paper is in: handed in and
 * waiting for the chair, or approved. A paper the chair sent back for changes
 * is owed again, so its seat is not among them and the paper stays a task.
 *
 * The delegate sitting in a seat may read that seat's paper, which is the
 * policy this leans on; asking for the seat id alone is the whole question.
 */
async function readSeatIdsWithPositionPapers(
	supabase: SupabaseClient,
	seatIds: string[]
): Promise<Set<string>> {
	// An empty list would have to be written as `in.()`, which PostgREST refuses,
	// and somebody with no seat has no paper to look for.
	if (seatIds.length === 0) {
		return new Set();
	}

	const { data, error } = await supabase
		.from('documents')
		.select('seat_id')
		.eq('kind', 'position_paper')
		.in('review_status', ['submitted', 'approved'])
		.in('seat_id', seatIds)
		.overrideTypes<PositionPaperRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read your position papers: ${error.message}`);
	}

	const withPapers = new Set<string>();

	for (const row of data ?? []) {
		if (row.seat_id !== null) {
			withPapers.add(row.seat_id);
		}
	}

	return withPapers;
}

/**
 * How many position papers of each of these committees wait for a review,
 * by committee id (T170). A paper waits while its `review_status` is
 * `submitted`: an approval or a changes request moves it on, and sending it in
 * again brings it back. A committee with none waiting is not in the map.
 *
 * The chair of a committee may read its papers, which is the policy this leans
 * on; the papers page reads them the same way.
 */
async function readWaitingPaperCounts(
	supabase: SupabaseClient,
	committeeIds: string[]
): Promise<Map<string, number>> {
	// An empty list would have to be written as `in.()`, which PostgREST refuses,
	// and somebody who chairs nothing has no papers to review.
	if (committeeIds.length === 0) {
		return new Map();
	}

	const { data, error } = await supabase
		.from('documents')
		.select('committee_id')
		.eq('kind', 'position_paper')
		.eq('review_status', 'submitted')
		.in('committee_id', committeeIds)
		.overrideTypes<WaitingPaperRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not count the papers waiting for your review: ${error.message}`);
	}

	const counts = new Map<string, number>();

	for (const row of data ?? []) {
		if (row.committee_id !== null) {
			counts.set(row.committee_id, (counts.get(row.committee_id) ?? 0) + 1);
		}
	}

	return counts;
}

/**
 * How many seats each of these delegations has, and how many of them nobody
 * is sitting in yet, by delegation id.
 *
 * The organisers allocate a delegation its seats and the head puts a member in
 * each one, so a seat with a `delegation_id` and no `user_id` is one the head
 * still has to assign. Both figures come from the one read: the hero says
 * "0 of 2 seats assigned" and the task "2 seats nobody holds yet".
 */
async function readDelegationSeatCounts(
	supabase: SupabaseClient,
	delegationIds: string[]
): Promise<Map<string, DelegationSeatCounts>> {
	const counts = new Map<string, DelegationSeatCounts>();

	if (delegationIds.length === 0) {
		return counts;
	}

	const { data, error } = await supabase
		.from('seats')
		.select('delegation_id, user_id')
		.in('delegation_id', delegationIds)
		.overrideTypes<DelegationSeatRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read your delegations' seats: ${error.message}`);
	}

	for (const row of data ?? []) {
		if (row.delegation_id === null) {
			continue;
		}

		// A fresh pair for each delegation, so the shared `NO_SEATS` is never counted on.
		const theirs = counts.get(row.delegation_id) ?? { seatCount: 0, emptySeatCount: 0 };

		theirs.seatCount += 1;

		if (row.user_id === null) {
			theirs.emptySeatCount += 1;
		}

		counts.set(row.delegation_id, theirs);
	}

	return counts;
}

/** Whether `moment` names an earlier instant than `other`; both are ISO timestamps. */
function isEarlier(moment: string, other: string): boolean {
	// The two are compared as moments rather than as text, because Postgres and
	// a test may spell the same instant with a different offset.
	return new Date(moment).getTime() < new Date(other).getTime();
}

/**
 * How many applications wait for a decision at each of these conferences,
 * and when the oldest of them was sent, by conference id. An application
 * waits while its status is `submitted`: accepting, waitlisting or turning
 * it down moves it on. A conference with none waiting is not in the map.
 *
 * Counted here rather than by the database, the way `readConferenceFigures`
 * in `./manage-list.ts` counts, so the hero's figure, the "Decide 4
 * applications" task and the `/manage` row all count the same rows. The
 * organisers of a conference may read its applications, which is the policy
 * this leans on.
 */
async function readWaitingApplications(
	supabase: SupabaseClient,
	conferenceIds: string[]
): Promise<Map<string, WaitingApplicationCount>> {
	const counts = new Map<string, WaitingApplicationCount>();

	// An empty list would have to be written as `in.()`, which PostgREST refuses,
	// and somebody who organises nothing has no applications to decide.
	if (conferenceIds.length === 0) {
		return counts;
	}

	const { data, error } = await supabase
		.from('applications')
		.select('conference_id, submitted_at')
		.eq('status', 'submitted')
		.in('conference_id', conferenceIds)
		.overrideTypes<WaitingApplicationRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not count the applications waiting for your decision: ${error.message}`);
	}

	for (const row of data ?? []) {
		// A fresh pair for each conference, so the shared `NOBODY_WAITING` is never counted on.
		const theirs = counts.get(row.conference_id) ?? { count: 0, oldestSubmittedAt: null };

		theirs.count += 1;

		if (
			row.submitted_at !== null &&
			(theirs.oldestSubmittedAt === null || isEarlier(row.submitted_at, theirs.oldestSubmittedAt))
		) {
			theirs.oldestSubmittedAt = row.submitted_at;
		}

		counts.set(row.conference_id, theirs);
	}

	return counts;
}

/**
 * How many of the seats on offer at this conference somebody holds, for the
 * organiser hero's "41 of 120 / seats held" figure, or `null` when there is no
 * conference to ask about.
 *
 * `readSeatsOnOffer` is the read the `/manage` rows count with, so the hero
 * and the row can never disagree about one conference. It is asked only for
 * the hero, in a wave of its own, because only a published conference the
 * reader organises has the figure, and nobody else pays for the question.
 */
async function readHeroSeats(
	supabase: SupabaseClient,
	conference: Conference | null
): Promise<HomeDashboard['heroSeats']> {
	if (conference === null) {
		return null;
	}

	const seats = await readSeatsOnOffer(supabase, [conference.id]);

	// A seat is held once somebody sits in it or a delegation is keeping it,
	// which is how `/manage` counts it too.
	const held = seats.filter((seat) => seat.user_id !== null || seat.delegation_id !== null);

	return { held: held.length, onOffer: seats.length };
}

/**
 * The hero conference when it is a published one the reader organises, which
 * is the one hero that counts its seats; `null` for every other reader.
 *
 * The hero is the first card. `managedConferences` says whether it is still
 * a draft, which the card itself does not carry.
 */
function heroConferenceToCountSeatsOf(
	cards: UpcomingConferenceCard[],
	managedConferences: Conference[]
): Conference | null {
	if (cards.length === 0 || cards[0].roleKind !== 'organiser') {
		return null;
	}

	const heroId = cards[0].id;
	const conference = managedConferences.find((managed) => managed.id === heroId);

	if (conference === undefined || conference.status !== 'published') {
		return null;
	}

	return conference;
}

/**
 * The next few events at the conferences this person takes part in or helps
 * run, soonest first. `conferenceIds` is `participatingConferenceIds`, which
 * `loadHomeDashboard` builds from every role the cards count, at the
 * conferences that have not ended.
 *
 * Which events of a conference somebody may read is Row Level Security's
 * decision and not this query's: `schedule_events` has one select policy per
 * audience, so an event meant for the team never reaches a delegate. The
 * `conference_id` filter is here all the same, because one of those policies
 * lets anybody read the public programme of any conference, and the
 * "Programme" section is about the conferences the reader is in rather than
 * every conference that publishes a programme.
 */
async function listUpcomingEvents(
	supabase: SupabaseClient,
	conferenceIds: string[],
	now: Date
): Promise<UpcomingEvent[]> {
	if (conferenceIds.length === 0) {
		return [];
	}

	const { data, error } = await supabase
		.from('schedule_events')
		.select('id, title, starts_at, ends_at, location, conferences(name, slug, timezone)')
		.in('conference_id', conferenceIds)
		.gte('starts_at', now.toISOString())
		.order('starts_at', { ascending: true })
		.limit(UPCOMING_EVENT_LIMIT)
		.overrideTypes<ScheduleEventRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read your upcoming events: ${error.message}`);
	}

	const events: UpcomingEvent[] = [];

	for (const row of data ?? []) {
		// A conference that could not be read leaves the event with no name beside
		// it and no timezone to show its time in, so it is left out rather than
		// drawn half empty. This is the rule `isReadable` above gives for a committee.
		if (row.conferences === null) {
			continue;
		}

		events.push({
			id: row.id,
			title: row.title,
			startsAt: row.starts_at,
			endsAt: row.ends_at,
			location: row.location,
			conferenceName: row.conferences.name,
			conferenceSlug: row.conferences.slug,
			conferenceTimezone: row.conferences.timezone
		});
	}

	return events;
}

/**
 * The seats the reader holds, as the position paper rule needs to see them.
 *
 * A chair is not in this list. `committee_chairs` rows carry no seat, and the
 * rule starts with "seat held": the paper is the delegate's piece of work, not
 * the chair's.
 */
function toPositionPaperSeats(
	seatRows: MySeatRow[],
	seatIdsWithPapers: Set<string>
): PositionPaperSeat[] {
	const seats: PositionPaperSeat[] = [];

	for (const row of seatRows) {
		const committee = row.committees;

		// With the committee or its conference withheld there is nothing to name
		// the task after and no deadline to show.
		if (!isReadable(committee)) {
			continue;
		}

		const conference = committee.conferences;

		seats.push({
			seatId: row.id,
			seatName: row.name,
			conferenceId: conference.id,
			conferenceSlug: conference.slug,
			conferenceName: conference.name,
			conferenceStartDate: conference.start_date,
			committeeSlug: committee.slug,
			committeeHeading: committeeHeading(committee),
			conferenceTimezone: conference.timezone,
			isPositionPaperRequired: conference.position_paper_required,
			positionPaperDeadline: conference.position_paper_deadline,
			hasPositionPaper: seatIdsWithPapers.has(row.id)
		});
	}

	return seats;
}

/**
 * The committees the reader chairs, each with its papers waiting for review.
 * A committee appears once even if the reader holds two chair rows in it.
 */
function toChairedCommitteePapers(
	chairRows: MyChairRow[],
	waitingCounts: Map<string, number>
): ChairedCommitteePapers[] {
	const committees: ChairedCommitteePapers[] = [];
	const seenCommitteeIds = new Set<string>();

	for (const row of chairRows) {
		const committee = row.committees;

		if (!isReadable(committee) || seenCommitteeIds.has(committee.id)) {
			continue;
		}

		seenCommitteeIds.add(committee.id);
		committees.push({
			committeeId: committee.id,
			conferenceId: committee.conferences.id,
			conferenceSlug: committee.conferences.slug,
			conferenceName: committee.conferences.name,
			committeeSlug: committee.slug,
			committeeHeading: committeeHeading(committee),
			waitingCount: waitingCounts.get(committee.id) ?? 0
		});
	}

	return committees;
}

/**
 * Whether a delegation is one of the reader's roles. It is once the organiser
 * has accepted it; until then it is an application like an individual's, drawn
 * in "Applications" and nowhere else, and a withdrawn one is over. The same
 * line an individual application is held to, so the two roads into a
 * conference are treated alike.
 */
function isAcceptedDelegation(membership: MyDelegationListItem): boolean {
	return membership.status === 'accepted';
}

/**
 * Whether an application of the reader's own has been accepted, which is the
 * one status that makes its conference one they take part in: its card says
 * "Delegate — seat to come", and its programme and announcements are theirs
 * to read. Every other status is a row of "Applications", if anything.
 */
function isAcceptedApplication(application: MyApplicationListItem): boolean {
	return application.status === 'accepted';
}

/** The delegations the reader heads, with the seats they still have to fill. */
function toDelegationsWithEmptySeats(
	memberships: MyDelegationListItem[],
	headDelegationIds: string[],
	seatCounts: Map<string, DelegationSeatCounts>
): DelegationWithEmptySeats[] {
	const headOf = new Set(headDelegationIds);

	return memberships
		.filter((membership) => isAcceptedDelegation(membership) && headOf.has(membership.id))
		.map((membership) => {
			const counts = seatCounts.get(membership.id) ?? NO_SEATS;

			return {
				id: membership.id,
				name: membership.name,
				conferenceId: membership.conference.id,
				conferenceName: membership.conference.name,
				seatCount: counts.seatCount,
				emptySeatCount: counts.emptySeatCount
			};
		});
}

/**
 * The conferences the reader helps run, each with what its publish checklist
 * needs beyond the conference row itself.
 *
 * Whether Stripe is connected belongs to the organisation rather than to the
 * conference, and a conference is matched to its organisation by slug, because
 * a `Conference` carries no `organization_id`: the view it is read through
 * brings the organisation along as `organization_slug`. A conference whose
 * organisation the reader is not a member of counts as not connected, which at
 * worst keeps one "Publish" task off the list rather than inventing one.
 */
function toManagedConferenceFacts(
	conferences: Conference[],
	checklistCounts: ChecklistCountsById,
	stripeConnectedSlugs: Set<string>
): ManagedConferenceFacts[] {
	const facts: ManagedConferenceFacts[] = [];

	for (const conference of conferences) {
		const counts = checklistCounts[conference.id];

		// Only the drafts were asked about, so every draft has an entry. Anything
		// else is already published and has no publish task to give.
		if (counts === undefined) {
			continue;
		}

		facts.push({
			conference,
			checklistCounts: {
				...counts,
				isStripeConnected:
					conference.organizationSlug !== null &&
					stripeConnectedSlugs.has(conference.organizationSlug)
			}
		});
	}

	return facts;
}

/**
 * The applications waiting at each published conference the reader
 * organises, counted or not, as the "Decide 4 applications" rule needs them.
 * A draft is not in the list: nobody can apply to it yet.
 */
function toWaitingApplications(
	conferences: Conference[],
	counts: Map<string, WaitingApplicationCount>
): WaitingApplications[] {
	const waiting: WaitingApplications[] = [];

	for (const conference of conferences) {
		if (conference.status !== 'published') {
			continue;
		}

		const theirs = counts.get(conference.id) ?? NOBODY_WAITING;

		waiting.push({
			conferenceId: conference.id,
			conferenceName: conference.name,
			conferenceSlug: conference.slug,
			conferenceTimezone: conference.timezone,
			count: theirs.count,
			oldestSubmittedAt: theirs.oldestSubmittedAt
		});
	}

	return waiting;
}

/** The conferences of the committees the reader sits in or chairs, one id per readable row. */
function committeeConferenceIds(seatRows: MySeatRow[], chairRows: MyChairRow[]): string[] {
	const ids: string[] = [];

	for (const row of [...seatRows, ...chairRows]) {
		if (isReadable(row.committees)) {
			ids.push(row.committees.conferences.id);
		}
	}

	return ids;
}

/** A conference row, from either lookup that brings one along, as the "Today" items read it. */
function toTodayConference(row: StaffConferenceRow | EmbeddedConference): TodayConference {
	return {
		id: row.id,
		slug: row.slug,
		name: row.name,
		startDate: row.start_date,
		endDate: row.end_date,
		timezone: row.timezone
	};
}

/**
 * One committee of the reader's for the "Today" items, or `null` when its
 * conference does not run today or could not be read.
 */
function toCommitteeOfToday(
	committee: EmbeddedCommittee | null,
	isChair: boolean,
	now: Date
): CommitteeOfToday | null {
	if (!isReadable(committee)) {
		return null;
	}

	const conference = toTodayConference(committee.conferences);

	if (!isRunningToday(conference, now)) {
		return null;
	}

	return {
		id: committee.id,
		heading: committeeHeading(committee),
		committeeSlug: committee.slug,
		conference,
		isChair
	};
}

/** What `collectTodayParts` works from: rows the first two waves already read. */
type TodayPartsSources = {
	seatRows: MySeatRow[];
	chairRows: MyChairRow[];
	staffRows: StaffRow[];
	managedConferences: Conference[];
	delegationMemberships: MyDelegationListItem[];
};

/**
 * The reader's parts in the conferences that run today, for the "Today" items.
 *
 * A committee the reader both chairs and sits in is listed once, as the chair's,
 * because the chair room is where the day needs them. A delegation counts only
 * at a conference where the reader holds no seat: a seat has a line of its own.
 */
function collectTodayParts(sources: TodayPartsSources, now: Date): TodayParts {
	const committees: CommitteeOfToday[] = [];

	for (const row of sources.chairRows) {
		const committee = toCommitteeOfToday(row.committees, true, now);

		if (committee !== null) {
			committees.push(committee);
		}
	}

	for (const row of sources.seatRows) {
		const committee = toCommitteeOfToday(row.committees, false, now);
		const isChaired = committees.some((listed) => listed.id === committee?.id);

		if (committee !== null && !isChaired) {
			committees.push(committee);
		}
	}

	const organisedConferences = sources.managedConferences
		.map((conference) => ({
			id: conference.id,
			slug: conference.slug,
			name: conference.name,
			startDate: conference.startDate,
			endDate: conference.endDate,
			timezone: conference.timezone
		}))
		.filter((conference) => isRunningToday(conference, now));

	const volunteerConferences: TodayConference[] = [];

	for (const row of sources.staffRows) {
		if (!row.isVolunteer || row.conferences === null) {
			continue;
		}

		const conference = toTodayConference(row.conferences);

		if (isRunningToday(conference, now)) {
			volunteerConferences.push(conference);
		}
	}

	const seatConferenceIds = new Set(
		sources.seatRows.map((row) => row.committees?.conferences?.id ?? null)
	);
	const delegations: TodayDelegation[] = sources.delegationMemberships
		.filter(isAcceptedDelegation)
		.filter((membership) => !seatConferenceIds.has(membership.conference.id))
		.map((membership) => ({ delegationId: membership.id, conference: membership.conference }))
		.filter((delegation) => isRunningToday(delegation.conference, now));

	return { committees, organisedConferences, volunteerConferences, delegations };
}

/** A conference row, from any lookup that brings one along, as a card reads it. */
function toUpcomingSource(row: StaffConferenceRow | EmbeddedConference): UpcomingConferenceSource {
	return {
		...toTodayConference(row),
		status: row.status,
		bannerPath: row.banner_path,
		city: row.city,
		venueName: row.venue_name,
		locationMode: row.location_mode
	};
}

/**
 * The conference of an application or a delegation, as a card reads it.
 *
 * `ApplicationListConference` says whether the conference is cancelled rather
 * than which status it holds, so the status is read back from that. Nobody can
 * apply to a draft, and a delegation is applied for the same way, so a
 * conference that reaches this is published unless it has been archived.
 */
function toApplicationConferenceSource(
	conference: ApplicationListConference
): UpcomingConferenceSource {
	return {
		id: conference.id,
		slug: conference.slug,
		name: conference.name,
		status: conference.isArchived ? 'archived' : 'published',
		bannerPath: conference.bannerPath,
		startDate: conference.startDate,
		endDate: conference.endDate,
		timezone: conference.timezone,
		city: conference.city,
		venueName: conference.venueName,
		locationMode: conference.locationMode
	};
}

/** The parts of a committee role a chair's and a seat's have in common. */
type CommitteeRoleBase = Omit<
	UpcomingCommitteeRole,
	'seatCountryCode' | 'papersWaiting' | 'positionPaper'
>;

/**
 * The committee and conference of a role, for a card. `roleName` is the chair
 * row's title or the seat's name.
 */
function toCommitteeRoleBase(committee: ReadableCommittee, roleName: string): CommitteeRoleBase {
	return {
		conference: toUpcomingSource(committee.conferences),
		committeeId: committee.id,
		committeeHeading: committeeHeading(committee),
		committeeSlug: committee.slug,
		roleName
	};
}

/**
 * The committees the reader chairs, as cards read them, each with its papers
 * waiting for review counted. A chair holds no seat, so there is no flag to
 * draw and no paper of their own to hand in.
 */
function toUpcomingChairRoles(
	chairRows: MyChairRow[],
	waitingPaperCounts: Map<string, number>
): UpcomingCommitteeRole[] {
	const roles: UpcomingCommitteeRole[] = [];

	for (const row of chairRows) {
		if (!isReadable(row.committees)) {
			continue;
		}

		roles.push({
			...toCommitteeRoleBase(row.committees, row.title),
			seatCountryCode: null,
			papersWaiting: waitingPaperCounts.get(row.committees.id) ?? 0,
			positionPaper: 'none'
		});
	}

	return roles;
}

/** Whether a seat's paper is in, still owed, or not asked for by its conference. */
function positionPaperState(isRequired: boolean, hasPaper: boolean): PositionPaperState {
	if (!isRequired) {
		return 'none';
	}

	return hasPaper ? 'handed_in' : 'due';
}

/**
 * The seats the reader holds, as cards read them, each with the code its flag
 * is drawn from and whether its paper is in.
 */
function toUpcomingSeatRoles(
	seatRows: MySeatRow[],
	seatIdsWithPapers: Set<string>
): UpcomingCommitteeRole[] {
	const roles: UpcomingCommitteeRole[] = [];

	for (const row of seatRows) {
		if (!isReadable(row.committees)) {
			continue;
		}

		roles.push({
			...toCommitteeRoleBase(row.committees, row.name),
			seatCountryCode: row.country_code,
			papersWaiting: 0,
			positionPaper: positionPaperState(
				row.committees.conferences.position_paper_required,
				seatIdsWithPapers.has(row.id)
			)
		});
	}

	return roles;
}

/**
 * The conferences the reader organises, as cards read them: the whole row,
 * the applications waiting for a decision, and for a draft how far its setup
 * has got.
 *
 * The setup figure is `setupStepCounts` of the same checklist the publish task
 * reads, so the hero's "5 of 5 setup steps done" and the task's detail can
 * never disagree about one conference. Only a draft has checklist facts, so a
 * published conference gets no figure.
 */
function toOrganisedSources(
	conferences: Conference[],
	managedFacts: ManagedConferenceFacts[],
	waitingApplications: Map<string, WaitingApplicationCount>
): UpcomingOrganisedConference[] {
	return conferences.map((conference) => {
		const draftFacts = managedFacts.find((facts) => facts.conference.id === conference.id);

		return {
			conference,
			applicationsWaiting: waitingApplications.get(conference.id)?.count ?? 0,
			setupSteps:
				draftFacts === undefined
					? null
					: setupStepCounts(publishChecklistItems(conference, draftFacts.checklistCounts))
		};
	});
}

/**
 * The delegations the reader belongs to, as cards read them, with whether
 * they head each and how many of its seats are filled. Only an accepted
 * delegation is a role; the rest are in "Applications", if anywhere.
 */
function toUpcomingDelegations(
	memberships: MyDelegationListItem[],
	headDelegationIds: string[],
	seatCounts: Map<string, DelegationSeatCounts>
): UpcomingDelegation[] {
	const headOf = new Set(headDelegationIds);

	return memberships.filter(isAcceptedDelegation).map((membership) => {
		const counts = seatCounts.get(membership.id) ?? NO_SEATS;

		return {
			conference: toApplicationConferenceSource(membership.conference),
			delegationId: membership.id,
			delegationName: membership.name,
			isHead: headOf.has(membership.id),
			seatCount: counts.seatCount,
			emptySeatCount: counts.emptySeatCount
		};
	});
}

/** What `collectUpcomingConferenceFacts` works from: rows and counts the three waves already read. */
type UpcomingConferenceSources = {
	seatRows: MySeatRow[];
	chairRows: MyChairRow[];
	staffRows: StaffRow[];
	managedConferences: Conference[];
	managedFacts: ManagedConferenceFacts[];
	delegationMemberships: MyDelegationListItem[];
	headDelegationIds: string[];
	applications: MyApplicationListItem[];
	seatIdsWithPapers: Set<string>;
	waitingPaperCounts: Map<string, number>;
	waitingApplications: Map<string, WaitingApplicationCount>;
	delegationSeatCounts: Map<string, DelegationSeatCounts>;
	todayItems: TodayItem[];
};

/**
 * Every role of the reader's, in the shape `upcomingConferences` in
 * `$lib/upcoming-conferences.ts` reads, built from rows already read so the
 * cards cost no query of their own.
 *
 * A draft, submitted, waitlisted or rejected application is not a role, and
 * neither is a delegation in any of those states: both are in "Applications".
 */
function collectUpcomingConferenceFacts(
	sources: UpcomingConferenceSources
): UpcomingConferenceFacts {
	const volunteered: UpcomingConferenceSource[] = [];

	for (const row of sources.staffRows) {
		if (row.isVolunteer && row.conferences !== null) {
			volunteered.push(toUpcomingSource(row.conferences));
		}
	}

	const acceptedApplications = sources.applications
		.filter(isAcceptedApplication)
		.map((application) => toApplicationConferenceSource(application.conference));

	return {
		chairs: toUpcomingChairRoles(sources.chairRows, sources.waitingPaperCounts),
		seats: toUpcomingSeatRoles(sources.seatRows, sources.seatIdsWithPapers),
		organised: toOrganisedSources(
			sources.managedConferences,
			sources.managedFacts,
			sources.waitingApplications
		),
		volunteered,
		delegations: toUpcomingDelegations(
			sources.delegationMemberships,
			sources.headDelegationIds,
			sources.delegationSeatCounts
		),
		acceptedApplications,
		todayItems: sources.todayItems
	};
}

/** Whether a seat's or a chair's committee belongs to a quick session (S14). */
function isQuickSessionRow(row: { committees: EmbeddedCommittee | null }): boolean {
	const conference = row.committees?.conferences ?? null;

	return conference !== null && isQuickSession(conference);
}

/**
 * The quick sessions the reader chairs, once each, as `listMyQuickSessions`
 * reads them. A row whose committee or conference was withheld has nothing to
 * link to, the rule `isReadable` gives.
 */
function toQuickSessionCommittees(chairRows: MyChairRow[]): QuickSessionCommittee[] {
	const committees: QuickSessionCommittee[] = [];

	for (const row of chairRows) {
		const committee = row.committees;

		if (!isReadable(committee)) continue;
		if (committees.some((listed) => listed.committeeId === committee.id)) continue;

		committees.push({
			committeeId: committee.id,
			committeeName: committee.name,
			committeeSlug: committee.slug,
			conferenceSlug: committee.conferences.slug,
			timezone: committee.conferences.timezone
		});
	}

	return committees;
}

/** The status of an entry, whichever of the two roads into a conference it is. */
function entryStatus(entry: ApplicationListEntry): ApplicationStatus {
	// A delegation's five statuses are five of an application's six, so the one
	// type names both.
	return entry.kind === 'individual' ? entry.application.status : entry.membership.status;
}

/**
 * Whether an entry still belongs in "Applications": one in draft, sent,
 * waitlisted or turned down. An accepted one is a conference, drawn as the
 * hero or an "Also coming up" row, and a withdrawn one is over.
 */
function isListedApplication(entry: ApplicationListEntry): boolean {
	const status = entryStatus(entry);

	return status !== 'accepted' && status !== 'withdrawn';
}

/**
 * Where an entry falls in "Applications": the ones waiting for an answer
 * first, then the drafts, then the refusals. Inside a group the merged list's
 * own order holds, soonest conference first.
 */
function applicationRank(entry: ApplicationListEntry): number {
	const status = entryStatus(entry);

	if (status === 'submitted' || status === 'waitlisted') {
		return 0;
	}

	return status === 'draft' ? 1 : 2;
}

/**
 * The rows of "Applications": the reader's applications and delegations that
 * are still a question, at conferences that have not ended, in the section's
 * order, at most `MY_APPLICATION_LIMIT` of them. The limit comes last, so a
 * waitlisted row behind three accepted ones is still shown.
 */
function toHomeApplications(entries: ApplicationListEntry[], now: Date): ApplicationListEntry[] {
	// A conference that is over has nothing left for the reader to do about it.
	// `/applications` hides the same rows until `?past=1` asks for them, and the
	// section's "All applications" goes there.
	return (
		withoutPastConferences(entries, now)
			.filter(isListedApplication)
			// `sort` keeps two entries it ranks the same in the order it found them.
			.sort((first, second) => applicationRank(first) - applicationRank(second))
			.slice(0, MY_APPLICATION_LIMIT)
	);
}

/**
 * `?all=conferences` or `?all=quick` as the page reads it: the one list whose
 * limit the reader asked to lift, or `null` for the page as it normally is.
 * Anything else in the parameter names no list and reads as `null`.
 */
export function readShowAll(value: string | null): HomeDashboard['showAll'] {
	if (value === 'conferences' || value === 'quick') {
		return value;
	}

	return null;
}

/**
 * Everything the home page shows, in one object.
 *
 * `now` is given rather than read from the clock here, for the same reason as in
 * `listConferences`: every part of the page has to agree about the moment, and
 * a test has to be able to decide what it is. `showAll` is what `load` read
 * from `?all=`, handed back as it is so the page can lift the right limit.
 *
 * The queries run in waves. Nothing inside a wave needs another member's
 * answer, so a wave is one `Promise.all` and the page waits for its slowest
 * member rather than for the sum. A wave exists only because the next one needs
 * ids the one before it found: the fourth is paid for by an organiser whose
 * hero counts its seats, and by a reader with no conference at all, and by
 * nobody else.
 *
 * Two lists of the reader's rows are kept side by side: everything, and only
 * what is at a conference that is not over (`current…`, by
 * `hasConferenceRowEnded`). The tasks, the programme and the announcements
 * read the second, the invoices apart, which are owed whether or not their
 * conference is over; the cards, the "Today" items and the "has ever" flags
 * read the first, because `upcomingConferences` drops a conference that is
 * over by a rule of its own and `hasManagedConferences` means over or not.
 */
export async function loadHomeDashboard(
	supabase: SupabaseClient,
	userId: string,
	now: Date,
	showAll: HomeDashboard['showAll']
): Promise<HomeDashboard> {
	// Wave one: everything that can be found from the reader's id alone.
	const [
		membershipRows,
		allStaffQueryRows,
		roleMemberships,
		allSeatRows,
		allChairRows,
		applications,
		delegationMemberships,
		headDelegationIds,
		profile,
		invoices
	] = await Promise.all([
		readMyOrganizations(supabase, userId),
		readMyStaffRows(supabase, userId),
		readMyRoleMemberships(supabase, userId),
		readMySeatRows(supabase, userId),
		readMyChairRows(supabase, userId),
		listMyApplications(supabase, userId),
		listMyDelegationMemberships(supabase, userId),
		readMyHeadDelegationIds(supabase, userId),
		readMyProfileFields(supabase, userId),
		readMyUnpaidInvoices(supabase, userId)
	]);

	// A quick session (S14) is listed under "Quick sessions" and in no other
	// part of the page, so every row that belongs to one is set aside here,
	// before anything below reads the rows. Its personal organisation's
	// membership stays: `listManagedConferences` leaves quick sessions out itself.
	const quickSessionCommittees = toQuickSessionCommittees(allChairRows.filter(isQuickSessionRow));
	const seatRows = allSeatRows.filter((row) => !isQuickSessionRow(row));
	const chairRows = allChairRows.filter((row) => !isQuickSessionRow(row));
	const staffRows = describeStaffRows(
		allStaffQueryRows.filter((row) => row.conferences === null || !isQuickSession(row.conferences)),
		roleMemberships,
		chairRows
	);

	// The same rows at the conferences that are not over, for the tasks, the
	// programme and the announcements (see `hasConferenceRowEnded`). An
	// application's or a delegation's conference is already in the shape
	// `hasConferenceFinished` reads, so it is asked directly.
	const currentSeatRows = seatRows.filter((row) => !isAtConferenceOver(row, now));
	const currentChairRows = chairRows.filter((row) => !isAtConferenceOver(row, now));
	const currentApplications = applications.filter(
		(application) => !hasConferenceFinished(application.conference, now)
	);
	const currentDelegationMemberships = delegationMemberships.filter(
		(membership) => !hasConferenceFinished(membership.conference, now)
	);

	// Whether the reader has ever had a part in a conference, over or not: a
	// seat, a chair, a staff row, a delegation or an application in any state,
	// or a conference they help run. The page tells somebody whose conferences
	// are all over apart from somebody who has never been to one. A quick
	// session is not a conference, so its rows were set aside above.
	const hasTakenPartInRows =
		seatRows.length > 0 ||
		chairRows.length > 0 ||
		staffRows.length > 0 ||
		delegationMemberships.length > 0 ||
		applications.length > 0;

	const organizationIds: string[] = [];
	const stripeConnectedSlugs = new Set<string>();

	for (const row of membershipRows) {
		// `null` means the organisation itself could not be read, so there is no id
		// to look its conferences up by.
		if (row.organizations === null) {
			continue;
		}

		organizationIds.push(row.organizations.id);

		if (row.organizations.stripe_onboarding_completed_at !== null) {
			stripeConnectedSlugs.add(row.organizations.slug);
		}
	}

	// Only the organiser rows count as helping run a conference: a volunteer's
	// conference is no more theirs to manage than a delegate's is.
	const organiserConferenceIds = staffRows
		.filter((row) => row.isAdministrator)
		.map((row) => row.conference_id);

	const myCommitteeConferenceIds = committeeConferenceIds(seatRows, chairRows);

	// The conferences "Open for applications" must not offer, built from what
	// wave one found: the conferences of the reader's committees, the ones they
	// organise and the ones they have already applied to or joined a delegation
	// at.
	//
	// The conferences of their organisations are not in it, because those ids are
	// only known once wave two has answered. So a member of an organisation whose
	// own conference is open may see it under the cards as well, unless they
	// organise something, in which case the cards are not drawn at all. That is a
	// small, harmless duplication.
	const myConferenceIds = uniqueIds([
		...myCommitteeConferenceIds,
		...organiserConferenceIds,
		...applications.map((application) => application.conference.id),
		...delegationMemberships.map((membership) => membership.conference.id)
	]);

	// The committees the reader chairs at a conference that is not over, whose
	// waiting papers wave two counts: for the "Review 2 position papers" task
	// and the chair's card, neither of which exists for a conference that is over.
	const chairedCommitteeIds = currentChairRows
		.map((row) => row.committees?.id)
		.filter((committeeId) => committeeId !== undefined);

	// Wave two: the five queries that need the ids wave one found.
	const [
		managedConferences,
		seatIdsWithPapers,
		delegationSeatCounts,
		waitingPaperCounts,
		quickSessions
	] = await Promise.all([
		listManagedConferences(supabase, organizationIds, organiserConferenceIds),
		// The papers of the seats at conferences that are not over, for the same
		// reason as the chairs' committees: a paper never handed in at a
		// conference that is over is no longer a task.
		readSeatIdsWithPositionPapers(
			supabase,
			currentSeatRows.map((row) => row.id)
		),
		readDelegationSeatCounts(supabase, headDelegationIds),
		readWaitingPaperCounts(supabase, chairedCommitteeIds),
		listMyQuickSessions(supabase, quickSessionCommittees)
	]);

	// `listManagedConferences` leaves cancelled conferences out itself, but not
	// ones that are over: an organiser's past conference is still theirs to
	// look back on from `/manage`. Here it gives no task and no programme.
	const currentManagedConferences = managedConferences.filter(
		(conference) =>
			!hasConferenceRowEnded(
				{ end_date: conference.endDate, timezone: conference.timezone, status: conference.status },
				now
			)
	);

	// Only a draft can be published, so only the drafts are asked about. Their
	// checklist is the one the conference dashboard draws, and reading it is two
	// more queries, which is why it is a wave of its own.
	const draftConferenceIds = currentManagedConferences
		.filter((conference) => conference.status === 'draft')
		.map((conference) => conference.id);

	// Only a published conference can have applications waiting for a decision.
	const publishedConferenceIds = currentManagedConferences
		.filter((conference) => conference.status === 'published')
		.map((conference) => conference.id);

	// Which of the reader's committees and conferences run today is only known
	// once the managed conferences above have come back.
	const todayParts = collectTodayParts(
		{ seatRows, chairRows, staffRows, managedConferences, delegationMemberships },
		now
	);

	const hasManagedConferences = managedConferences.length > 0;

	// Which conferences' programmes and announcements the reader is entitled to
	// see: `docs/home.md` asks these sections for the conferences the reader
	// takes part in or helps run, which is every role the cards count, at the
	// conferences that are not over. That is their committees; every staff row
	// (an organiser's and a volunteer's alike); the conferences they help run,
	// which is why this waits for wave two, since an organiser attached through
	// their organisation alone has no staff row; and an accepted delegation or
	// application. A conference they merely applied to, or whose delegation was
	// turned down or withdrawn, is not one they take part in, and `myConferenceIds`
	// above is the wider list for leaving those out of "Open for applications".
	// A staff row whose conference was withheld says nothing about when it
	// ends, so it is left out, as every list leaves such rows out.
	const participatingConferenceIds = uniqueIds([
		...committeeConferenceIds(currentSeatRows, currentChairRows),
		...staffRows
			.filter((row) => row.conferences !== null && !hasConferenceRowEnded(row.conferences, now))
			.map((row) => row.conference_id),
		...currentManagedConferences.map((conference) => conference.id),
		...currentDelegationMemberships
			.filter(isAcceptedDelegation)
			.map((membership) => membership.conference.id),
		...currentApplications
			.filter(isAcceptedApplication)
			.map((application) => application.conference.id)
	]);

	// Wave three: the reads that need the managed conferences. The programme
	// is read before today's parts, so that a stand-in client sees the
	// "Programme" read of `schedule_events` first. The cards to explore wait
	// until here as well, because home does not sell an organiser other
	// people's conferences, and whether the reader is one is only known now. An
	// empty list is the answer for them, with no query sent.
	const [
		checklistCounts,
		upcomingEvents,
		todayFacts,
		waitingApplications,
		announcements,
		exploreConferences
	] = await Promise.all([
		readChecklistCounts(supabase, draftConferenceIds),
		listUpcomingEvents(supabase, participatingConferenceIds, now),
		readTodayFacts(supabase, todayParts, now),
		readWaitingApplications(supabase, publishedConferenceIds),
		// It answers with nothing, without asking, for somebody at no conference.
		listHomeAnnouncements(supabase, participatingConferenceIds),
		hasManagedConferences
			? []
			: listConferencesToExplore(supabase, myConferenceIds, now, EXPLORE_CONFERENCE_LIMIT)
	]);

	const managedFacts = toManagedConferenceFacts(
		currentManagedConferences,
		checklistCounts,
		stripeConnectedSlugs
	);

	// Worked out once and handed to both the cards and the page, so the hero's
	// live state and the "Today's programme" rows read the same items.
	const itemsOfToday = todayItems(todayFacts, now);

	// Every fact here is at a conference that is not over: a task is pressing
	// the moment it is overdue, and a conference that is over has nothing left
	// for the reader to do. The profile task has no conference and always stays.
	const tasks: HomeTask[] = deriveTasks(
		{
			profile,
			seats: toPositionPaperSeats(currentSeatRows, seatIdsWithPapers),
			// Already cut to conferences that are not over by `readMyUnpaidInvoices`.
			invoices,
			// Withdrawn ones included: a withdrawn application is not a draft, so no
			// rule can pick one up.
			applications: currentApplications,
			waitingApplications: toWaitingApplications(currentManagedConferences, waitingApplications),
			delegations: toDelegationsWithEmptySeats(
				currentDelegationMemberships,
				headDelegationIds,
				delegationSeatCounts
			),
			managedConferences: managedFacts,
			chairedCommittees: toChairedCommitteePapers(currentChairRows, waitingPaperCounts)
		},
		now
	);

	// Every conference of the reader's that has not ended, the hero first, from
	// the whole of each list: `upcomingConferences` leaves out a conference
	// that is over by its own rule. An empty list gives the reader the "Find a
	// conference" hero in its place.
	const upcomingConferenceCards = upcomingConferences(
		collectUpcomingConferenceFacts({
			seatRows,
			chairRows,
			staffRows,
			managedConferences,
			managedFacts,
			delegationMemberships,
			headDelegationIds,
			applications,
			seatIdsWithPapers,
			waitingPaperCounts,
			waitingApplications,
			delegationSeatCounts,
			todayItems: itemsOfToday
		}),
		now
	);

	// Wave four, for two readers who never meet: the organiser whose hero is a
	// published conference, who gets its seats counted, and the reader with no
	// conference at all, who gets told how many are open for applications.
	const [heroSeats, openConferenceCount] = await Promise.all([
		readHeroSeats(
			supabase,
			heroConferenceToCountSeatsOf(upcomingConferenceCards, managedConferences)
		),
		upcomingConferenceCards.length === 0 ? countConferencesOpenForApplications(supabase, now) : null
	]);

	return {
		upcomingConferences: upcomingConferenceCards,
		tasks,
		todayItems: itemsOfToday,
		todayEvents: todayFacts.events,
		upcomingEvents,
		announcements,
		myApplications: toHomeApplications(
			mergeIntoApplicationList(applications, delegationMemberships),
			now
		),
		quickSessions,
		exploreConferences,
		hasManagedConferences,
		hasTakenPart: hasTakenPartInRows || hasManagedConferences,
		// A chair of a quick session alone is not a chair here: those rows were set aside above.
		chairsSomething: chairRows.length > 0,
		openConferenceCount,
		heroSeats,
		showAll
	};
}

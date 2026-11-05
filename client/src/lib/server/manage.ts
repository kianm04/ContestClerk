/**
 * Where the organiser area gets its data.
 *
 * Files under `$lib/server` only ever run on the server, so this is where the
 * database is queried. Like the other modules here, every function takes the
 * Supabase client as its first argument. The page passes in `locals.supabase`,
 * the client that knows who is signed in, so the database's Row Level Security
 * rules (see `specs/02-architecture/permissions.md`) decide what comes back.
 *
 * The shapes these queries fill in, and the wording the pages work out on top
 * of them, live in `$lib/manage.ts`, which the browser reads as well.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Conference } from '$lib/conferences';
import type {
	ConferenceDashboard,
	ConferenceFigures,
	ManageIndex,
	ManagedConferenceSummary,
	OrganizationGroupData,
	OrganizationRole,
	RecentApplication,
	StaffConference
} from '$lib/manage';
import type { PublishChecklistCounts } from '$lib/publish-checklist';
import { listConferencesByIds, listConferencesForOrganizations } from './conferences';
import { listMyInvites } from './invites';
import { readConferenceIdsPermitting, readManageableConferenceIds } from './my-permissions';
import {
	draftSetupProgress,
	readConferenceFigures,
	readConferenceIdsWithTeam
} from './manage-list';
import {
	MANAGED_ORGANIZATION_COLUMNS,
	toManagedOrganization,
	type ManagedOrganizationRow
} from './organizations';

/**
 * One `organization_members` row: what the reader is in the organisation, with
 * the organisation itself brought along.
 *
 * `organizations(...)` follows the row's `organization_id` and includes the
 * organisation it points at. `null` means Row Level Security withheld that
 * organisation, so there is nothing to put on the heading. `is_personal` marks
 * the organisation that holds a person's quick sessions (S14), which the
 * organiser area leaves out.
 */
type MembershipRow = {
	role: OrganizationRole;
	organizations: (ManagedOrganizationRow & { is_personal: boolean }) | null;
};

/**
 * One `conference_role_members` row of the reader's: which conference, and the
 * role it gives them there. The role comes along because `role_id` points at
 * `conference_roles`, which is the kind of join PostgREST can make.
 */
type StaffRow = {
	conference_id: string;
	conference_roles: {
		name: string;
		position: number;
		permissions: string[];
		scope: 'conference' | 'committees';
	} | null;
};

/**
 * What the membership lookup asks for. The organisation comes along on the row
 * itself, in exactly the columns `$lib/server/organizations.ts` reads for one
 * on its own, so that both places show the same organisation.
 */
const MEMBERSHIP_COLUMNS = `role, organizations(${MANAGED_ORGANIZATION_COLUMNS}, is_personal)`;

/** The organisations the reader belongs to, with their role in each. */
async function readMyMemberships(
	supabase: SupabaseClient,
	userId: string
): Promise<MembershipRow[]> {
	const { data, error } = await supabase
		.from('organization_members')
		.select(MEMBERSHIP_COLUMNS)
		.eq('user_id', userId)
		// Each membership points at exactly one organisation, but without generated
		// database types Supabase guesses that `organizations(...)` is a list. This
		// replaces the guess with our own row type, the way `listMyOrganizations` in
		// `./organizations.ts` does. It has to come last.
		.overrideTypes<MembershipRow[], { merge: false }>();

	// A failed query means a bug (a wrong column name, a missing policy), not
	// something the reader can fix. Throwing shows SvelteKit's error page and the
	// real message ends up in the server log. Every lookup here does the same,
	// because the page is all or nothing.
	if (error) {
		throw new Error(`Could not list your organisations: ${error.message}`);
	}

	return data ?? [];
}

/**
 * The roles the reader holds on conferences, one row per role.
 *
 * Every role counts, not just the ones that are everything: `manage-index.md`
 * lists the conferences somebody helps with under their own heading and shows
 * the role beside each one.
 */
async function readMyStaffRows(supabase: SupabaseClient, userId: string): Promise<StaffRow[]> {
	const { data, error } = await supabase
		.from('conference_role_members')
		.select('conference_id, conference_roles(name, position, permissions, scope)')
		.eq('user_id', userId)
		.overrideTypes<StaffRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not list the conferences you help with: ${error.message}`);
	}

	return data ?? [];
}

// ---------------------------------------------------------------------------
// The publish checklist of every draft on the page
// ---------------------------------------------------------------------------
// A draft's row says which setup step it is on, and `publishChecklist` in
// `$lib/publish-checklist.ts` needs four numbers about the conference before it
// can work that out. `/manage` shows every conference of every organisation the
// reader belongs to, so those numbers are asked for about all of the drafts at
// once rather than one conference at a time: an organiser with six drafts would
// otherwise send twenty-four requests to print six lines.

/**
 * One `conferences` row, read for the one column the checklist's fee item asks
 * about and that `Conference` does not carry.
 *
 * `loadConferenceDashboard` below reads the same column for one conference.
 * Both are here rather than on `Conference` itself, because that shape is what
 * every page in the app displays a conference in and fourteen files build one.
 */
type PaymentSettingRow = {
	id: string;
	collects_payments_manually: boolean;
};

/** One `committees` row: its own id, and which conference it belongs to. */
type CommitteeOfConferenceRow = {
	id: string;
	conference_id: string;
};

/** One `fees` row. Only the conference is read, because only the number is shown. */
type FeeOfConferenceRow = {
	conference_id: string;
};

/** One `seats` row, read only for whether its committee is offering anything. */
type AvailableSeatRow = {
	committee_id: string;
	is_available: boolean;
};

/**
 * What the checklist needs about each conference, by conference id, apart from
 * whether Stripe is connected.
 *
 * That last one belongs to the organisation rather than to the conference, and
 * `toOrganizationGroups` below already has it on the membership row, so it is
 * added there instead of being read a second time. The dashboard leaves it out
 * of `ConferenceDashboard.checklistCounts` for the same reason.
 */
export type ChecklistCountsById = Record<string, Omit<PublishChecklistCounts, 'isStripeConnected'>>;

/** Whether each of these conferences collects its money outside MUNMeet. */
async function readPaymentSettings(
	supabase: SupabaseClient,
	conferenceIds: string[]
): Promise<PaymentSettingRow[]> {
	const { data, error } = await supabase
		.from('conferences')
		.select('id, collects_payments_manually')
		.in('id', conferenceIds)
		.overrideTypes<PaymentSettingRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read your conferences' payment settings: ${error.message}`);
	}

	return data ?? [];
}

/** The committees of all of these conferences at once. */
async function readCommitteesOfConferences(
	supabase: SupabaseClient,
	conferenceIds: string[]
): Promise<CommitteeOfConferenceRow[]> {
	const { data, error } = await supabase
		.from('committees')
		.select('id, conference_id')
		.in('conference_id', conferenceIds)
		.overrideTypes<CommitteeOfConferenceRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read your conferences' committees: ${error.message}`);
	}

	return data ?? [];
}

/** The fees of all of these conferences at once. */
async function readFeesOfConferences(
	supabase: SupabaseClient,
	conferenceIds: string[]
): Promise<FeeOfConferenceRow[]> {
	const { data, error } = await supabase
		.from('fees')
		.select('conference_id')
		.in('conference_id', conferenceIds)
		.overrideTypes<FeeOfConferenceRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read your conferences' fees: ${error.message}`);
	}

	return data ?? [];
}

/**
 * Every seat in these committees, read only for the committee it is in and
 * whether it is on offer.
 *
 * `readSeats` further down asks the same table for the dashboard, and asks for
 * more: who is sitting in each seat, which is what the four seat figures at the
 * top of that page are counted from. Here the only question is whether a
 * committee is offering anything at all, so the two columns that answer it are
 * the two that are asked for.
 */
async function readAvailableSeats(
	supabase: SupabaseClient,
	committeeIds: string[]
): Promise<AvailableSeatRow[]> {
	// An empty list would have to be written as `in.()`, which PostgREST refuses,
	// and a conference with no committees has no seats to read anyway. This is
	// the same guard `countApplicationsToReview` above puts on its own `in`.
	if (committeeIds.length === 0) {
		return [];
	}

	const { data, error } = await supabase
		.from('seats')
		.select('committee_id, is_available')
		.in('committee_id', committeeIds)
		.overrideTypes<AvailableSeatRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read your conferences' seats: ${error.message}`);
	}

	return data ?? [];
}

/** Sort four answers about many conferences into one entry per conference. */
function toChecklistCounts(
	conferenceIds: string[],
	paymentRows: PaymentSettingRow[],
	committeeRows: CommitteeOfConferenceRow[],
	feeRows: FeeOfConferenceRow[],
	seatRows: AvailableSeatRow[]
): ChecklistCountsById {
	// Which committees are offering at least one seat. A committee with no row
	// here is a committee the checklist's fourth item is still waiting for.
	const committeesWithAnAvailableSeat = new Set<string>();

	for (const seat of seatRows) {
		if (seat.is_available) {
			committeesWithAnAvailableSeat.add(seat.committee_id);
		}
	}

	const counts: ChecklistCountsById = {};

	for (const conferenceId of conferenceIds) {
		const theirCommittees = committeeRows.filter((row) => row.conference_id === conferenceId);
		const withoutSeats = theirCommittees.filter(
			(row) => !committeesWithAnAvailableSeat.has(row.id)
		);
		const theirFees = feeRows.filter((row) => row.conference_id === conferenceId);
		const paymentRow = paymentRows.find((row) => row.id === conferenceId);

		counts[conferenceId] = {
			committeeCount: theirCommittees.length,
			committeesWithoutAvailableSeatsCount: withoutSeats.length,
			onlyCommitteeWithoutSeatsId: withoutSeats.length === 1 ? withoutSeats[0].id : null,
			feeCount: theirFees.length,
			// A conference whose row did not come back counts as collecting nothing
			// manually, which is the column's own default in the database.
			collectsPaymentsManually: paymentRow?.collects_payments_manually ?? false
		};
	}

	return counts;
}

/**
 * Everything the checklist of each of these conferences needs, in two waves of
 * queries however many conferences there are.
 *
 * Exported because the home dashboard's "Publish {conference}" task asks the
 * same question about the same conferences, and the two must not answer it
 * differently: `$lib/server/home.ts` reads these counts and hands them to
 * `deriveTasks`, which runs the very checklist this page draws.
 */
export async function readChecklistCounts(
	supabase: SupabaseClient,
	conferenceIds: string[]
): Promise<ChecklistCountsById> {
	// Nothing to ask about, and an empty `in` list is refused by PostgREST.
	if (conferenceIds.length === 0) {
		return {};
	}

	// None of these three needs another's answer, so all three are sent at once.
	const [paymentRows, committeeRows, feeRows] = await Promise.all([
		readPaymentSettings(supabase, conferenceIds),
		readCommitteesOfConferences(supabase, conferenceIds),
		readFeesOfConferences(supabase, conferenceIds)
	]);

	// A seat belongs to a committee and carries no conference of its own, so the
	// seats can only be asked for once the committee ids are known.
	const seatRows = await readAvailableSeats(
		supabase,
		committeeRows.map((row) => row.id)
	);

	return toChecklistCounts(conferenceIds, paymentRows, committeeRows, feeRows, seatRows);
}

/** What `toOrganizationGroups` needs about every conference, read in wave three. */
type ConferenceReadings = {
	figures: Record<string, ConferenceFigures>;
	checklistCounts: ChecklistCountsById;
	idsWithTeam: Set<string>;
	/** The conferences whose management area the reader may open. */
	manageableIds: Set<string>;
	now: Date;
};

/** Nothing counted, for a conference whose figures did not come back. */
const NO_FIGURES: ConferenceFigures = {
	applicationCount: 0,
	toReviewCount: 0,
	seatCount: 0,
	heldSeatCount: 0,
	feesPaidCents: 0,
	currency: 'EUR'
};

/** One conference with its figures and, while it is a draft, its setup steps. */
function toSummary(conference: Conference, readings: ConferenceReadings): ManagedConferenceSummary {
	return {
		conference,
		figures: readings.figures[conference.id] ?? NO_FIGURES,
		setupProgress: draftSetupProgress(
			conference,
			readings.checklistCounts[conference.id],
			readings.idsWithTeam.has(conference.id),
			readings.now
		),
		isOnTeam: readings.manageableIds.has(conference.id)
	};
}

/**
 * One heading per organisation the reader belongs to, in alphabetical order,
 * each with that organisation's conferences under it.
 *
 * A conference is matched to its organisation by slug, because a `Conference`
 * carries no `organization_id`: the view it is read through brings the
 * organisation along as `organization_name` and `organization_slug`, and the
 * slug is the one of those two that is unique.
 */
function toOrganizationGroups(
	membershipRows: MembershipRow[],
	conferences: Conference[],
	readings: ConferenceReadings
): OrganizationGroupData[] {
	const groups: OrganizationGroupData[] = [];

	for (const row of membershipRows) {
		// `null` means the organisation itself could not be read, so there is no
		// name for the heading and nothing to show underneath it.
		if (row.organizations === null) {
			continue;
		}

		const organization = toManagedOrganization(row.organizations);
		const theirConferences = conferences.filter(
			(conference) => conference.organizationSlug === organization.slug
		);

		groups.push({
			organization,
			myRole: row.role,
			conferences: theirConferences.map((conference) => toSummary(conference, readings))
		});
	}

	// Sorted here rather than by Supabase, because ordering by a column of the
	// attached table would only sort inside each membership, not the list itself.
	return groups.sort((first, second) =>
		first.organization.name.localeCompare(second.organization.name)
	);
}

/**
 * The conferences the reader helps with but whose organisation they are not a
 * member of, each with the roles they hold there.
 *
 * A conference that is already under an organisation heading is left out:
 * `manage-index.md` says somebody who is both a member and staff sees the
 * conference once, under the organisation.
 */
function toStaffConferences(
	staffRows: StaffRow[],
	staffConferences: Conference[],
	organizationConferences: Conference[],
	manageableIds: Set<string>
): StaffConference[] {
	const alreadyListed = new Set(organizationConferences.map((conference) => conference.id));
	const rows: StaffConference[] = [];

	for (const conference of staffConferences) {
		if (alreadyListed.has(conference.id)) {
			continue;
		}

		const roles = staffRows
			.filter((row) => row.conference_id === conference.id && row.conference_roles !== null)
			.map((row) => row.conference_roles!)
			// The conference's own order, which is how the team page lists them too.
			.sort((one, other) => one.position - other.position);

		// Every one of these conferences was looked up because a role row named
		// it, so this always finds at least one. Skipping rather than inventing a
		// role keeps the badge beside the name honest.
		if (roles.length === 0) {
			continue;
		}

		rows.push({
			conference,
			roleNames: roles.map((role) => role.name),
			mayManage: manageableIds.has(conference.id)
		});
	}

	return rows;
}

/**
 * Everything `/manage` shows, in one object. `now` decides which setup steps a
 * draft has done, because a closing date in the past leaves its application
 * form undone.
 */
export async function loadManageIndex(
	supabase: SupabaseClient,
	userId: string,
	now: Date
): Promise<ManageIndex> {
	// Wave one. None of these three needs another's answer, so all three are sent
	// at once and the page waits for the slowest of them rather than for the sum.
	const [allMembershipRows, staffRows, pendingInvites, manageableIds, invoiceReaderIds] =
		await Promise.all([
			readMyMemberships(supabase, userId),
			readMyStaffRows(supabase, userId),
			listMyInvites(supabase),
			readManageableConferenceIds(supabase),
			readConferenceIdsPermitting(supabase, ['read_invoices', 'manage_invoices'])
		]);

	// The personal organisation holding the reader's quick sessions (S14) is not
	// one they run conferences in, so it gets no heading here. Their chair staff
	// row in each quick session is left out by `listConferencesByIds` below.
	const membershipRows = allMembershipRows.filter((row) => row.organizations?.is_personal !== true);

	const organizationIds: string[] = [];

	for (const row of membershipRows) {
		if (row.organizations !== null) {
			organizationIds.push(row.organizations.id);
		}
	}

	// One row per role held, so a conference somebody holds two roles on is
	// named twice; a `Set` keeps one copy.
	const staffConferenceIds = [...new Set(staffRows.map((row) => row.conference_id))];

	// Wave two. Both of these need the ids wave one found, which is why they are
	// a second wave rather than two more queries alongside the first three.
	const [organizationConferences, staffConferences] = await Promise.all([
		listConferencesForOrganizations(supabase, organizationIds),
		listConferencesByIds(supabase, staffConferenceIds)
	]);

	// A conference of the organisation that the reader is not on the team of is
	// named on the page and nothing more, so nothing is counted for it.
	const teamConferences = organizationConferences.filter((conference) =>
		manageableIds.has(conference.id)
	);
	const organizationConferenceIds = teamConferences.map((conference) => conference.id);

	// Only a draft has setup steps, so only the drafts are asked which are done.
	const draftConferenceIds = teamConferences
		.filter((conference) => conference.status === 'draft')
		.map((conference) => conference.id);

	// Wave three, for the same reason as wave two: none of these can be asked for
	// until the conferences are known, and none needs another's answer. Only the
	// organisation's conferences are counted, because only their rows carry
	// figures — and only an organiser may read an `applications` row at all, so
	// asking about a conference somebody merely chairs would answer nought
	// whatever the truth.
	const [figures, checklistCounts, idsWithTeam] = await Promise.all([
		readConferenceFigures(supabase, organizationConferenceIds, invoiceReaderIds),
		readChecklistCounts(supabase, draftConferenceIds),
		readConferenceIdsWithTeam(supabase, draftConferenceIds)
	]);

	const readings: ConferenceReadings = {
		figures,
		checklistCounts,
		idsWithTeam,
		manageableIds,
		now
	};

	return {
		organizations: toOrganizationGroups(membershipRows, organizationConferences, readings),
		staffConferences: toStaffConferences(
			staffRows,
			staffConferences,
			organizationConferences,
			manageableIds
		),
		pendingInvites
	};
}

/**
 * Does `/manage` have anything for this person to act on? The top bar asks,
 * because `03-design/app-shell.md` shows the "Manage" link only to somebody it
 * has something for (streamlining principle P7).
 *
 * A membership of an organisation counts, and so does a conference the person
 * is an administrator of, which `permitted_conference_ids('administrator')` in
 * the database lists: every conference where one of their roles is everything.
 * A membership of a personal organisation, the one holding somebody's quick
 * sessions (S14), does not: `/manage` lists neither it nor its quick sessions,
 * so it has nothing there for them. A chair's or a volunteer's role does not:
 * they cannot open `/manage/[slug]`, which answers them "This conference does
 * not exist.", and their conference reaches them on `/home` instead. An
 * administrator who also helps at somebody else's conference still sees that
 * one under "Conferences you help with" on `/manage`.
 *
 * The helper counts a platform admin in for every conference, so they get the
 * link once any conference exists.
 *
 * Both lookups ask for at most one row, because the answer is only "is there
 * anything". This runs on every signed-in page through the root layout, so it
 * has to stay that small.
 *
 * A failed lookup counts as "found nothing" rather than throwing. It decides
 * whether one link is in the top bar, so the worst a wrong `false` does is hide
 * that link, where throwing would replace every page in the app with an error.
 * `askIsOrganizationAdmin` in `./organizations.ts` turns a failure away for the
 * same reason.
 */
export async function hasOrganiserArea(supabase: SupabaseClient, userId: string): Promise<boolean> {
	// Neither needs the other's answer, so both are sent at once.
	const [membershipAnswer, staffAnswer] = await Promise.all([
		// `!inner` keeps only the memberships whose organisation passes the filter
		// on it, rather than every membership with that organisation left empty.
		supabase
			.from('organization_members')
			.select('user_id, organizations!inner(is_personal)')
			.eq('user_id', userId)
			.eq('organizations.is_personal', false)
			.limit(1),
		// `rpc` calls a function in the database; `permitted_conference_ids`
		// answers a list of ids, which `.limit(1)` cuts to the first.
		supabase.rpc('permitted_conference_ids', { permission: 'administrator' }).limit(1)
	]);

	// A failed lookup leaves `data` empty, which is the "found nothing" the
	// comment above describes.
	const isOrganizationMember = (membershipAnswer.data ?? []).length > 0;
	const isConferenceAdministrator = (staffAnswer.data ?? []).length > 0;

	return isOrganizationMember || isConferenceAdministrator;
}

// ---------------------------------------------------------------------------
// The conference dashboard
// ---------------------------------------------------------------------------
// `05-pages/organiser/dashboard.md` describes `/manage/[slug]`: a row of
// figures, a publish checklist and the newest applications. `loadConferenceDashboard`
// at the bottom gathers all of it; everything above it is one lookup or one
// small calculation each.

/** How many of the newest applications the dashboard lists. */
const RECENT_APPLICATION_LIMIT = 5;

/** The two `conferences` columns only this page reads. */
type DashboardConferenceRow = {
	collects_payments_manually: boolean;
	/** An ISO currency code such as `EUR`, which every amount on the page is shown in. */
	currency: string;
};

/** One `applications` or `delegations` row, read only for the state it is in. */
type StatusRow = {
	status: string;
};

/** One `committees` or `fees` row. Only the id comes back, because only the number is shown. */
type IdRow = {
	id: string;
};

/** One `invoices` row: what state it is in and how much it is for. */
type InvoiceRow = {
	status: string;
	amount_cents: number;
};

/** One `seats` row: which committee it belongs to and who, if anybody, has it. */
type SeatRow = {
	committee_id: string;
	/** `false` for a seat the organiser has switched off, which is not on offer to anybody. */
	is_available: boolean;
	user_id: string | null;
	delegation_id: string | null;
};

/** One `applications` row on the "recent applications" list. */
type RecentApplicationRow = {
	id: string;
	user_id: string;
	/** An ISO timestamp, or `null` for a row that has somehow never been sent. */
	submitted_at: string | null;
};

/** One `profiles` row, for the name and school beside a recent application. */
type ApplicantProfileRow = {
	id: string;
	full_name: string;
	institution_name: string | null;
};

/** The four seat numbers the dashboard works out from one answer. */
type SeatCounts = {
	seatsAvailable: number;
	seatsFilled: number;
	seatsReserved: number;
	committeesWithoutAvailableSeatsCount: number;
	/** The committee without an available seat when exactly one has none, for the checklist's link. */
	onlyCommitteeWithoutSeatsId: string | null;
};

/**
 * The two conference columns the dashboard reads for itself.
 *
 * `collects_payments_manually` is read here rather than carried on the
 * `Conference` type, because `Conference` is the shape every page in the app
 * displays a conference in and fourteen files build one: a column that exactly
 * one checklist item asks about does not belong in every conference query in
 * the app. T66 builds the fees page and may move it then.
 *
 * This reads the `conferences` table rather than the
 * `conferences_with_organization` view the rest of the app reads, because
 * neither column has anything to do with the organisation, which is all the
 * view adds.
 */
async function readDashboardConference(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<DashboardConferenceRow> {
	const { data, error } = await supabase
		.from('conferences')
		.select('collects_payments_manually, currency')
		.eq('id', conferenceId)
		// At most one row comes back, because `id` is the primary key.
		.maybeSingle()
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<DashboardConferenceRow, { merge: false }>();

	if (error) {
		throw new Error(`Could not read this conference's payment settings: ${error.message}`);
	}

	// The layout above this page has already read the conference, so there is no
	// honest way for it to be missing here. Filling in defaults would put a
	// checklist on screen that claims something nobody checked.
	if (!data) {
		throw new Error(`Could not find the conference ${conferenceId}.`);
	}

	return data;
}

/**
 * The state of every application or delegation at this conference that has been
 * sent in.
 *
 * `draft` is left out because a draft is somebody's half-filled form that the
 * organiser has never seen. One query answers both the total and the "to
 * review" number, which are then counted in TypeScript, for the same reason
 * `countApplicationsToReview` above gives: two counts would be two requests to
 * print two numbers.
 */
async function readSentStatuses(
	supabase: SupabaseClient,
	table: 'applications' | 'delegations',
	conferenceId: string
): Promise<StatusRow[]> {
	const { data, error } = await supabase
		.from(table)
		.select('status')
		.eq('conference_id', conferenceId)
		.neq('status', 'draft')
		.overrideTypes<StatusRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the ${table} of this conference: ${error.message}`);
	}

	return data ?? [];
}

/**
 * The ids of this conference's committees.
 *
 * The dashboard needs them twice over: as a number for the checklist, and as
 * the list the seat lookup below is filtered by.
 */
async function readCommitteeIds(supabase: SupabaseClient, conferenceId: string): Promise<string[]> {
	const { data, error } = await supabase
		.from('committees')
		.select('id')
		.eq('conference_id', conferenceId)
		.overrideTypes<IdRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read this conference's committees: ${error.message}`);
	}

	const rows: IdRow[] = data ?? [];

	return rows.map((row) => row.id);
}

/** This conference's fees. Only the number of them is shown, on the checklist. */
async function readFees(supabase: SupabaseClient, conferenceId: string): Promise<IdRow[]> {
	const { data, error } = await supabase
		.from('fees')
		.select('id')
		.eq('conference_id', conferenceId)
		.overrideTypes<IdRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read this conference's fees: ${error.message}`);
	}

	return data ?? [];
}

/** This conference's invoices, which the two money figures are added up from. */
async function readInvoices(supabase: SupabaseClient, conferenceId: string): Promise<InvoiceRow[]> {
	const { data, error } = await supabase
		.from('invoices')
		.select('status, amount_cents')
		.eq('conference_id', conferenceId)
		.overrideTypes<InvoiceRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read this conference's invoices: ${error.message}`);
	}

	return data ?? [];
}

/**
 * Every seat in these committees.
 *
 * One query answers all four seat numbers the page shows, because the numbers
 * differ only in which rows they count and the rows are tiny.
 */
async function readSeats(supabase: SupabaseClient, committeeIds: string[]): Promise<SeatRow[]> {
	// An empty list would have to be written as `in.()`, which PostgREST refuses,
	// and a conference with no committees has no seats to count anyway. This is
	// the same guard `countApplicationsToReview` above puts on its own `in`.
	if (committeeIds.length === 0) {
		return [];
	}

	const { data, error } = await supabase
		.from('seats')
		.select('committee_id, is_available, user_id, delegation_id')
		.in('committee_id', committeeIds)
		.overrideTypes<SeatRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read this conference's seats: ${error.message}`);
	}

	return data ?? [];
}

/**
 * The name and school of each of these applicants, by user id.
 *
 * This is a second query rather than `applications(..., profiles(full_name))`,
 * because PostgREST can only bring along a table that a foreign key of the one
 * being read actually names, and `applications.user_id` points at `auth.users`
 * and not at `profiles`. `readProfiles` in `./team.ts` ran into exactly this
 * and answered it the same way, so it is a known wall and not a new one.
 *
 * An empty map is the answer to a failed lookup, and the list below then leaves
 * out everybody it cannot name.
 */
async function readApplicantProfiles(
	supabase: SupabaseClient,
	userIds: string[]
): Promise<Map<string, ApplicantProfileRow>> {
	const { data, error } = await supabase
		.from('profiles')
		.select('id, full_name, institution_name')
		.in('id', userIds)
		.overrideTypes<ApplicantProfileRow[], { merge: false }>();

	const profiles = new Map<string, ApplicantProfileRow>();

	if (error) {
		return profiles;
	}

	for (const row of data ?? []) {
		profiles.set(row.id, row);
	}

	return profiles;
}

/**
 * The newest applications waiting for a decision, with the applicant's name
 * beside each one, newest first.
 *
 * Only `submitted` ones, because the list is what the organiser clicks through
 * to review and a decided application is no longer waiting for them.
 */
async function listRecentApplications(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<RecentApplication[]> {
	const { data, error } = await supabase
		.from('applications')
		.select('id, user_id, submitted_at')
		.eq('conference_id', conferenceId)
		.eq('status', 'submitted')
		.order('submitted_at', { ascending: false })
		.limit(RECENT_APPLICATION_LIMIT)
		.overrideTypes<RecentApplicationRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the newest applications: ${error.message}`);
	}

	const rows: RecentApplicationRow[] = data ?? [];

	if (rows.length === 0) {
		return [];
	}

	const profiles = await readApplicantProfiles(
		supabase,
		rows.map((row) => row.user_id)
	);
	const applications: RecentApplication[] = [];

	for (const row of rows) {
		const profile = profiles.get(row.user_id);

		// Somebody whose profile did not come back would be a line with no name on
		// it, so they are left off the list instead, the way `toStaffConferences`
		// above leaves out a conference it cannot put an honest role beside.
		if (!profile) {
			continue;
		}

		applications.push({
			id: row.id,
			applicantName: profile.full_name,
			institutionName: profile.institution_name,
			submittedAt: row.submitted_at
		});
	}

	return applications;
}

/**
 * The four seat numbers, worked out from one answer.
 *
 * A seat that is not available was switched off by the organiser, so it is on
 * offer to nobody and counts towards none of these. Of the rest, one with a
 * `user_id` has somebody in it and one that only has a `delegation_id` is being
 * held for a delegation that has not yet said who is sitting in it.
 *
 * `committeeIds` is needed as well as the seats, because a committee with no
 * seat at all has no row here to be counted from.
 */
function toSeatCounts(seatRows: SeatRow[], committeeIds: string[]): SeatCounts {
	const committeesWithAnAvailableSeat = new Set<string>();
	let seatsAvailable = 0;
	let seatsFilled = 0;
	let seatsReserved = 0;

	for (const seat of seatRows) {
		if (!seat.is_available) {
			continue;
		}

		seatsAvailable += 1;
		committeesWithAnAvailableSeat.add(seat.committee_id);

		if (seat.user_id !== null) {
			seatsFilled += 1;
			continue;
		}

		if (seat.delegation_id !== null) {
			seatsReserved += 1;
		}
	}

	const committeesWithoutAvailableSeats = committeeIds.filter(
		(committeeId) => !committeesWithAnAvailableSeat.has(committeeId)
	);

	return {
		seatsAvailable,
		seatsFilled,
		seatsReserved,
		committeesWithoutAvailableSeatsCount: committeesWithoutAvailableSeats.length,
		onlyCommitteeWithoutSeatsId:
			committeesWithoutAvailableSeats.length === 1 ? committeesWithoutAvailableSeats[0] : null
	};
}

/** How many of these applications or delegations are waiting for a decision. */
function countSubmitted(rows: StatusRow[]): number {
	return rows.filter((row) => row.status === 'submitted').length;
}

/**
 * How much of this conference's money is in one state, in cents.
 *
 * Only `paid` and `unpaid` are ever asked for. A `waived`, a `refunded` and a
 * `void` invoice are money that is not coming, so they belong in neither of the
 * two figures rather than being folded into the unpaid one.
 */
function sumInvoiceAmounts(invoiceRows: InvoiceRow[], status: 'paid' | 'unpaid'): number {
	let total = 0;

	for (const row of invoiceRows) {
		if (row.status === status) {
			total += row.amount_cents;
		}
	}

	return total;
}

/** Every figure the conference dashboard shows, in one object. */
export async function loadConferenceDashboard(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<ConferenceDashboard> {
	// Wave one. None of these seven needs another's answer, so all seven are sent
	// at once and the page waits for the slowest of them rather than for the sum.
	const [
		conference,
		applicationRows,
		delegationRows,
		committeeIds,
		feeRows,
		invoiceRows,
		recentApplications
	] = await Promise.all([
		readDashboardConference(supabase, conferenceId),
		readSentStatuses(supabase, 'applications', conferenceId),
		readSentStatuses(supabase, 'delegations', conferenceId),
		readCommitteeIds(supabase, conferenceId),
		readFees(supabase, conferenceId),
		readInvoices(supabase, conferenceId),
		listRecentApplications(supabase, conferenceId)
	]);

	// Wave two. A seat belongs to a committee and carries no conference of its
	// own, so the seats can only be asked for once wave one has found the
	// committee ids. That is why this is a second wave and not an eighth query
	// alongside the first seven.
	const seatRows = await readSeats(supabase, committeeIds);
	const seatCounts = toSeatCounts(seatRows, committeeIds);

	return {
		stats: {
			applicationsTotal: applicationRows.length,
			applicationsToReview: countSubmitted(applicationRows),
			delegationsTotal: delegationRows.length,
			delegationsToReview: countSubmitted(delegationRows),
			seatsAvailable: seatCounts.seatsAvailable,
			seatsFilled: seatCounts.seatsFilled,
			seatsReserved: seatCounts.seatsReserved,
			invoicesPaidCents: sumInvoiceAmounts(invoiceRows, 'paid'),
			invoicesUnpaidCents: sumInvoiceAmounts(invoiceRows, 'unpaid'),
			currency: conference.currency
		},
		checklistCounts: {
			committeeCount: committeeIds.length,
			committeesWithoutAvailableSeatsCount: seatCounts.committeesWithoutAvailableSeatsCount,
			onlyCommitteeWithoutSeatsId: seatCounts.onlyCommitteeWithoutSeatsId,
			feeCount: feeRows.length,
			collectsPaymentsManually: conference.collects_payments_manually
		},
		recentApplications
	};
}

/**
 * The shapes the organiser area is drawn from, and the small pieces of wording
 * and navigation it works out for itself.
 *
 * `05-pages/organiser/manage-index.md` describes `/manage`: the organisations
 * the reader belongs to with their conferences, the conferences they only help
 * with, and any invitation waiting for them. `05-pages/organiser/dashboard.md`
 * describes `/manage/[slug]`, one conference's own dashboard. Fetching all of
 * that is `$lib/server/manage.ts`'s job. This file only holds the types those
 * queries fill in and the plain calculations the pages do on top of them, so
 * both can be read and tested without knowing any Svelte, and so that the
 * components have the shapes at all: a component may not import from
 * `$lib/server`, not even a type.
 *
 * Nothing here talks to Supabase or imports from `$lib/server`.
 */

import type { ResolvedPathname } from '$app/types';
import type { Conference } from '$lib/conferences';
import type { Database } from '$lib/database.types';
import type { ManagedOrganization } from '$lib/organizations';
import type { PublishChecklistCounts } from '$lib/publish-checklist';
import type { SetupProgress } from '$lib/setup-steps';
import { statusLabel } from '$lib/status';
import { conferenceUrl, manageConferenceUrl } from '$lib/urls';

/** A role in an organisation, such as `owner`. */
export type OrganizationRole = Database['public']['Enums']['organization_role'];

/** Which kind of thing an invitation is to. */
export type InviteKind = Database['public']['Enums']['invite_kind'];

/**
 * The three organisation roles, written out so that `inviteRoleLabel` can check
 * a plain piece of text against them. See the comment on that function.
 */
const ORGANIZATION_ROLES = ['owner', 'admin', 'member'] as const;

/**
 * The numbers a conference's row on `/manage` is drawn from, counted on the
 * server by `$lib/server/manage-list.ts`. `$lib/manage-list-row.ts` picks the
 * two its phase shows.
 */
export type ConferenceFigures = {
	/** Applications of every status but `draft`, which has not been sent to anybody. */
	applicationCount: number;
	/** The `submitted` ones, which are waiting for a decision. */
	toReviewCount: number;
	/** Seats the organisers are offering: `is_available` is true. */
	seatCount: number;
	/** Seats on offer that somebody sits in or a delegation is keeping. */
	heldSeatCount: number;
	/** The paid invoices added up, in cents, or `null` for a reader who may not read the invoices. */
	feesPaidCents: number | null;
	/** The conference's own currency, such as `GBP`. Every invoice of it is in this one. */
	currency: string;
};

/** One conference of an organisation the reader belongs to. */
export type ManagedConferenceSummary = {
	conference: Conference;
	figures: ConferenceFigures;
	/**
	 * Which setup steps a draft has done, or `null` for a conference that is
	 * already published or archived and so has nothing left to set up.
	 */
	setupProgress: SetupProgress | null;
	/**
	 * Whether the reader may open the conference's management area. A plain
	 * member of the organisation who holds no role on the conference may not:
	 * `/manage` names it, without a link, and says "Not on the team".
	 */
	isOnTeam: boolean;
};

/** One organisation, what the reader is in it, and its conferences. */
export type OrganizationGroupData = {
	organization: ManagedOrganization;
	myRole: OrganizationRole;
	conferences: ManagedConferenceSummary[];
};

/** A conference the reader helps with but whose organisation they are not in. */
export type StaffConference = {
	conference: Conference;
	/** The names of the roles they hold on it, in the conference's order: "Chair", "Press". */
	roleNames: string[];
	/** Whether those roles open `/manage/[slug]`, which `requireTeamMember` decides. */
	mayManage: boolean;
};

/** An invitation waiting for the reader. */
export type PendingInvite = {
	/**
	 * The row's id, which the Accept button posts. The link's secret token is
	 * not here: `list_my_invites` stopped handing it out (security review H1).
	 */
	id: string;
	kind: InviteKind;
	/** An `organization_role` value, or the name of the conference role the invitation offers. */
	role: string;
	/** The organisation's or the conference's name, whichever the invitation is to. */
	name: string;
};

/** Everything `/manage` shows, in one object. */
export type ManageIndex = {
	organizations: OrganizationGroupData[];
	staffConferences: StaffConference[];
	pendingInvites: PendingInvite[];
};

/**
 * Does this person run nothing at all? Decides whether the page is its empty
 * state.
 *
 * A waiting invitation is not counted. It is drawn above either answer, because
 * `/manage` is where an invitation is accepted, and somebody who has only been
 * invited to something still runs nothing until they accept it — so they get
 * the invitation and the empty state together rather than a page with one
 * notice and nothing under it.
 */
export function isManagingNothing(index: ManageIndex): boolean {
	return index.organizations.length === 0 && index.staffConferences.length === 0;
}

/**
 * The words for an invitation's role: "Owner", "Chair".
 *
 * An organisation invitation carries an `organization_role` value, which cannot
 * be handed straight to `statusLabel` without being checked against the list
 * above, because the same field carries a conference role's name for a
 * conference invitation. A conference role is named by its conference, so its
 * name is already the words to show.
 */
export function inviteRoleLabel(invite: PendingInvite): string {
	const organizationRole = ORGANIZATION_ROLES.find((role) => role === invite.role);

	if (organizationRole) {
		return statusLabel('organization_role', organizationRole);
	}

	return invite.role;
}

/** The sentence a pending invitation shows: "You were invited to Sample MUN as Owner." */
export function inviteSentence(invite: PendingInvite): string {
	return `You were invited to ${invite.name} as ${inviteRoleLabel(invite)}.`;
}

/**
 * Where a row under "Conferences you help with" leads.
 *
 * Only somebody whose roles open a management page is sent to the management
 * area. Sending anybody else to `/manage/[slug]` would give them a 404, so a
 * chair or a volunteer goes to the conference's public page instead.
 */
export function staffConferenceHref(staffConference: StaffConference): ResolvedPathname {
	if (staffConference.mayManage) {
		return manageConferenceUrl(staffConference.conference.slug);
	}

	return conferenceUrl(staffConference.conference.slug);
}

/** The numbers along the top of the conference dashboard. */
export type DashboardStats = {
	/** Applications of every status but `draft`. A draft has not been sent to anybody. */
	applicationsTotal: number;
	/** The `submitted` ones, which are the ones waiting for a decision. */
	applicationsToReview: number;
	delegationsTotal: number;
	delegationsToReview: number;
	/** Seats the organisers are offering: `is_available` is true. */
	seatsAvailable: number;
	/** Available seats with somebody in them. */
	seatsFilled: number;
	/** Available seats held for a delegation that has not named a member yet. */
	seatsReserved: number;
	invoicesPaidCents: number;
	invoicesUnpaidCents: number;
	/** The conference's own currency, such as `EUR`. Every invoice of it is in this one. */
	currency: string;
};

/** One row of the dashboard's "Recent applications" list. */
export type RecentApplication = {
	id: string;
	applicantName: string;
	/** The applicant's school or university, or `null` when they gave none. */
	institutionName: string | null;
	/** An ISO timestamp. `null` would mean a row that is `submitted` without a moment, which a trigger prevents. */
	submittedAt: string | null;
};

/** Everything `loadConferenceDashboard` in `$lib/server/manage.ts` reads, in one object. */
export type ConferenceDashboard = {
	stats: DashboardStats;
	/**
	 * Everything the checklist needs except `isStripeConnected`, which the
	 * `/manage/[slug]` layout already has on the organisation.
	 */
	checklistCounts: Omit<PublishChecklistCounts, 'isStripeConnected'>;
	recentApplications: RecentApplication[];
};

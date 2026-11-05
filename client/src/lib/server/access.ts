/**
 * The checks a `load` function or a form action runs before it does anything
 * else: who is signed in, and are they allowed on this page.
 *
 * Files under `$lib/server` only ever run on the server. These checks are here
 * rather than written out on each page so that there is one place to read and
 * one place to fix. They are the first of two locks: Row Level Security in the
 * database is the second, so a page that forgets to call one still cannot leak
 * anything.
 *
 * On a conference, what a reader may do comes from the roles they hold on its
 * team (`docs/roles-and-permissions.md`). The checks below ask the database's
 * own helpers, `has_permission` and `has_committee_permission`, which are the
 * ones its policies ask, so a page and the database can never disagree.
 */

import { error, redirect } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommitteeTools } from '$lib/chair-frame';
import type { ChairCommittee } from '$lib/chair-room';
import type { Conference } from '$lib/conferences';
import type { Delegation, DelegationConference, DelegationRole } from '$lib/delegations';
import { mayOpenManageArea, mayOpenManagePage, type ManagePage } from '$lib/manage-pages';
import {
	isOrganizationAdmin,
	type OrganizationRole,
	type OrganizationSettings
} from '$lib/organizations';
import {
	hasPermission,
	hasPermissionSomewhere,
	type MyPermissions,
	type Permission
} from '$lib/permissions';
import { loginUrl, welcomeUrl } from '$lib/urls';
import { getChairCommittee } from './committee-room';
import { getConferenceBySlug } from './conferences';
import { getDelegationForMember } from './delegations';
import { readMyPermissions } from './my-permissions';
import { getOrganizationSettings, readMyOrganizationRole } from './organizations';

/**
 * The address to send somebody back to once they have finished the welcome page.
 *
 * A form action's address carries the action's own name as a query parameter
 * whose name starts with a slash, as in `/create?/details`. That is a parameter
 * SvelteKit puts there to say which action is being posted to, and it means
 * nothing on an ordinary visit, so it is dropped: coming back from `/welcome`
 * should reopen the page, not aim at one of its buttons.
 */
function pathToComeBackTo(url: URL): string {
	const parameters = new URLSearchParams(url.searchParams);

	for (const name of [...parameters.keys()]) {
		if (name.startsWith('/')) {
			parameters.delete(name);
		}
	}

	const query = parameters.toString();

	return query === '' ? url.pathname : `${url.pathname}?${query}`;
}

/** Who the signed-in visitor is, taken from the access token their browser sent. */
export type SignedInUser = {
	/** Their `auth.users` id, which is also `profiles.id`. */
	id: string;
	email: string;
};

/**
 * The signed-in visitor, or a redirect to the sign in page.
 *
 * `redirect` throws, so this either returns a real user or never returns at
 * all. The page they were trying to reach travels in `?next=`, and signing in
 * sends them back to it.
 *
 * `303` is the status for "the thing you asked for is over there, and go and
 * get it with a GET". It is the right one after a form post as well as for a
 * plain page view, which is why the same call works in an action.
 */
export async function requireUser(locals: App.Locals, url: URL): Promise<SignedInUser> {
	const claims = await locals.getVerifiedClaims();

	if (!claims) {
		redirect(303, loginUrl(url.pathname + url.search));
	}

	return { id: String(claims.sub), email: String(claims.email ?? '') };
}

/**
 * The signed-in visitor, who has also finished the welcome page.
 *
 * `02-architecture/auth-and-onboarding.md` says every signed-in page sends
 * somebody to `/welcome` until `profiles.onboarding_completed_at` is set, so
 * that an organiser never receives an application from a person with no name,
 * school or country. `/logout`, `/settings` and `/welcome` itself are the
 * exceptions and call `requireUser` instead.
 *
 * `/invites/[token]` is listed with those three in the module map, but it calls
 * this one: `05-pages/auth/invite.md` says a person who has not finished the
 * welcome page is sent to `/welcome?next=/invites/<token>` and comes back to
 * accept afterwards, which is exactly what this function does. What that page
 * cannot use is `requireUser` on its own, because a signed-*out* visitor has to
 * go to the register form with the invited address filled in rather than to the
 * sign in page; it looks the invitation up and sends them there itself before
 * it ever gets here.
 *
 * The page they were heading for travels in `?next=`, so the welcome form sends
 * them on to it afterwards. Like `requireUser`, this either returns a real user
 * or never returns at all.
 */
export async function requireOnboarded(locals: App.Locals, url: URL): Promise<SignedInUser> {
	const user = await requireUser(locals, url);

	// `my_profile_state` is the one-row view of the signed-in person's own
	// `is_platform_admin` and `onboarding_completed_at`. Those two columns of
	// `profiles` are granted to nobody, so that no other user can read them
	// (migration 20261022132000); the view reads them as its owner for the
	// person they belong to and nobody else.
	const { data, error } = await locals.supabase
		.from('my_profile_state')
		.select('onboarding_completed_at')
		.eq('id', user.id)
		.maybeSingle()
		.overrideTypes<{ onboarding_completed_at: string | null }, { merge: false }>();

	if (error) {
		throw new Error(`Could not read the profile: ${error.message}`);
	}

	// No profile row at all should be impossible: every account made since
	// migration 0002 gets one from the `handle_new_user` trigger, and migration
	// 0004 wrote the rows for the accounts older than it. Should one turn up
	// anyway, treating it as "not onboarded" is the safe answer, because the
	// welcome page is where a profile is filled in.
	if (!data?.onboarding_completed_at) {
		redirect(303, welcomeUrl(pathToComeBackTo(url)));
	}

	return user;
}

/** What a page under `/manage/[slug]` says when the reader may not be there. */
const NO_SUCH_CONFERENCE = 'This conference does not exist.';

/**
 * Ask the database whether the signed-in reader holds a permission anywhere on
 * this conference: through a role that applies to the whole of it, or as an
 * owner or admin of the organisation running it.
 *
 * The helper takes its arguments under the names the migration that defines
 * it gives them. The answer is destructured as `helperError` because `error`
 * is already the name of SvelteKit's function above.
 *
 * A failed call answers `false`, which here means the reader is turned away.
 * That is the safe direction: a page that cannot check whether somebody belongs
 * on it should not show them what is on it.
 */
export async function askHasPermission(
	supabase: SupabaseClient,
	conferenceId: string,
	permission: Permission
): Promise<boolean> {
	const { data, error: helperError } = await supabase.rpc('has_permission', {
		conference_id: conferenceId,
		permission
	});

	if (helperError) {
		return false;
	}

	return data === true;
}

/**
 * The same question as `askHasPermission`, for an action that tells the reader
 * why it refused them. There a failed call cannot be a quiet "no": the reader
 * would be told that their role is missing something it holds. So a failed
 * call is an error page instead, and only the database's own answer is "no".
 */
export async function askHasPermissionOrThrow(
	supabase: SupabaseClient,
	conferenceId: string,
	permission: Permission
): Promise<boolean> {
	const { data, error: helperError } = await supabase.rpc('has_permission', {
		conference_id: conferenceId,
		permission
	});

	if (helperError) {
		throw new Error(`Could not check your permissions: ${helperError.message}`);
	}

	return data === true;
}

/**
 * The signed-in, onboarded visitor and the conference, or a 404.
 *
 * `error` and `redirect` both work by throwing, so this either returns a real
 * conference or never returns at all.
 */
async function requireConference(
	locals: App.Locals,
	url: URL,
	slug: string
): Promise<{ user: SignedInUser; conference: Conference }> {
	const user = await requireOnboarded(locals, url);

	// `getConferenceBySlug` puts no status filter on its query, so a team member
	// opening their own draft finds it here.
	const conference = await getConferenceBySlug(locals.supabase, slug);

	if (!conference) {
		error(404, NO_SUCH_CONFERENCE);
	}

	return { user, conference };
}

/**
 * The signed-in visitor and the conference, for somebody who holds
 * `permission` on the whole of it.
 *
 * Every form action under `/manage/[slug]` and `/create/[slug]` starts with
 * this, because an action is its own request and nothing `load` worked out
 * carries over to it.
 *
 * All three ways of not belonging here — no such conference, a conference Row
 * Level Security withheld, and a plain "no" from the helper — are the same 404
 * and never a 403, so that the page cannot be used to find out which private
 * conferences exist.
 */
export async function requirePermission(
	locals: App.Locals,
	url: URL,
	slug: string,
	permission: Permission
): Promise<{ user: SignedInUser; conference: Conference }> {
	const { user, conference } = await requireConference(locals, url, slug);

	const isPermitted = await askHasPermission(locals.supabase, conference.id, permission);

	if (!isPermitted) {
		error(404, NO_SUCH_CONFERENCE);
	}

	return { user, conference };
}

/**
 * `requirePermission`, also answering everything the reader holds on the
 * conference, for an action that has to apply the rank rule as well: the
 * team page's and the roles editor's. Their `load` reads the same from the
 * layout, but an action is handed nothing `load` worked out.
 */
export async function requirePermissionAndRank(
	locals: App.Locals,
	url: URL,
	slug: string,
	permission: Permission
): Promise<{ user: SignedInUser; conference: Conference; permissions: MyPermissions }> {
	const { user, conference } = await requireConference(locals, url, slug);
	const permissions = await readMyPermissions(locals.supabase, conference.id, user.id);

	if (!hasPermission(permissions, permission)) {
		error(404, NO_SUCH_CONFERENCE);
	}

	return { user, conference, permissions };
}

/**
 * `requirePermissionAndRank` for a permission that narrows to committees: the
 * reader passes holding `permission` conference-wide, or on a role that
 * applies per committee. The action then asks of each committee it touches,
 * with `permissions`, whether that one is the reader's.
 */
export async function requirePermissionSomewhere(
	locals: App.Locals,
	url: URL,
	slug: string,
	permission: Permission
): Promise<{ user: SignedInUser; conference: Conference; permissions: MyPermissions }> {
	const { user, conference } = await requireConference(locals, url, slug);
	const permissions = await readMyPermissions(locals.supabase, conference.id, user.id);

	if (!hasPermissionSomewhere(permissions, permission)) {
		error(404, NO_SUCH_CONFERENCE);
	}

	return { user, conference, permissions };
}

/**
 * The signed-in visitor, the conference and everything they hold on it, for
 * the layout of `/manage/[slug]`.
 *
 * The management area opens for anybody holding a permission that opens one
 * of its pages (`$lib/manage-pages.ts`). Everybody else gets the 404 a
 * conference that does not exist gets.
 */
export async function requireTeamMember(
	locals: App.Locals,
	url: URL,
	slug: string
): Promise<{ user: SignedInUser; conference: Conference; permissions: MyPermissions }> {
	const { user, conference } = await requireConference(locals, url, slug);

	const permissions = await readMyPermissions(locals.supabase, conference.id, user.id);

	if (!mayOpenManageArea(permissions)) {
		error(404, NO_SUCH_CONFERENCE);
	}

	return { user, conference, permissions };
}

/**
 * Turn the reader away from one page of the management area unless what they
 * hold opens it. A page's `load` calls this with the `permissions` the layout
 * read, so it asks the database nothing more.
 */
export function requireManagePage(permissions: MyPermissions, page: ManagePage): void {
	if (!mayOpenManagePage(permissions, page)) {
		error(404, NO_SUCH_CONFERENCE);
	}
}

/** What `/manage/organizations/[orgSlug]` says when the reader may not be there. */
const NO_SUCH_ORGANIZATION = 'This organisation does not exist.';

/**
 * The signed-in visitor, the organisation and their role in it, for
 * `/manage/organizations/[orgSlug]`.
 *
 * Everybody may *read* an organisation — its select policy is open to
 * everybody, because the public organisation page shows one to a visitor. So finding the row says nothing
 * about whether this reader belongs on the settings page, and the membership is
 * what decides. Somebody who is not a member gets the same 404 as somebody
 * asking for a slug nobody has, so the page cannot be used to find out which
 * organisations exist and who runs them.
 *
 * `error` and `redirect` both work by throwing, so this either returns a real
 * organisation or never returns at all.
 */
export async function requireOrganizationMember(
	locals: App.Locals,
	url: URL,
	orgSlug: string
): Promise<{ user: SignedInUser; organization: OrganizationSettings; myRole: OrganizationRole }> {
	const user = await requireOnboarded(locals, url);

	const organization = await getOrganizationSettings(locals.supabase, orgSlug);

	if (!organization) {
		error(404, NO_SUCH_ORGANIZATION);
	}

	const myRole = await readMyOrganizationRole(locals.supabase, organization.id, user.id);

	if (!myRole) {
		error(404, NO_SUCH_ORGANIZATION);
	}

	return { user, organization, myRole };
}

/**
 * The same, but only for an owner or an admin.
 *
 * `organization-settings.md` lets a plain member read the page and none of its
 * forms, so `load` calls `requireOrganizationMember` above and every action
 * calls this one. An action is its own request and is handed nothing `load`
 * worked out, which is why the check is made again rather than trusted.
 *
 * A member who posts a form anyway gets the 404 a non-member gets, not a 403,
 * which is the rule for the whole app.
 */
export async function requireOrganizationAdmin(
	locals: App.Locals,
	url: URL,
	orgSlug: string
): Promise<{ user: SignedInUser; organization: OrganizationSettings; myRole: OrganizationRole }> {
	const membership = await requireOrganizationMember(locals, url, orgSlug);

	if (!isOrganizationAdmin(membership.myRole)) {
		error(404, NO_SUCH_ORGANIZATION);
	}

	return membership;
}

/** What a page under `/delegations/[delegationId]` says when the reader may not be there. */
const NO_SUCH_DELEGATION = 'This delegation does not exist.';

/** What both of the delegation checks below answer with. */
export type DelegationAccess = {
	user: SignedInUser;
	delegation: Delegation;
	conference: DelegationConference;
	myRole: DelegationRole;
};

/**
 * The signed-in visitor, the delegation, its conference and their role in it,
 * for a page under `/delegations/[delegationId]`.
 *
 * The same pair as `requireOrganizationMember` and `requireOrganizationAdmin`
 * above, one level down: the membership is what decides, and somebody who is
 * not in this delegation gets the same 404 as somebody asking for an id nobody
 * has. That includes the organisers of the conference, who *can* read the row
 * — the `delegations` select policy is "member; org." — and who read a
 * delegation on their own review page instead. Never a 403, which is the rule
 * for the whole app, so that the page cannot be used to find out which
 * delegations exist.
 *
 * `error` and `redirect` both work by throwing, so this either returns a real
 * delegation or never returns at all.
 */
export async function requireDelegationMember(
	locals: App.Locals,
	url: URL,
	delegationId: string
): Promise<DelegationAccess> {
	const user = await requireOnboarded(locals, url);

	const membership = await getDelegationForMember(locals.supabase, delegationId, user.id);

	if (!membership) {
		error(404, NO_SUCH_DELEGATION);
	}

	return {
		user,
		delegation: membership.delegation,
		conference: membership.conference,
		myRole: membership.myRole
	};
}

/**
 * The same, but only for a head.
 *
 * `05-pages/delegation/dashboard.md` lets a member read the dashboard and none
 * of its three forms, so `load` calls `requireDelegationMember` above and every
 * action calls this one. An action is its own request and is handed nothing
 * `load` worked out, which is why the check is made again rather than trusted.
 *
 * A plain member who posts a form anyway gets the 404 a stranger gets.
 */
export async function requireDelegationHead(
	locals: App.Locals,
	url: URL,
	delegationId: string
): Promise<DelegationAccess> {
	const membership = await requireDelegationMember(locals, url, delegationId);

	if (membership.myRole !== 'head') {
		error(404, NO_SUCH_DELEGATION);
	}

	return membership;
}

/** What a chair page says when the reader may not be there. */
const NO_SUCH_COMMITTEE = 'This committee does not exist.';

/**
 * Ask the database whether the signed-in reader holds a permission in this
 * committee: anywhere on its conference, or in this committee through a role
 * that applies to the committees they are assigned to. A failed call answers
 * `false`, for the reason `askHasPermission` gives.
 */
async function askHasCommitteePermission(
	supabase: SupabaseClient,
	committeeId: string,
	permission: Permission
): Promise<boolean> {
	const { data, error: helperError } = await supabase.rpc('has_committee_permission', {
		committee_id: committeeId,
		permission
	});

	if (helperError) {
		return false;
	}

	return data === true;
}

/** Everything a chair page is handed once `requireCommitteePermission` lets the reader in. */
export type ChairAccess = {
	user: SignedInUser;
	conference: Conference;
	committee: ChairCommittee;
};

/**
 * The signed-in visitor, the conference and the committee, for a page under
 * `/conferences/[slug]/committees/[committeeSlug]/chair`, for somebody who
 * holds `permission` in this committee.
 *
 * A visitor goes to sign in first. Anybody signed in without the permission
 * gets the same 404 as somebody asking for a committee that does not exist,
 * so the page cannot be used to find out who chairs what. Every form action
 * calls this again, because an action is its own request.
 *
 * `error` and `redirect` both work by throwing, so this either returns or never
 * returns at all.
 */
export async function requireCommitteePermission(
	locals: App.Locals,
	url: URL,
	slug: string,
	committeeSlug: string,
	permission: Permission
): Promise<ChairAccess> {
	const user = await requireOnboarded(locals, url);
	const conference = await getConferenceBySlug(locals.supabase, slug);

	if (!conference) {
		error(404, NO_SUCH_COMMITTEE);
	}

	const committee = await getChairCommittee(locals.supabase, conference.id, committeeSlug);

	if (!committee) {
		error(404, NO_SUCH_COMMITTEE);
	}

	const isPermitted = await askHasCommitteePermission(locals.supabase, committee.id, permission);

	if (!isPermitted) {
		error(404, NO_SUCH_COMMITTEE);
	}

	return { user, conference, committee };
}

/**
 * Turn the reader away from one of the console's own pages (Papers, Notes,
 * Awards) unless the chair layout found they may open it. The layout already
 * let them into the console for `run_room`; each of these asks its own
 * permission in the committee as well. The same 404 as a missing committee.
 */
export function requireCommitteeTool(tools: CommitteeTools, tool: keyof CommitteeTools): void {
	if (!tools[tool]) {
		error(404, NO_SUCH_COMMITTEE);
	}
}

/**
 * Ask the database one yes-or-no question about the reader, by the name of the
 * helper and its one argument. A failed call answers `false`, for the reason
 * `askHasPermission` gives.
 */
async function askHelper(
	supabase: SupabaseClient,
	helperName: 'is_committee_delegate' | 'is_conference_staff',
	helperArguments: { committee_id: string } | { conference_id: string }
): Promise<boolean> {
	const { data, error: helperError } = await supabase.rpc(helperName, helperArguments);

	if (helperError) {
		return false;
	}

	return data === true;
}

/**
 * The signed-in visitor, the conference and the committee, for the delegate
 * live view at `/conferences/[slug]/committees/[committeeSlug]/live`.
 *
 * `05-pages/delegate/committee-live.md` lets in a delegate holding a seat in
 * this committee and anybody on the conference's staff, which includes chairs
 * of the other committees and the organisers. Both helpers are the ones the
 * room tables' select policies ask. Everybody else signed in gets the same 404
 * as somebody asking for a committee that does not exist, and a visitor goes
 * to sign in first, exactly as `requireCommitteePermission` does.
 *
 * `error` and `redirect` both work by throwing, so this either returns or never
 * returns at all.
 */
export async function requireRoomWatcher(
	locals: App.Locals,
	url: URL,
	slug: string,
	committeeSlug: string
): Promise<ChairAccess> {
	const user = await requireOnboarded(locals, url);
	const conference = await getConferenceBySlug(locals.supabase, slug);

	if (!conference) {
		error(404, NO_SUCH_COMMITTEE);
	}

	const committee = await getChairCommittee(locals.supabase, conference.id, committeeSlug);

	if (!committee) {
		error(404, NO_SUCH_COMMITTEE);
	}

	const [isDelegate, isStaff] = await Promise.all([
		askHelper(locals.supabase, 'is_committee_delegate', { committee_id: committee.id }),
		askHelper(locals.supabase, 'is_conference_staff', { conference_id: conference.id })
	]);

	if (!isDelegate && !isStaff) {
		error(404, NO_SUCH_COMMITTEE);
	}

	return { user, conference, committee };
}

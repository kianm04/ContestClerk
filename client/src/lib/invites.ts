/**
 * The shape of one invitation as the person who was invited sees it, and the
 * words the accept page says about it.
 *
 * `05-pages/auth/invite.md` describes `/invites/[token]`: the card somebody
 * lands on from an invitation link, which turns one click into an organisation
 * membership or a place on a conference's team. The `get_invite(token)`
 * function in the database is what the page is given; this file holds that
 * answer's shape with the columns renamed to camelCase, and the three sentences
 * the page builds from it.
 *
 * Two neighbours say something about invitations as well, and each says it to
 * somebody else. `$lib/manage.ts` writes the line `/manage` draws on an
 * invitation waiting for the reader, in title case ("You were invited to THIMUN
 * 2027 as Chair."). `$lib/team.ts` is the organiser's side: the invitations
 * they have sent and nobody has accepted. This file is the invited person's own
 * page, where the role is a word inside a sentence rather than a badge, so the
 * words here are lowercase ("as chair").
 *
 * Nothing here talks to Supabase or imports from `$lib/server`.
 */

import type { ResolvedPathname } from '$app/types';
import type { Database } from '$lib/database.types';
import { dayInTimezone, formatDateRange } from '$lib/dates';
import { roleNameInSentence } from '$lib/role-words';
import {
	chairRoomUrl,
	conferenceUrl,
	manageConferenceUrl,
	manageUrl,
	organizationSettingsUrl,
	signedInHomeUrl
} from '$lib/urls';

/** Which kind of thing an invitation is to. */
export type InviteKind = Database['public']['Enums']['invite_kind'];

/** Whether a conference role applies to the whole conference or only in assigned committees. */
export type RoleScope = Database['public']['Enums']['role_scope'];

/**
 * Whether an invitation can still be accepted, as `get_invite` works it out on
 * the server's clock: still open, already accepted, or past its `expiresAt`.
 */
export type InviteStatus = 'pending' | 'used' | 'expired';

/** What `get_invite(token)` tells the page, with the columns renamed to camelCase. */
export type InviteView = {
	kind: InviteKind;
	/**
	 * Only while this is `pending` does `get_invite` answer the identifying
	 * columns below: the address, the names and the slugs. For a used or
	 * expired link they are all `null`, so that a link that has done its work
	 * tells whoever holds it nothing about whom it was for (security review
	 * L18).
	 */
	status: InviteStatus;
	/**
	 * An `organization_role` value for an organisation invitation, or the name
	 * of the conference role a conference invitation offers ("Chair").
	 */
	role: string;
	/** What that conference role applies to. `null` for an organisation invitation. */
	roleScope: RoleScope | null;
	/** The permissions that role grants, as the database spells them. Empty for an organisation invitation. */
	rolePermissions: string[];
	/** The address the invitation was sent to, lowercased. `null` once it is used or expired. */
	email: string | null;
	organizationName: string | null;
	organizationSlug: string | null;
	conferenceName: string | null;
	conferenceSlug: string | null;
	committeeName: string | null;
	/** The name of the person who sent it, or `null` when their profile could not be read. */
	invitedByName: string | null;
	/** ISO timestamps. */
	expiresAt: string;
	acceptedAt: string | null;
};

/**
 * The word for each organisation role as it reads inside a sentence, from
 * `05-pages/auth/invite.md`.
 *
 * Every word here happens to be the value itself, so the lookup changes
 * nothing today. It is written out anyway because it says in one place what
 * this page calls a role, which is not what a badge calls one: `$lib/status.ts`
 * gives "Owner" in title case, and "as Owner" in the middle of a sentence reads
 * wrongly.
 */
const ORGANIZATION_ROLE_WORDS: Record<string, string> = {
	owner: 'owner',
	admin: 'admin',
	member: 'member'
};

/**
 * The word for a role inside a sentence: "owner" for an organisation role, and
 * "chair" or "USG delegate affairs" for one of a conference's own roles, whose
 * name is bent the way `roleNameInSentence` bends it.
 */
export function inviteRoleWord(role: string): string {
	return ORGANIZATION_ROLE_WORDS[role] ?? roleNameInSentence(role);
}

/**
 * Whatever the invitation is to: the organisation's name or the conference's.
 *
 * `get_invite` returns both columns because it reaches both tables, and an
 * invitation names exactly one of the two: `invites` carries either an
 * `organization_id` or a `conference_id`, never both, and its `kind` says
 * which. So the kind is what picks the name rather than "whichever is not
 * null". Empty text would mean a row that names neither, which the table does
 * not allow.
 */
export function invitedToName(invite: InviteView): string {
	if (invite.kind === 'organization_member') {
		return invite.organizationName ?? '';
	}

	return invite.conferenceName ?? '';
}

/**
 * The inviter's name, or `fallback` when it is not there.
 *
 * `get_invite` reaches the inviter's profile through a left join, so the name
 * is missing rather than the whole invitation being missing when the profile
 * cannot be read, and it withholds the name altogether once the invitation is
 * used or expired. The two sentences that name the inviter need different
 * words in that gap, which is why the fallback is passed in.
 */
function inviterOr(invite: InviteView, fallback: string): string {
	return invite.invitedByName ?? fallback;
}

/** "Nadia Haddad invited you to THIMUN 2027 as chair." */
export function invitationSentence(invite: InviteView): string {
	const inviter = inviterOr(invite, 'Somebody');
	const name = invitedToName(invite);

	return `${inviter} invited you to ${name} as ${inviteRoleWord(invite.role)}.`;
}

/** Why this invitation cannot be accepted, or `null` when it can. */
export type InviteProblem = {
	kind: 'mismatch' | 'expired' | 'used';
	message: string;
};

/**
 * The day an exact moment falls on, in UTC: "29 Sep 2026".
 *
 * Which day a moment belongs to depends on where you read it. An invitation
 * belongs to no conference's clock, so there is no timezone to prefer and UTC
 * is used, which is also the clock the `expires_at <= now()` check in
 * `accept_invite` runs on. Handing `formatDateRange` the same day twice writes
 * it as a single date; `applicationWindowBadge` in `$lib/conferences.ts` does
 * the same two steps with the conference's own timezone.
 */
function formatInviteDay(isoMoment: string): string {
	const day = dayInTimezone(new Date(isoMoment), 'UTC');

	return formatDateRange(day, day);
}

/**
 * Why this invitation cannot be accepted, or `null` when it can.
 *
 * A used or expired invitation is refused first, from the status `get_invite`
 * worked out, because for those the address is withheld and there is nothing
 * else to compare. The expiry is asked again against `now`, the moment the
 * page was drawn, for an invitation that ran out between the database
 * answering and the page being read; `now` is given rather than read from the
 * clock, because a pure function may not read the clock.
 *
 * An open invitation is then checked against `myEmail`, the address of whoever
 * is signed in, without regard to capitals on either side, because an address
 * is the same address however it was typed. Somebody signed in as the wrong
 * person is the one reader who can do something about what they are told.
 */
export function inviteProblem(
	invite: InviteView,
	myEmail: string,
	now: Date
): InviteProblem | null {
	if (invite.status === 'used') {
		return { kind: 'used', message: 'This invite was already used.' };
	}

	if (invite.status === 'expired' || new Date(invite.expiresAt).getTime() <= now.getTime()) {
		// Nobody is named: once an invitation has run out, `get_invite` keeps
		// who sent it to itself along with whom it was for.
		const expiryDate = formatInviteDay(invite.expiresAt);
		const message = `This invite expired on ${expiryDate}. Ask the person who invited you for a new one.`;

		return { kind: 'expired', message };
	}

	// An open invitation always carries its address. "another address" is
	// belt and braces for a row that somehow does not.
	if (invite.email === null || invite.email.toLowerCase() !== myEmail.toLowerCase()) {
		const inviter = inviterOr(invite, 'the organisers');
		const invitedAddress = invite.email ?? 'another address';
		const message = `This invite was sent to ${invitedAddress}. Log in with that address, or ask ${inviter} to invite ${myEmail}.`;

		return { kind: 'mismatch', message };
	}

	return null;
}

/**
 * One committee the reader chairs, as the accept page reads it after accepting
 * a chair invitation: enough to match it to the invitation and to build the
 * address of its chair room.
 */
export type ChairedCommittee = {
	committeeName: string;
	committeeSlug: string;
	conferenceSlug: string;
};

/**
 * Where somebody lands once they have accepted, which depends on what they
 * joined. `05-pages/auth/invite.md` lists the destinations: an organisation's
 * settings page, a conference's dashboard for somebody whose role is
 * everything, the committee's chair room for somebody whose role works per
 * committee and who was invited to one, and otherwise the conference page.
 *
 * The role's permissions and scope come from `get_invite`, so the page does not
 * have to know the conference's roles by name: a renamed "Organiser" still
 * leads to the dashboard, because it still holds `administrator`.
 *
 * `get_invite` names a chair's committee but gives no slug or id, so
 * `chairedCommittees` is every committee the reader chairs, read once the
 * invitation is accepted. The committee is found by conference and name, and
 * only exactly one match leads to its room: a conference may have two
 * committees of the same name, and then the conference page, which lists
 * both, is the safe answer (T161). Every other invitation can pass `[]`.
 */
export function destinationAfterAccepting(
	invite: InviteView,
	chairedCommittees: ChairedCommittee[]
): ResolvedPathname {
	if (invite.kind === 'organization_member') {
		// A membership row with no slug would be an invitation pointing at
		// nothing, which the table does not allow, but `get_invite` types the
		// column as nullable because the same row can be about a conference
		// instead. The organiser area lists every organisation, so it is the
		// safe answer.
		if (!invite.organizationSlug) {
			return manageUrl();
		}

		return organizationSettingsUrl(invite.organizationSlug);
	}

	// A conference invitation with no slug would be a row pointing at nothing,
	// which the table does not allow. Home is the safe answer all the same.
	if (!invite.conferenceSlug) {
		return signedInHomeUrl();
	}

	if (invite.rolePermissions.includes('administrator')) {
		return manageConferenceUrl(invite.conferenceSlug);
	}

	if (invite.roleScope === 'committees') {
		return chairDestination(invite.conferenceSlug, invite.committeeName, chairedCommittees);
	}

	return conferenceUrl(invite.conferenceSlug);
}

/**
 * The chair room of the one committee in this conference with the invitation's
 * committee name, or the conference page when there is none or more than one.
 */
function chairDestination(
	conferenceSlug: string,
	committeeName: string | null,
	chairedCommittees: ChairedCommittee[]
): ResolvedPathname {
	const matches = chairedCommittees.filter(
		(committee) =>
			committee.conferenceSlug === conferenceSlug && committee.committeeName === committeeName
	);

	if (committeeName === null || matches.length !== 1) {
		return conferenceUrl(conferenceSlug);
	}

	return chairRoomUrl(conferenceSlug, matches[0].committeeSlug);
}

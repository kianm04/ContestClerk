/**
 * What the reader of the team page may do to whom: the rank rule of
 * `docs/roles-and-permissions.md` (section 3, rules 5 and 6) as the team page
 * and its "Edit roles" dialog apply it.
 *
 * The database decides every change (`can_manage_role`, `can_manage_member`);
 * these let the page leave out a button or grey out a box the database would
 * refuse anyway, and let the server's actions refuse with a sentence before
 * asking it.
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

import { canManageRole, hasPermission, type MyPermissions } from '$lib/permissions';
import type {
	ChairStaffMember,
	PendingStaffInvite,
	RoleScope,
	TeamPerson,
	TeamRole
} from '$lib/team';

/** How the team page and the roles page name a role's scope. */
export function roleScopeWords(scope: RoleScope): string {
	return scope === 'committees' ? 'Assigned committees' : 'Whole conference';
}

/**
 * Somebody's rank: the position of their highest role, `-1` for an owner or
 * admin of the organisation, and `null` for somebody with no role at all, who
 * is below everybody. The database's `user_rank`.
 */
export function personRank(person: TeamPerson): number | null {
	if (person.source === 'organization') {
		return -1;
	}

	if (person.roles.length === 0) {
		return null;
	}

	return Math.min(...person.roles.map((role) => role.position));
}

/**
 * May the reader change this row: its roles, title and committees, or remove
 * it? Never their own row (rule 6), never a row from the organisation, whose
 * owners and admins cannot be changed from a conference (rule 4), and
 * otherwise only somebody ranked below them. An administrator may change
 * anybody else. The database's `can_manage_member`.
 */
export function mayActOnPerson(
	mine: MyPermissions,
	person: TeamPerson,
	viewerUserId: string | null
): boolean {
	if (person.source === 'organization' || person.userId === viewerUserId) {
		return false;
	}

	if (hasPermission(mine, 'administrator')) {
		return true;
	}

	const theirRank = personRank(person) ?? Number.MAX_SAFE_INTEGER;
	const myRank = mine.rank ?? Number.MAX_SAFE_INTEGER;

	return theirRank > myRank;
}

/**
 * Is the reader an administrator, or ranked above somebody of this rank? The
 * database's `can_manage_member`, which every `committee_chairs` write policy
 * asks (security review L5). A `null` rank is somebody with no role at all.
 */
function mayManageChair(mine: MyPermissions, theirRank: number | null): boolean {
	if (hasPermission(mine, 'administrator')) {
		return true;
	}

	const myRank = mine.rank ?? Number.MAX_SAFE_INTEGER;

	return (theirRank ?? Number.MAX_SAFE_INTEGER) > myRank;
}

/**
 * May the reader make this person a chair of a committee? An administrator
 * may make anybody one; anybody else only somebody ranked below them, so the
 * committee editor's picker leaves out the people the database would refuse.
 * The one it cannot see is a platform admin, whom `user_rank` ranks `-1`
 * (see `readTeamRanks`), and the database's refusal covers them.
 */
export function mayAssignChair(mine: MyPermissions, member: ChairStaffMember): boolean {
	return mayManageChair(mine, member.rank);
}

/**
 * May the reader take a chair of this rank off a committee? The same rule as
 * making them one, so an administrator may take anybody off, themselves
 * included, and anybody else only somebody ranked below them: never a peer,
 * an owner, or themselves.
 */
export function mayRemoveChair(mine: MyPermissions, chairRank: number | null): boolean {
	return mayManageChair(mine, chairRank);
}

/**
 * May the reader press "Chair it yourself"? Nobody ranks below themselves, so
 * by the rule `mayAssignChair` follows only an administrator may.
 */
export function mayChairThemselves(mine: MyPermissions): boolean {
	return hasPermission(mine, 'administrator');
}

/**
 * May the reader send this invitation again or revoke it? Only when they may
 * give the role it hands over, the way they could have sent it. The `invites`
 * delete policy asks `can_manage_role` (migration 20261023121000), so an
 * invitation to a role at or above the reader's own shows no buttons the
 * database would refuse. Its sender may also withdraw it, even after being
 * moved to or below the role, but by then it can no longer be accepted, so the
 * page leaves that to somebody who still ranks above it.
 */
export function mayChangeInvite(
	mine: MyPermissions,
	invite: PendingStaffInvite,
	roles: TeamRole[]
): boolean {
	const role = roles.find((candidate) => candidate.id === invite.roleId);

	return role !== undefined && canManageRole(mine, role);
}

/** The roles the reader may give and take, in the conference's order. */
export function giveableRoles(mine: MyPermissions, roles: TeamRole[]): TeamRole[] {
	return roles.filter((role) => canManageRole(mine, role));
}

/** One line of the "Edit roles" dialog. */
export type RoleChoice = {
	role: TeamRole;
	/** Whether the reader may tick or untick it. */
	isGiveable: boolean;
	/**
	 * The grey words at the line's end: the role's scope, or why it cannot be
	 * changed ("Above your role", "Your own role").
	 */
	aside: string;
};

/**
 * Every role of the conference as a line of the dialog. Roles at or above the
 * reader's own are listed all the same, disabled, so the dialog shows
 * everything the person holds.
 */
export function roleChoices(mine: MyPermissions, roles: TeamRole[]): RoleChoice[] {
	return roles.map((role) => {
		const isGiveable = canManageRole(mine, role);
		let aside = roleScopeWords(role.scope);

		if (!isGiveable && mine.rank !== null && role.position === mine.rank) {
			aside = 'Your own role';
		} else if (!isGiveable) {
			aside = 'Above your role';
		}

		return { role, isGiveable, aside };
	});
}

/**
 * The roles somebody should hold after the dialog is saved: the giveable roles
 * that were ticked, and every role they hold that the reader may not change,
 * which a disabled box does not send and which must not be lost because of it.
 * Ids that are not this conference's roles are dropped.
 */
export function rolesAfterEdit(
	mine: MyPermissions,
	roles: TeamRole[],
	person: TeamPerson,
	tickedRoleIds: string[]
): TeamRole[] {
	return roles.filter((role) => {
		if (canManageRole(mine, role)) {
			return tickedRoleIds.includes(role.id);
		}

		return person.roles.some((held) => held.id === role.id);
	});
}

/** The first word of somebody's name, which the dialog's hint calls them by. */
function firstName(fullName: string): string {
	return fullName.trim().split(/\s+/)[0] ?? fullName;
}

/**
 * The amber line under the dialog's boxes when a ticked role works per
 * committee and the person has no committee yet, so the role does nothing:
 * "Chair applies only in the committees Tomasz is assigned to, and Tomasz has
 * none yet. Assign one under Committees on Tomasz's row." `null` otherwise.
 */
export function committeeRoleHint(person: TeamPerson, tickedRoles: TeamRole[]): string | null {
	const perCommitteeRole = tickedRoles.find((role) => role.scope === 'committees');

	if (perCommitteeRole === undefined || person.committees.length > 0) {
		return null;
	}

	const name = firstName(person.fullName);

	return `${perCommitteeRole.name} applies only in the committees ${name} is assigned to, and ${name} has none yet. Assign one under Committees on ${name}’s row.`;
}

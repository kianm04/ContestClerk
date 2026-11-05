/**
 * The roles page and the role editor (`docs/roles-and-permissions.md`,
 * section 6): which rows the reader may change or move, what the editor's
 * boxes say, and what a posted role form means.
 *
 * The database decides every change (the policies on `conference_roles`);
 * these let the pages leave out a button the database would refuse anyway,
 * and let the server's actions answer with a sentence before asking it.
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

import {
	canChangeRole,
	canManageRole,
	grantablePermissions,
	PERMISSION_GROUPS,
	PERMISSION_KEYS,
	PERMISSIONS,
	permissionsOfGroup,
	withIncludedPermissions,
	type MyPermissions,
	type Permission,
	type PermissionGroupKey,
	type RoleScope
} from '$lib/permissions';

/** The longest name a role may have, the same forty the database checks. */
export const ROLE_NAME_MAX_LENGTH = 40;

/** One role as the roles page lists it. */
export type RoleSummary = {
	id: string;
	name: string;
	/** The conference's own order, lowest first, which is also the rank. */
	position: number;
	scope: RoleScope;
	isPublic: boolean;
	permissions: Permission[];
	/** How many people hold it. */
	memberCount: number;
	/** How many invitations nobody has accepted yet offer it. */
	invitationCount: number;
};

/** One row of the roles table, with what the reader may do to it. */
export type RoleTableRow = RoleSummary & {
	/** Whether the name links to the editor. */
	canEdit: boolean;
	canMoveUp: boolean;
	canMoveDown: boolean;
	/** The grey words beside a role the reader may not change, or `''`. */
	note: string;
};

/**
 * Why the reader may not change this role, in the words the roles table
 * shows beside its name, or `''` when they may.
 */
function lockedRoleNote(mine: MyPermissions, role: RoleSummary): string {
	if (!canManageRole(mine, role)) {
		return role.position === mine.rank ? 'Your role' : 'Above your role';
	}

	return canChangeRole(mine, role) ? '' : 'Holds permissions you do not have';
}

/**
 * The roles table's rows. A move swaps two roles, and the database checks
 * both as changed, so a move is offered only when the reader may change the
 * role and its neighbour on that side. The first role never moves up and the
 * last never moves down.
 */
export function roleTableRows(mine: MyPermissions, roles: RoleSummary[]): RoleTableRow[] {
	const changeable = roles.map((role) => canChangeRole(mine, role));

	return roles.map((role, index) => ({
		...role,
		canEdit: changeable[index],
		canMoveUp: changeable[index] && index > 0 && changeable[index - 1],
		canMoveDown: changeable[index] && index < roles.length - 1 && changeable[index + 1],
		note: lockedRoleNote(mine, role)
	}));
}

/** "1 member", "4 members". */
function countWords(count: number, singular: string): string {
	return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

/** The line under the editor's title: "4 members · 1 invitation", or "No members". */
export function roleCountLine(memberCount: number, invitationCount: number): string {
	const members = memberCount === 0 ? 'No members' : countWords(memberCount, 'member');

	if (invitationCount === 0) {
		return members;
	}

	return `${members} · ${countWords(invitationCount, 'invitation')}`;
}

/**
 * Why "Delete role" is disabled, or `null` while it may be pressed. Nobody may
 * hold a deleted role, so a role with members or invitations waits until
 * they are taken off it (rule 7).
 */
export function deleteRoleRefusal(memberCount: number, invitationCount: number): string | null {
	const holders: string[] = [];

	if (memberCount > 0) {
		holders.push(`take it off its ${countWords(memberCount, 'member')}`);
	}

	if (invitationCount > 0) {
		const invitations =
			invitationCount === 1 ? 'its invitation' : `its ${invitationCount} invitations`;
		holders.push(`withdraw ${invitations}`);
	}

	if (holders.length === 0) {
		return null;
	}

	return `To delete this role, first ${holders.join(' and ')} on the team page.`;
}

/** What the role form holds: a role before it has an id. */
export type RoleFormValues = {
	name: string;
	scope: RoleScope;
	isPublic: boolean;
	permissions: Permission[];
};

/** "Blank" in "Start from", and the form of a new role. */
export const BLANK_ROLE: RoleFormValues = {
	name: '',
	scope: 'conference',
	isPublic: false,
	permissions: []
};

/**
 * The new-role form copied from another role: its scope and the permissions
 * the reader may give on that scope. A permission the reader may not give
 * would only be refused on saving, so it is left off now.
 */
export function startFromRole(mine: MyPermissions, role: RoleSummary | undefined): RoleFormValues {
	if (role === undefined) {
		return BLANK_ROLE;
	}

	const grantable = grantablePermissions(mine, role.scope);

	return {
		...BLANK_ROLE,
		scope: role.scope,
		permissions: role.permissions.filter((key) => grantable.includes(key))
	};
}

/** One checkbox of "What this role can do". */
export type PermissionLine = {
	key: Permission;
	label: string;
	help: string;
	isPerCommittee: boolean;
	isChecked: boolean;
	isDisabled: boolean;
	/** The grey words at the line's end, such as "You do not have this yourself", or `''`. */
	aside: string;
};

/** One of the six groups, drawn as a section with its own title. */
export type PermissionSection = {
	key: PermissionGroupKey;
	title: string;
	note: string | null;
	lines: PermissionLine[];
};

/** The stronger permission that includes this one and is ticked, such as deciding for reading. */
function includedBy(key: Permission, permissions: Permission[]): Permission | undefined {
	return permissions.find((held) => PERMISSIONS[held].includes === key);
}

/**
 * The editor's boxes for a role of this scope holding these permissions.
 *
 * A box is disabled when the reader does not hold the permission (they may
 * not give it), when Administrator is ticked (it stands for everything), or
 * when a stronger ticked permission includes it. The last two are drawn
 * ticked, since the role has them all the same.
 */
export function permissionSections(
	mine: MyPermissions,
	values: Pick<RoleFormValues, 'scope' | 'permissions'>
): PermissionSection[] {
	const grantable = grantablePermissions(mine, values.scope);
	const isAdministratorRole = values.permissions.includes('administrator');

	function toLine(key: Permission): PermissionLine {
		const entry = PERMISSIONS[key];
		const lacks = !grantable.includes(key);
		const isCoveredByAdministrator = isAdministratorRole && key !== 'administrator';
		const includer = includedBy(key, values.permissions);
		const isHeld = values.permissions.includes(key);
		let aside = '';

		if (lacks) {
			aside = 'You do not have this yourself';
		} else if (isCoveredByAdministrator) {
			aside = 'Included in Administrator';
		} else if (includer !== undefined) {
			aside = `Included in ${PERMISSIONS[includer].label}`;
		} else if (
			values.scope === 'committees' &&
			!entry.perCommittee &&
			key !== 'administrator' &&
			isHeld
		) {
			// Section 4: on a per-committee role, these do nothing at all.
			aside = 'No effect per committee';
		}

		return {
			key,
			label: entry.label,
			help: entry.help,
			isPerCommittee: entry.perCommittee,
			isChecked: isHeld || isCoveredByAdministrator || includer !== undefined,
			isDisabled: lacks || isCoveredByAdministrator || includer !== undefined,
			aside
		};
	}

	return PERMISSION_GROUPS.map((group) => ({
		key: group.key,
		title: group.title,
		note: group.note,
		lines: permissionsOfGroup(group.key).map(toLine)
	}));
}

/** What is wrong with a posted role form, by field. */
export type RoleFormErrors = {
	name?: string;
};

/** A posted role form, read: what to save, or why not. */
export type RoleFormReading = {
	values: RoleFormValues;
	errors: RoleFormErrors;
};

/** Whether a posted value is one of the twenty-one permission keys. */
function isPermission(value: string): value is Permission {
	return (PERMISSION_KEYS as string[]).includes(value);
}

/**
 * Reads the role form as it was posted.
 *
 * Ticked permissions the reader may not give are dropped rather than refused,
 * because the form never offers them; only a crafted post sends one. With
 * Administrator ticked the role holds Administrator alone, since it stands for
 * the rest, and otherwise each ticked permission brings the ones it includes.
 *
 * `otherRoleNames` are the names of the conference's other roles, which this
 * one may not repeat in any capitalisation.
 */
export function readRoleForm(
	formData: FormData,
	mine: MyPermissions,
	otherRoleNames: string[]
): RoleFormReading {
	const name = String(formData.get('name') ?? '').trim();
	const scope: RoleScope = formData.get('scope') === 'committees' ? 'committees' : 'conference';
	const grantable = grantablePermissions(mine, scope);
	const ticked = formData
		.getAll('permission')
		.map(String)
		.filter(isPermission)
		.filter((key) => grantable.includes(key));

	const permissions = ticked.includes('administrator')
		? (['administrator'] satisfies Permission[])
		: withIncludedPermissions(ticked).filter((key) => grantable.includes(key));

	const errors: RoleFormErrors = {};

	if (name === '') {
		errors.name = 'Give the role a name.';
	} else if (name.length > ROLE_NAME_MAX_LENGTH) {
		errors.name = `Keep the name to ${ROLE_NAME_MAX_LENGTH} characters.`;
	} else if (otherRoleNames.some((other) => other.toLowerCase() === name.toLowerCase())) {
		errors.name = `There is already a role called ${name}.`;
	}

	return {
		values: { name, scope, isPublic: formData.has('isPublic'), permissions },
		errors
	};
}

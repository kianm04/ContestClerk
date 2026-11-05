/**
 * The twenty-one permissions a conference's roles are made of, and the rules
 * for reading them (`docs/roles-and-permissions.md`, sections 4 and 8, and
 * `docs/committee-papers.md`, section 8, which adds `answer_directives`).
 *
 * The role editor, the sidebar, the dashboard and the tests all read the
 * catalogue from here, so the words on screen and the database's `permission`
 * enum cannot drift apart: `PERMISSIONS` is typed as a record over that enum,
 * and a value added to the enum without a line here fails the type check.
 *
 * The rules below are the same ones the database's helpers write in SQL
 * (`has_permission`, `has_committee_permission`, `can_grant`,
 * `can_manage_role`). The database is still what decides; these let a page
 * leave out a link or a button the database would refuse anyway.
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

import type { Database } from '$lib/database.types';

/** One of the twenty-one switches, by its key in the database, such as `run_room`. */
export type Permission = Database['public']['Enums']['permission'];

/**
 * Where a role's permissions apply: `conference`, everywhere on it, or
 * `committees`, only in the committees each member is assigned to.
 */
export type RoleScope = Database['public']['Enums']['role_scope'];

/** The six groups of section 4, which the role editor draws as six sections. */
export type PermissionGroupKey =
	'conference' | 'committees' | 'applications' | 'participants' | 'money' | 'programme';

export type PermissionGroup = {
	key: PermissionGroupKey;
	title: string;
	/** One sentence the role editor shows under the group's title, or `null`. */
	note: string | null;
};

/** The groups in the order section 4 lists them. */
export const PERMISSION_GROUPS: PermissionGroup[] = [
	{ key: 'conference', title: 'Conference', note: null },
	{ key: 'committees', title: 'Committees and rooms', note: null },
	{
		key: 'applications',
		title: 'Applications',
		// Section 4: an answer to the conference's own question is read under
		// `read_applications`, whatever the question asks about.
		note: 'Answers to your own application questions are read by whoever reads applications, even a question about health.'
	},
	{ key: 'participants', title: 'Participants and private details', note: null },
	{ key: 'money', title: 'Money', note: null },
	{ key: 'programme', title: 'Programme and communication', note: null }
];

export type PermissionEntry = {
	/** The "Shown as" name: the checkbox's label. */
	label: string;
	/** The one line under the checkbox. */
	help: string;
	group: PermissionGroupKey;
	/**
	 * Whether the permission narrows to a member's assigned committees on a role
	 * whose scope is `committees`. The others do nothing on such a role.
	 */
	perCommittee: boolean;
	/** A weaker permission this one includes: deciding includes reading. */
	includes: Permission | null;
};

/** Every permission, in the order of section 4. */
export const PERMISSIONS: Record<Permission, PermissionEntry> = {
	administrator: {
		label: 'Administrator',
		help: 'Everything, including permissions added later. Hand it out rarely.',
		group: 'conference',
		perCommittee: false,
		includes: null
	},
	edit_conference: {
		label: 'Edit the conference',
		help: 'Details, publishing, the application form and the fee list.',
		group: 'conference',
		perCommittee: false,
		includes: null
	},
	manage_team: {
		label: 'Manage the team',
		help: 'Invite and remove people, give the roles below yours, assign committees.',
		group: 'conference',
		perCommittee: false,
		includes: null
	},
	manage_roles: {
		label: 'Manage roles',
		help: 'Create, edit, order and delete the roles below yours.',
		group: 'conference',
		perCommittee: false,
		includes: null
	},
	manage_committees: {
		label: 'Edit committees',
		help: 'Seat lists, agendas, background guides and resources.',
		group: 'committees',
		perCommittee: true,
		includes: null
	},
	run_room: {
		label: 'Run the committee room',
		help: 'The chair console: roll call, speakers’ lists, motions and votes.',
		group: 'committees',
		perCommittee: true,
		includes: null
	},
	review_papers: {
		label: 'Review position papers',
		help: 'Read every paper of the committee and approve it or send it back.',
		group: 'committees',
		perCommittee: true,
		includes: null
	},
	write_chair_notes: {
		label: 'Keep chair notes',
		help: 'Read the committee’s notes on delegates and write their own.',
		group: 'committees',
		perCommittee: true,
		includes: null
	},
	propose_awards: {
		label: 'Propose awards',
		help: 'Propose an award for a seat of the committee.',
		group: 'committees',
		perCommittee: true,
		includes: null
	},
	confirm_awards: {
		label: 'Confirm awards',
		help: 'Confirm or reject every committee’s proposals and publish them.',
		group: 'committees',
		perCommittee: false,
		includes: null
	},
	answer_directives: {
		label: 'Answer directives',
		help: 'Answer directives and press releases, and send crisis updates.',
		group: 'committees',
		perCommittee: true,
		includes: null
	},
	read_applications: {
		label: 'Read applications',
		help: 'Applications, delegations and allocation, every answer and the internal notes.',
		group: 'applications',
		perCommittee: false,
		includes: null
	},
	decide_applications: {
		label: 'Decide applications',
		help: 'Accept, reject and waitlist; allocate, revoke and move seats. Includes reading.',
		group: 'applications',
		perCommittee: false,
		includes: 'read_applications'
	},
	read_participants: {
		label: 'See the participants',
		help: 'Name, school, country, committee, seat and delegation of everyone taking part.',
		group: 'participants',
		perCommittee: true,
		includes: null
	},
	read_contact_details: {
		label: 'See contact details',
		help: 'Email addresses and phone numbers.',
		group: 'participants',
		perCommittee: true,
		includes: null
	},
	read_welfare_details: {
		label: 'See welfare details',
		help: 'Date of birth, dietary requirements and emergency contact.',
		group: 'participants',
		perCommittee: true,
		includes: null
	},
	read_invoices: {
		label: 'See invoices',
		help: 'Invoices and whether they are paid.',
		group: 'money',
		perCommittee: false,
		includes: null
	},
	manage_invoices: {
		label: 'Manage invoices',
		help: 'Mark paid, waive, refund and void, and export invoices. Includes seeing them.',
		group: 'money',
		perCommittee: false,
		includes: 'read_invoices'
	},
	edit_schedule: {
		label: 'Edit the programme',
		help: 'Add, change and remove programme events and rooms.',
		group: 'programme',
		perCommittee: true,
		includes: null
	},
	send_announcements: {
		label: 'Send announcements',
		help: 'To everyone, delegates or staff; per committee, to that committee.',
		group: 'programme',
		perCommittee: true,
		includes: null
	},
	manage_documents: {
		label: 'Manage documents',
		help: 'Upload and remove the handbook, rules and maps.',
		group: 'programme',
		perCommittee: false,
		includes: null
	}
};

/**
 * Every key, in catalogue order. `Object.keys` keeps the order the object was
 * written in, and answers plain strings, which is why the result is cast.
 */
export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as Permission[];

/** The permissions of one group, in catalogue order. */
export function permissionsOfGroup(group: PermissionGroupKey): Permission[] {
	return PERMISSION_KEYS.filter((key) => PERMISSIONS[key].group === group);
}

/** A role as the presets and the role editor describe it. */
export type RoleShape = {
	name: string;
	scope: RoleScope;
	isPublic: boolean;
	permissions: Permission[];
};

/**
 * The three roles every conference starts with, the same three the database's
 * `preset_conference_roles()` makes. The seeds and the tests use them too.
 */
export const PRESET_ROLES: RoleShape[] = [
	{ name: 'Organiser', scope: 'conference', isPublic: true, permissions: ['administrator'] },
	{
		name: 'Chair',
		scope: 'committees',
		isPublic: true,
		permissions: [
			'run_room',
			'review_papers',
			'write_chair_notes',
			'propose_awards',
			'send_announcements',
			'manage_committees',
			'read_participants',
			'answer_directives'
		]
	},
	{ name: 'Volunteer', scope: 'conference', isPublic: false, permissions: [] }
];

/** One row of the database's `my_permissions`: a permission and the widest scope it is held at. */
export type HeldPermission = {
	permission: Permission;
	scope: RoleScope;
};

/**
 * Everything the signed-in reader holds on one conference, read once per
 * request by `/manage/[slug]/+layout.server.ts` and handed down as
 * `data.permissions`.
 *
 * It is here rather than in `$lib/server` because components need its shape,
 * and a component may not import from `$lib/server`.
 */
export type MyPermissions = {
	held: HeldPermission[];
	/** The committees the reader is assigned to, where a `committees` role applies. */
	committeeIds: string[];
	/**
	 * The position of the reader's highest role: lower is higher. `-1` for an
	 * owner or admin of the organisation, `null` for somebody with no role.
	 */
	rank: number | null;
};

/** What somebody with no role at all holds. */
export const NO_PERMISSIONS: MyPermissions = { held: [], committeeIds: [], rank: null };

/**
 * Whether the reader holds `key` at `scope`, directly or through
 * `administrator`, which stands for every permission at the scope it is held.
 */
function isHeldAt(mine: MyPermissions, key: Permission, scope: RoleScope): boolean {
	return mine.held.some(
		(held) =>
			held.scope === scope && (held.permission === key || held.permission === 'administrator')
	);
}

/** May the reader do this anywhere on the conference? The database's `has_permission`. */
export function hasPermission(mine: MyPermissions, key: Permission): boolean {
	return isHeldAt(mine, key, 'conference');
}

/**
 * May the reader do this in one committee? Yes when they may anywhere, and yes
 * when they are assigned to the committee and hold the permission on a role
 * that applies per committee. The database's `has_committee_permission`.
 */
export function hasCommitteePermission(
	mine: MyPermissions,
	committeeId: string,
	key: Permission
): boolean {
	if (hasPermission(mine, key)) {
		return true;
	}

	return mine.committeeIds.includes(committeeId) && isHeldAt(mine, key, 'committees');
}

/**
 * May the reader do this somewhere: everywhere, or in their own committees for
 * a permission that narrows to them. A page that lists only the reader's own
 * committees opens on this.
 */
export function hasPermissionSomewhere(mine: MyPermissions, key: Permission): boolean {
	if (hasPermission(mine, key)) {
		return true;
	}

	return PERMISSIONS[key].perCommittee && isHeldAt(mine, key, 'committees');
}

/**
 * The permissions the reader may put on a role of this scope: every one they
 * hold, and on a conference-wide role only those they hold conference-wide.
 * An administrator may put on anything. The database's `can_grant`.
 */
export function grantablePermissions(mine: MyPermissions, scope: RoleScope): Permission[] {
	if (hasPermission(mine, 'administrator')) {
		return PERMISSION_KEYS;
	}

	return PERMISSION_KEYS.filter(
		(key) =>
			hasPermission(mine, key) || (scope === 'committees' && isHeldAt(mine, key, 'committees'))
	);
}

/**
 * The largest whole number JavaScript counts exactly, standing for "no rank":
 * somebody with no role is below every role and may manage none of them. The
 * database writes 2147483647 for the same thing.
 */
const NO_RANK = Number.MAX_SAFE_INTEGER;

/**
 * May the reader give, take, edit or delete this role? An administrator may
 * manage every role; anybody else only the roles strictly below their highest
 * one. The database's `can_manage_role`.
 */
export function canManageRole(mine: MyPermissions, role: { position: number }): boolean {
	if (hasPermission(mine, 'administrator')) {
		return true;
	}

	return role.position > (mine.rank ?? NO_RANK);
}

/**
 * May the reader change this role itself: its name, scope, permissions or
 * place in the order? Managing it is not enough. Every permission it holds has
 * to be one the reader may give (`can_grant`), because the database checks a
 * changed role as if it were being made anew, so somebody who may manage
 * roles but not run a room cannot even move Chair. Giving the role to
 * somebody needs only `canManageRole`.
 */
export function canChangeRole(
	mine: MyPermissions,
	role: { position: number; scope: RoleScope; permissions: Permission[] }
): boolean {
	const grantable = grantablePermissions(mine, role.scope);

	return canManageRole(mine, role) && role.permissions.every((key) => grantable.includes(key));
}

/**
 * The permissions with the ones they include added: a role that may decide
 * applications may read them, and one that may manage invoices may see them.
 * The role editor saves through this, so the database only ever has to look
 * for the weaker permission itself. Catalogue order, each key once.
 */
export function withIncludedPermissions(permissions: Permission[]): Permission[] {
	const wanted = new Set(permissions);

	for (const key of permissions) {
		const included = PERMISSIONS[key].includes;

		if (included !== null) {
			wanted.add(included);
		}
	}

	return PERMISSION_KEYS.filter((key) => wanted.has(key));
}

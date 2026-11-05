/**
 * Reading and writing a conference's roles for the roles page and the role
 * editor (`/manage/[slug]/team/roles`).
 *
 * Every write goes through the policies of `conference_roles`, which apply
 * the rank rule and `can_grant`: a refused write answers `'refused'` here and
 * the page says so, rather than an error page.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Permission, RoleScope } from '$lib/permissions';
import type { RoleFormValues, RoleSummary } from '$lib/roles';

/** One `conference_roles` row, the columns the pages read. */
type RoleRow = {
	id: string;
	name: string;
	position: number;
	scope: RoleScope;
	permissions: Permission[];
	is_public: boolean;
};

/** One row naming a role, from either the memberships or the invitations. */
type RoleIdRow = { role_id: string | null };

/** How many of these rows name each role. */
function countByRole(rows: RoleIdRow[]): Map<string, number> {
	const counts = new Map<string, number>();

	for (const row of rows) {
		if (row.role_id !== null) {
			counts.set(row.role_id, (counts.get(row.role_id) ?? 0) + 1);
		}
	}

	return counts;
}

/**
 * Every role of the conference in the order the pages show, with how many
 * people hold each and how many invitations offer it. Only the team opens
 * these pages, and the team may read all three tables, so a failure is a
 * fault and raises.
 */
export async function listRoleSummaries(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<RoleSummary[]> {
	const [roles, members, invitations] = await Promise.all([
		supabase
			.from('conference_roles')
			.select('id, name, position, scope, permissions, is_public')
			.eq('conference_id', conferenceId)
			// Two roles may share a position, so the name decides between them,
			// the same order `move_conference_role` reads.
			.order('position', { ascending: true })
			.order('name', { ascending: true })
			.overrideTypes<RoleRow[], { merge: false }>(),
		supabase
			.from('conference_role_members')
			.select('role_id')
			.eq('conference_id', conferenceId)
			.overrideTypes<RoleIdRow[], { merge: false }>(),
		supabase
			.from('invites')
			.select('role_id')
			.eq('conference_id', conferenceId)
			.eq('kind', 'conference_staff')
			// `is` asks for a column holding nothing: the invitations still waiting.
			.is('accepted_at', null)
			.overrideTypes<RoleIdRow[], { merge: false }>()
	]);

	const error = roles.error ?? members.error ?? invitations.error;

	if (error) {
		throw new Error(`Could not read the roles: ${error.message}`);
	}

	const memberCounts = countByRole(members.data ?? []);
	const invitationCounts = countByRole(invitations.data ?? []);

	return (roles.data ?? []).map((row) => ({
		id: row.id,
		name: row.name,
		position: row.position,
		scope: row.scope,
		isPublic: row.is_public,
		permissions: row.permissions,
		memberCount: memberCounts.get(row.id) ?? 0,
		invitationCount: invitationCounts.get(row.id) ?? 0
	}));
}

/** What a write answered: done, a name another role has, or not allowed. */
export type RoleWriteResult = 'saved' | 'name-taken' | 'refused';

/** Postgres's codes for the three ways a write here can be turned down. */
const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';
const INSUFFICIENT_PRIVILEGE = '42501';

/** The form's values under the table's column names. */
function toColumns(values: RoleFormValues) {
	return {
		name: values.name,
		scope: values.scope,
		is_public: values.isPublic,
		permissions: values.permissions
	};
}

/**
 * Adds a role at the bottom of the conference's order, the one place below
 * everybody who may manage roles. Answers the new role's id, or why not.
 */
export async function createRole(
	supabase: SupabaseClient,
	conferenceId: string,
	values: RoleFormValues,
	position: number
): Promise<{ result: RoleWriteResult; roleId: string | null }> {
	const { data, error } = await supabase
		.from('conference_roles')
		.insert({ conference_id: conferenceId, position, ...toColumns(values) })
		.select('id');

	if (error?.code === UNIQUE_VIOLATION) {
		return { result: 'name-taken', roleId: null };
	}

	if (error?.code === INSUFFICIENT_PRIVILEGE) {
		return { result: 'refused', roleId: null };
	}

	if (error) {
		throw new Error(`Could not create the role: ${error.message}`);
	}

	const created = (data ?? [])[0];

	return created ? { result: 'saved', roleId: created.id } : { result: 'refused', roleId: null };
}

/**
 * Saves a role's name, scope, visibility and permissions. An update the
 * policies skip changes no row and raises nothing, so the row asked back
 * is what tells a saved role from a refused one.
 */
export async function updateRole(
	supabase: SupabaseClient,
	roleId: string,
	values: RoleFormValues
): Promise<RoleWriteResult> {
	const { data, error } = await supabase
		.from('conference_roles')
		.update(toColumns(values))
		.eq('id', roleId)
		.select('id');

	if (error?.code === UNIQUE_VIOLATION) {
		return 'name-taken';
	}

	if (error?.code === INSUFFICIENT_PRIVILEGE) {
		return 'refused';
	}

	if (error) {
		throw new Error(`Could not save the role: ${error.message}`);
	}

	return (data ?? []).length > 0 ? 'saved' : 'refused';
}

/** What deleting a role answered. */
export type RoleDeleteResult = 'deleted' | 'in-use' | 'refused';

/**
 * Deletes a role. The database refuses while anybody holds it (the foreign
 * key from `conference_role_members`), so that answers `'in-use'`. Pending
 * invitations would be deleted with the role, which is why the editor asks
 * for them to be withdrawn first; the page checks that before calling this.
 */
export async function deleteRole(
	supabase: SupabaseClient,
	roleId: string
): Promise<RoleDeleteResult> {
	const { data, error } = await supabase
		.from('conference_roles')
		.delete()
		.eq('id', roleId)
		.select('id');

	if (error?.code === FOREIGN_KEY_VIOLATION) {
		return 'in-use';
	}

	if (error) {
		throw new Error(`Could not delete the role: ${error.message}`);
	}

	return (data ?? []).length > 0 ? 'deleted' : 'refused';
}

/**
 * Swaps a role with its neighbour above or below (`move_conference_role`).
 * Answers `false` when the rank rule refused, and nothing moved.
 */
export async function moveRole(
	supabase: SupabaseClient,
	roleId: string,
	direction: 'up' | 'down'
): Promise<boolean> {
	const { error } = await supabase.rpc('move_conference_role', { role_id: roleId, direction });

	if (error?.code === INSUFFICIENT_PRIVILEGE) {
		return false;
	}

	if (error) {
		throw new Error(`Could not move the role: ${error.message}`);
	}

	return true;
}

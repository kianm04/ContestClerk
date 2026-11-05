import { error, fail, redirect } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { canChangeRole, type MyPermissions } from '$lib/permissions';
import {
	deleteRoleRefusal,
	readRoleForm,
	type RoleFormErrors,
	type RoleFormValues,
	type RoleSummary
} from '$lib/roles';
import { manageRolesUrl, manageRoleUrl } from '$lib/urls';
import { requireManagePage, requirePermissionAndRank } from '$lib/server/access';
import { setFlash } from '$lib/server/flash';
import { deleteRole, listRoleSummaries, updateRole } from '$lib/server/roles';
import type { Actions, PageServerLoad } from './$types';

/** What `save` answers when it refuses, so the form keeps what was typed. */
type RoleFormResult = {
	values: RoleFormValues;
	errors: RoleFormErrors;
	message: string | null;
};

/**
 * Every role of the conference, and the one in the address. A role the reader
 * may not change answers the 404 a role that does not exist answers: it is
 * above their own, or holds a permission they do not, and the roles page does
 * not link to it.
 */
async function readChangeableRole(
	supabase: SupabaseClient,
	conferenceId: string,
	roleId: string,
	mine: MyPermissions
): Promise<{ role: RoleSummary; roles: RoleSummary[] }> {
	const roles = await listRoleSummaries(supabase, conferenceId);
	const role = roles.find((candidate) => candidate.id === roleId);

	if (!role || !canChangeRole(mine, role)) {
		error(404, 'This role does not exist.');
	}

	return { role, roles };
}

/**
 * One role's editor. `?delete=1` opens the "Delete role" confirmation over
 * it, which only opens while nobody holds the role.
 */
export const load: PageServerLoad = async ({ parent, params, url, locals }) => {
	const { conference, permissions } = await parent();
	requireManagePage(permissions, 'roles');

	const { role } = await readChangeableRole(
		locals.supabase,
		conference.id,
		params.roleId,
		permissions
	);
	const refusal = deleteRoleRefusal(role.memberCount, role.invitationCount);

	return {
		role,
		values: {
			name: role.name,
			scope: role.scope,
			isPublic: role.isPublic,
			permissions: role.permissions
		} satisfies RoleFormValues,
		deleteRefusal: refusal,
		isDeleteOpen: url.searchParams.has('delete') && refusal === null,
		mine: permissions
	};
};

export const actions: Actions = {
	/** "Save changes": the role's name, scope, visibility and permissions. */
	save: async ({ params, url, request, cookies, locals }) => {
		// A form action is its own request, so the permission is asked for again.
		const { conference, permissions } = await requirePermissionAndRank(
			locals,
			url,
			params.slug,
			'manage_roles'
		);
		const { role, roles } = await readChangeableRole(
			locals.supabase,
			conference.id,
			params.roleId,
			permissions
		);

		const otherNames = roles.filter((other) => other.id !== role.id).map((other) => other.name);
		const reading = readRoleForm(await request.formData(), permissions, otherNames);

		if (reading.errors.name) {
			return fail(400, { ...reading, message: null } satisfies RoleFormResult);
		}

		const result = await updateRole(locals.supabase, role.id, reading.values);

		if (result === 'name-taken') {
			const errors = { name: `There is already a role called ${reading.values.name}.` };
			return fail(400, { values: reading.values, errors, message: null } satisfies RoleFormResult);
		}

		if (result === 'refused') {
			return fail(403, {
				...reading,
				message: 'You can only give a role the permissions you hold yourself.'
			} satisfies RoleFormResult);
		}

		setFlash(cookies, { tone: 'success', message: 'Changes saved.' });
		redirect(303, manageRoleUrl(params.slug, role.id));
	},

	/** "Delete role" in the confirmation: only while nobody holds it. */
	delete: async ({ params, url, cookies, locals }) => {
		const { conference, permissions } = await requirePermissionAndRank(
			locals,
			url,
			params.slug,
			'manage_roles'
		);
		const { role } = await readChangeableRole(
			locals.supabase,
			conference.id,
			params.roleId,
			permissions
		);

		// Pending invitations would go with the role, so they are withdrawn first.
		const refusal = deleteRoleRefusal(role.memberCount, role.invitationCount);

		if (refusal !== null) {
			return fail(400, { values: null, errors: {}, message: refusal });
		}

		const result = await deleteRole(locals.supabase, role.id);

		if (result === 'in-use') {
			// Somebody was given the role since the page was drawn.
			return fail(400, {
				values: null,
				errors: {},
				message: 'Somebody holds this role now. Take it off them on the team page first.'
			});
		}

		if (result === 'refused') {
			return fail(403, {
				values: null,
				errors: {},
				message: 'You can only delete roles below your own.'
			});
		}

		setFlash(cookies, { tone: 'success', message: `${role.name} deleted.` });
		redirect(303, manageRolesUrl(params.slug));
	}
};

import { fail, redirect } from '@sveltejs/kit';
import { readRoleForm, startFromRole, type RoleFormErrors, type RoleFormValues } from '$lib/roles';
import { manageRolesUrl } from '$lib/urls';
import { requireManagePage, requirePermissionAndRank } from '$lib/server/access';
import { setFlash } from '$lib/server/flash';
import { createRole, listRoleSummaries } from '$lib/server/roles';
import type { Actions, PageServerLoad } from './$types';

/** What `create` answers when it refuses, so the form keeps what was typed. */
type RoleFormResult = {
	values: RoleFormValues;
	errors: RoleFormErrors;
	message: string | null;
};

/**
 * The form for a new role. `?from=<role id>` is the "Start from" choice: the
 * form begins with that role's scope and the permissions the reader may give.
 */
export const load: PageServerLoad = async ({ parent, url, locals }) => {
	const { conference, permissions } = await parent();
	requireManagePage(permissions, 'roles');

	const roles = await listRoleSummaries(locals.supabase, conference.id);
	const fromRole = roles.find((role) => role.id === url.searchParams.get('from'));

	return {
		values: startFromRole(permissions, fromRole),
		startFromRoles: roles.map((role) => ({ value: role.id, label: role.name })),
		fromRoleId: fromRole?.id ?? null,
		mine: permissions
	};
};

export const actions: Actions = {
	/** "Create role": add it at the bottom of the order and go back to the list. */
	create: async ({ params, url, request, cookies, locals }) => {
		// A form action is its own request, so the permission is asked for again.
		const { conference, permissions } = await requirePermissionAndRank(
			locals,
			url,
			params.slug,
			'manage_roles'
		);

		const roles = await listRoleSummaries(locals.supabase, conference.id);
		const reading = readRoleForm(
			await request.formData(),
			permissions,
			roles.map((role) => role.name)
		);

		if (reading.errors.name) {
			return fail(400, { ...reading, message: null } satisfies RoleFormResult);
		}

		// The bottom of the order is below everybody who may manage roles, so
		// the rank rule always lets a new role in there.
		const lowestPosition = Math.max(-1, ...roles.map((role) => role.position));
		const { result } = await createRole(
			locals.supabase,
			conference.id,
			reading.values,
			lowestPosition + 1
		);

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

		setFlash(cookies, { tone: 'success', message: `${reading.values.name} created.` });
		redirect(303, manageRolesUrl(params.slug));
	}
};

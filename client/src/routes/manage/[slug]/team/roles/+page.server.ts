import { fail, redirect } from '@sveltejs/kit';
import { roleTableRows } from '$lib/roles';
import { manageRolesUrl } from '$lib/urls';
import { requireManagePage, requirePermissionAndRank } from '$lib/server/access';
import { listRoleSummaries, moveRole } from '$lib/server/roles';
import type { Actions, PageServerLoad } from './$types';

/**
 * The conference's roles in their order, and what the reader may do to each
 * (`docs/roles-and-permissions.md`, section 6).
 *
 * `parent()` is a promise for what the layouts above returned: the conference
 * and the reader's permissions on it. The first line answers a 404 unless
 * those include `manage_roles`.
 */
export const load: PageServerLoad = async ({ parent, locals }) => {
	const { conference, permissions } = await parent();
	requireManagePage(permissions, 'roles');

	const roles = await listRoleSummaries(locals.supabase, conference.id);

	return { roles: roleTableRows(permissions, roles) };
};

export const actions: Actions = {
	/**
	 * Swap one role with its neighbour above or below. Each row's two arrows
	 * post to `?/move&direction=up` and `?/move&direction=down`, the way the
	 * committees list reorders, so it works without JavaScript.
	 */
	move: async ({ params, url, request, locals }) => {
		// A form action is its own request and is handed nothing `load` worked
		// out, so the permission is asked for again here.
		await requirePermissionAndRank(locals, url, params.slug, 'manage_roles');

		const direction = url.searchParams.get('direction');

		if (direction !== 'up' && direction !== 'down') {
			return fail(400, { message: 'A role can only move up or down.' });
		}

		const formData = await request.formData();
		const roleId = String(formData.get('roleId') ?? '');

		if (roleId === '') {
			return fail(400, { message: 'That request did not say which role to move.' });
		}

		// The database swaps the two roles only when the reader may change both.
		const isMoved = await moveRole(locals.supabase, roleId, direction);

		if (!isMoved) {
			return fail(403, { message: 'You can only move roles below your own.' });
		}

		// No flash: the role has visibly changed places.
		redirect(303, manageRolesUrl(params.slug));
	}
};

/**
 * What the signed-in reader may do on one conference, read from the database
 * once per request (`docs/roles-and-permissions.md`, section 8).
 *
 * `/manage/[slug]/+layout.server.ts` calls this and hands the answer to every
 * page underneath as `data.permissions`, which the sidebar, the dashboard and
 * each page's buttons read with the pure rules of `$lib/permissions.ts`. Form
 * actions do not trust it: each asks the database again through
 * `requirePermission` in `$lib/server/access.ts`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { permissionsOpeningManagePages } from '$lib/manage-pages';
import type { HeldPermission, MyPermissions, Permission } from '$lib/permissions';

/**
 * Every permission the reader holds on the conference, the rank of their
 * highest role, and the committees they are assigned to.
 *
 * The three questions do not depend on one another, so all three are sent at
 * once. `my_permissions` and `my_rank` are database functions that read the
 * reader from the access token, so neither is handed a user id.
 */
export async function readMyPermissions(
	supabase: SupabaseClient,
	conferenceId: string,
	userId: string
): Promise<MyPermissions> {
	const [heldAnswer, rankAnswer, assignmentsAnswer] = await Promise.all([
		supabase.rpc('my_permissions', { conference_id: conferenceId }),
		supabase.rpc('my_rank', { conference_id: conferenceId }),
		// `committees!inner(...)` joins each assignment to its committee and keeps
		// only the rows whose committee matches the filter on it, which is how an
		// assignment is narrowed to this conference without a second query.
		supabase
			.from('committee_chairs')
			.select('committee_id, committees!inner(conference_id)')
			.eq('user_id', userId)
			.eq('committees.conference_id', conferenceId)
	]);

	if (heldAnswer.error) {
		throw new Error(`Could not read your permissions: ${heldAnswer.error.message}`);
	}

	if (rankAnswer.error) {
		throw new Error(`Could not read your rank: ${rankAnswer.error.message}`);
	}

	if (assignmentsAnswer.error) {
		throw new Error(`Could not read your committees: ${assignmentsAnswer.error.message}`);
	}

	const held: HeldPermission[] = (heldAnswer.data ?? []).map((row: HeldPermission) => ({
		permission: row.permission,
		scope: row.scope
	}));
	const assignments: { committee_id: string }[] = assignmentsAnswer.data ?? [];

	return {
		held,
		committeeIds: assignments.map((assignment) => assignment.committee_id),
		rank: typeof rankAnswer.data === 'number' ? rankAnswer.data : null
	};
}

/**
 * The conferences whose management area the reader may open: those where they
 * hold, conference-wide, a permission that opens one of its pages. An owner or
 * admin of the organisation counts for every conference of it, because the
 * database's `permitted_conference_ids` counts them in.
 *
 * One question per permission, all sent at once. A permission held only on a
 * role that applies per committee is not counted, because the function only
 * answers conference-wide holdings.
 */
export async function readManageableConferenceIds(supabase: SupabaseClient): Promise<Set<string>> {
	return readConferenceIdsPermitting(supabase, permissionsOpeningManagePages());
}

/**
 * The conferences where the reader holds, conference-wide, any one of these
 * permissions. `/manage` asks it about the invoice permissions, to leave the
 * fees paid out of the rows of a conference whose invoices the reader may not
 * read.
 */
export async function readConferenceIdsPermitting(
	supabase: SupabaseClient,
	permissions: Permission[]
): Promise<Set<string>> {
	const answers = await Promise.all(
		permissions.map((permission) => supabase.rpc('permitted_conference_ids', { permission }))
	);
	const conferenceIds = new Set<string>();

	for (const answer of answers) {
		if (answer.error) {
			throw new Error(`Could not read the conferences you manage: ${answer.error.message}`);
		}

		const ids: string[] = answer.data ?? [];

		for (const id of ids) {
			conferenceIds.add(id);
		}
	}

	return conferenceIds;
}

/**
 * What the reader may do on the committees pages under `/manage/[slug]`
 * (`docs/roles-and-permissions.md`, sections 4 and 8, step 8).
 *
 * `manage_committees` held conference-wide adds, deletes and reorders
 * committees and changes every field and seat. Held on a role that applies
 * per committee it changes that committee's description, agenda and
 * background guide and nothing else, which the database's
 * `protect_committees_columns` enforces too. The Chairs panel belongs to
 * `manage_team`, and "Chair room" to `run_room` in the committee.
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

import type { CommitteeFormValues } from '$lib/committee-details';
import { hasCommitteePermission, hasPermission, type MyPermissions } from '$lib/permissions';

/** What one committee's editor offers the reader. */
export type CommitteeEditorAccess = {
	/** Every field, the seats, and deleting the committee. */
	isWholeEditor: boolean;
	/** The Chairs panel. */
	mayManageChairs: boolean;
	/** "Open chair room". */
	mayOpenRoom: boolean;
};

/** What the reader may do in this committee's editor, which they may open. */
export function committeeEditorAccess(
	mine: MyPermissions,
	committeeId: string
): CommitteeEditorAccess {
	return {
		isWholeEditor: hasPermission(mine, 'manage_committees'),
		mayManageChairs: hasPermission(mine, 'manage_team'),
		mayOpenRoom: hasCommitteePermission(mine, committeeId, 'run_room')
	};
}

/**
 * What an action of a committee's editor needs: `agenda` the description,
 * the topics and the background guide, `whole` everything else about the
 * committee and its seats, `chairs` the Chairs panel.
 */
export type CommitteeEditorNeed = 'agenda' | 'whole' | 'chairs';

/**
 * Whether the reader may do what `need` names in this committee's editor. Each
 * asks first that they edit this committee at all.
 */
export function mayUseCommitteeEditor(
	mine: MyPermissions,
	committeeId: string,
	need: CommitteeEditorNeed
): boolean {
	if (!hasCommitteePermission(mine, committeeId, 'manage_committees')) {
		return false;
	}

	const access = committeeEditorAccess(mine, committeeId);

	if (need === 'whole') {
		return access.isWholeEditor;
	}

	if (need === 'chairs') {
		return access.mayManageChairs;
	}

	return true;
}

/** The committees the reader edits, in the order given: all of them conference-wide. */
export function editableCommittees<Committee extends { id: string }>(
	mine: MyPermissions,
	committees: Committee[]
): Committee[] {
	return committees.filter((committee) =>
		hasCommitteePermission(mine, committee.id, 'manage_committees')
	);
}

/**
 * The form as somebody who edits only this committee saves it: the saved
 * committee, with the description and the agenda they sent. Their form has no
 * other fields, and anything else posted is ignored rather than trusted.
 */
export function withAgendaOnly(
	saved: CommitteeFormValues,
	posted: CommitteeFormValues
): CommitteeFormValues {
	return { ...saved, description: posted.description, topics: posted.topics };
}

/**
 * What each of the announcements page's actions is expected to change on the
 * page's list of published announcements, worked out in the browser at the
 * moment of the press (T142). Mirrors `$lib/server/announcements.ts`, so the
 * screen shows what the database will hold.
 *
 * The page keeps one instant form (`createInstantForm` in
 * `$lib/instant-form.svelte.ts`) for publishing, editing, pinning and
 * deleting. Each press keeps the rows it changes as `RowChange`s, and the
 * page draws the rows `load` fetched with those laid on top
 * (`rowsAfterPresses` in `$lib/row-changes.ts`). `expectAnnouncementRowChange`
 * is the one function the page calls; it only reads the id the page already
 * put in the form (`NEW_ROW_ID_FIELD`), because a pure function cannot call
 * `crypto.randomUUID()` and stay testable, so the page chooses that id itself.
 *
 * Two things a press cannot know are left out of the row it predicts, and are
 * filled in once the real one arrives on the next reload:
 *
 * - The committee's short name (`committeeAbbreviation`): the page only has
 *   the full committee list to pick from, not its abbreviations, so a
 *   committee announcement's badge shows the plain word "Committee" for a
 *   moment rather than "UNSC".
 * - The author's name: the page never asked for it, so the row briefly says
 *   "Unknown author" instead of the organiser's own name.
 */
import {
	hasAnnouncementErrors,
	readAnnouncementForm,
	toAnnouncementInput,
	validateAnnouncementForm,
	type AnnouncementFormValues,
	type AudienceInput
} from '$lib/announcement-form';
import type { Announcement, AnnouncementGroup } from '$lib/announcements';
import { NEW_ROW_ID_FIELD, readNewRowId } from '$lib/new-row-id';
import {
	pressedAction,
	pressedField,
	type PressedForm,
	type RowChange,
	type RowPress
} from '$lib/row-changes';

/** A press of the announcements page's instant form. */
export type AnnouncementPress = RowPress<Announcement>;

/** The delegation `audience` names, looked up by its id, or `null` when it names none. */
function delegationName(audience: AudienceInput, delegations: AnnouncementGroup[]): string | null {
	if (audience.delegationId === null) return null;

	return delegations.find((delegation) => delegation.id === audience.delegationId)?.name ?? null;
}

/**
 * "Publish announcement": the new row, under `newAnnouncementId` (the id the
 * browser chose, which the server saves the row under). Null when the form
 * would be refused, so the screen leaves it to the server's answer.
 */
export function publishAnnouncementPress(
	values: AnnouncementFormValues,
	newAnnouncementId: string,
	delegations: AnnouncementGroup[],
	pressed: Date
): RowChange<Announcement>[] | null {
	if (hasAnnouncementErrors(validateAnnouncementForm(values, false))) return null;

	const audience = toAnnouncementInput(values);

	const added: Announcement = {
		id: newAnnouncementId,
		title: values.title,
		body: values.body,
		audience: audience.audience,
		committeeId: audience.committeeId,
		// Not known in the browser; see the file comment.
		committeeAbbreviation: null,
		delegationId: audience.delegationId,
		delegationName: delegationName(audience, delegations),
		isPinned: values.isPinned,
		publishedAt: pressed.toISOString(),
		// Not known in the browser; see the file comment.
		authorId: '',
		authorName: null
	};

	return [{ id: newAnnouncementId, added }];
}

/**
 * "Save changes": the title, body and pin state an edit sets on the row,
 * keeping everything else. Null when the form would be refused.
 */
export function updateAnnouncementPress(
	announcementId: string,
	values: AnnouncementFormValues
): RowChange<Announcement>[] | null {
	if (hasAnnouncementErrors(validateAnnouncementForm(values, true))) return null;

	return [
		{
			id: announcementId,
			changes: { title: values.title, body: values.body, isPinned: values.isPinned }
		}
	];
}

/** "Pin" or "Unpin": the row's `isPinned` flipped from what the page already shows. */
export function togglePinAnnouncementPress(
	announcementId: string,
	wasPinned: boolean
): RowChange<Announcement>[] {
	return [{ id: announcementId, changes: { isPinned: !wasPinned } }];
}

/** "Delete": the announcement is taken off the list. */
export function deleteAnnouncementPress(announcementId: string): RowChange<Announcement>[] {
	return [{ id: announcementId, isDeleted: true }];
}

/**
 * The announcements in the order `load` lists them: pinned first, then newest
 * first (`listAnnouncementsForOrganiser` in `$lib/server/announcements.ts`).
 * A press can pin a row or add a new one, so the page puts its rows back in
 * this order after laying the presses on top, and a pinned row moves to the
 * top at once instead of on the next reload.
 */
export function announcementsInListOrder(rows: Announcement[]): Announcement[] {
	return [...rows].sort((first, second) => {
		if (first.isPinned !== second.isPinned) return first.isPinned ? -1 : 1;

		return Date.parse(second.publishedAt) - Date.parse(first.publishedAt);
	});
}

/**
 * What a press will change, given the action it posted to and the rows on
 * screen at the moment of the press. The page calls this once for every
 * button on the page, having already put a fresh id in `NEW_ROW_ID_FIELD` for
 * a press that might publish (see the file comment).
 */
export function expectAnnouncementRowChange(
	input: PressedForm,
	rows: Announcement[],
	delegations: AnnouncementGroup[],
	pressed: Date
): RowChange<Announcement>[] | null {
	const action = pressedAction(input.action);

	if (action === '?/publish') {
		const newAnnouncementId = readNewRowId(input.formData.get(NEW_ROW_ID_FIELD));
		if (newAnnouncementId === null) return null;

		return publishAnnouncementPress(
			readAnnouncementForm(input.formData),
			newAnnouncementId,
			delegations,
			pressed
		);
	}

	if (action === '?/update') {
		const values = readAnnouncementForm(input.formData);
		return updateAnnouncementPress(values.announcementId, values);
	}

	if (action === '?/togglePin') {
		const announcementId = input.action.searchParams.get('announcementId') ?? '';
		const existing = rows.find((row) => row.id === announcementId);

		return existing ? togglePinAnnouncementPress(announcementId, existing.isPinned) : null;
	}

	if (action === '?/delete') {
		return deleteAnnouncementPress(pressedField(input.formData, 'announcementId'));
	}

	return null;
}

/** What did not happen when a press failed, for its toast. */
export function describeAnnouncementFailure(press: AnnouncementPress): string {
	const action = pressedAction(press.action);

	if (action === '?/publish') return 'The announcement was not published.';
	if (action === '?/update') return 'The announcement was not saved.';
	if (action === '?/togglePin') return 'The announcement was not updated.';
	if (action === '?/delete') return 'The announcement was not deleted.';

	return 'The announcement was not saved.';
}

/**
 * What deleting a resource file or a committee's background guide changes,
 * worked out in the browser so the row disappears the moment "Delete" is
 * pressed instead of waiting for the server (T142). Both kinds of file share
 * one `deleteDocument` action in `+page.server.ts`, told apart only by the
 * file's own id, so each list here checks whether the pressed id is one of
 * its own rows before claiming the press.
 *
 * A resource's "Save" beside its audience goes through the same instant form
 * as its "Delete", so the badge shows the new audience at once too.
 */
import type { CommitteeGuide } from '$lib/documents';
import { isDocumentAudience, type ResourceFile } from '$lib/documents';
import { pressedAction, pressedField, type PressedForm, type RowChange } from '$lib/row-changes';

/**
 * A committee guide row with an `id`, which `RowChange` needs to find a row
 * and `CommitteeGuide` does not have: it is named by `committeeId` instead.
 */
export type GuideRow = CommitteeGuide & { id: string };

/** Give a loaded committee its `id` for the guide list's instant form, taken from `committeeId`. */
export function withCommitteeId(committee: CommitteeGuide): GuideRow {
	return { ...committee, id: committee.committeeId };
}

/**
 * What a press will change if it deletes one of `guides`' own guides: that
 * committee is left with no guide. Null for any other press, including a
 * deletion of a resource file, which this list does not show.
 */
export function expectGuideDeleted(
	input: PressedForm,
	guides: GuideRow[]
): RowChange<GuideRow>[] | null {
	if (pressedAction(input.action) !== '?/deleteDocument') return null;

	const documentId = pressedField(input.formData, 'documentId');
	const committee = guides.find((guide) => guide.guide?.id === documentId);

	return committee ? [{ id: committee.id, changes: { guide: null } }] : null;
}

/**
 * What a press will change if it deletes one of `resources`: that row is
 * taken off the list. Null for any other press, including a guide deletion.
 */
export function expectResourceDeleted(
	input: PressedForm,
	resources: ResourceFile[]
): RowChange<ResourceFile>[] | null {
	if (pressedAction(input.action) !== '?/deleteDocument') return null;

	const documentId = pressedField(input.formData, 'documentId');
	const resource = resources.find((one) => one.id === documentId);

	return resource ? [{ id: resource.id, isDeleted: true }] : null;
}

/**
 * What a press will change if it saves a new audience for one of `resources`:
 * that row's `audience`. Null for any other press, and for an audience the
 * server refuses, which then changes nothing on screen first.
 */
export function expectResourceAudienceChange(
	input: PressedForm,
	resources: ResourceFile[]
): RowChange<ResourceFile>[] | null {
	if (pressedAction(input.action) !== '?/updateResourceAudience') return null;

	const documentId = pressedField(input.formData, 'documentId');
	const audience = pressedField(input.formData, 'audience');
	const resource = resources.find((one) => one.id === documentId);

	if (!resource || !isDocumentAudience(audience)) return null;

	return [{ id: resource.id, changes: { audience } }];
}

/** What did not happen when a press on a resource row failed, for its toast. */
export function describeResourceFailure(press: PressedForm): string {
	if (pressedAction(press.action) === '?/updateResourceAudience') {
		return 'The audience was not changed.';
	}

	return describeDocumentDeleteFailure();
}

/** What did not happen when a document deletion press failed, for its toast. */
export function describeDocumentDeleteFailure(): string {
	return 'The file was not deleted.';
}

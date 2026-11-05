/**
 * What "Confirm", "Unconfirm" and "Delete" on the organiser's awards page
 * change, worked out in the browser so a row changes the moment its button is
 * pressed rather than once the server has answered (T142). Mirrors
 * `changeStatus` and `delete` in `routes/manage/[slug]/awards/+page.server.ts`.
 *
 * The page keeps one instant form (`createInstantForm` in
 * `$lib/instant-form.svelte.ts`) for every row and draws its committees with
 * `awardSectionsAfterPresses(data.sections, form.presses)`. The chair's own
 * awards page has its presses in `$lib/award-presses.ts`.
 *
 * "Add award", "Edit title" and "Publish" are not part of this file: the
 * server checks their fields and the publishing rules, so they keep their
 * in-place spinner.
 */
import type { Award, CommitteeAwards } from '$lib/awards';
import {
	pressedAction,
	pressedField,
	rowsAfterPresses,
	type PressedForm,
	type RowChange,
	type RowPress
} from '$lib/row-changes';

/** One press of a row's "Confirm", "Unconfirm" or "Delete", and the award it changes. */
export type OrganiserAwardPress = RowPress<Award>;

/**
 * What a press will change: the award named by its hidden `awardId` becomes
 * confirmed, goes back to proposed, or is taken off the list. Null for a
 * press that names no award or posts somewhere else.
 */
export function expectOrganiserAwardChange(input: PressedForm): RowChange<Award>[] | null {
	const awardId = pressedField(input.formData, 'awardId');
	const action = pressedAction(input.action);

	if (awardId === '') return null;
	if (action === '?/confirm') return [{ id: awardId, changes: { status: 'confirmed' } }];
	if (action === '?/unconfirm') return [{ id: awardId, changes: { status: 'proposed' } }];
	if (action === '?/delete') return [{ id: awardId, isDeleted: true }];

	return null;
}

/** Every committee with the awards of the presses still on their way laid on top. */
export function awardSectionsAfterPresses(
	sections: CommitteeAwards[],
	presses: OrganiserAwardPress[]
): CommitteeAwards[] {
	return sections.map((section) => ({
		...section,
		awards: rowsAfterPresses(section.awards, presses)
	}));
}

/** What did not happen when a press failed, for its toast. */
export function describeOrganiserAwardFailure(press: OrganiserAwardPress): string {
	const action = pressedAction(press.action);

	if (action === '?/confirm') return 'The award was not confirmed.';
	if (action === '?/unconfirm') return 'The award was not moved back to proposed.';
	if (action === '?/delete') return 'The award was not deleted.';

	return 'The award was not changed.';
}

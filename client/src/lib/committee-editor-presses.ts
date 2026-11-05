/**
 * What "Remove" beside a chair, "Withdraw" beside a chair invitation (T175)
 * and "Remove guide" on the committee editor
 * (`/manage/[slug]/committees/[committeeId]`) change, worked out in the
 * browser so the chair or the guide goes the moment the button is pressed
 * rather than once the server has answered (T142). Mirrors `removeChair`,
 * `withdrawChairInvite` and `removeGuide` in that route's `+page.server.ts`.
 *
 * `ChairsPanel` and `BackgroundGuidePanel` each keep one instant form
 * (`createInstantForm` in `$lib/instant-form.svelte.ts`) and draw their data
 * through the functions below.
 */
import type { CommitteeChair } from '$lib/committees';
import type { BackgroundGuide } from '$lib/documents';
import type { InstantPress } from '$lib/instant-form.svelte';
import { pressedAction, pressedField, type PressedForm } from '$lib/row-changes';
import type { PendingChairInvite } from '$lib/team';

/**
 * The user id of the chair a press removes, or null for a press that names
 * nobody on `chairs` or posts somewhere else.
 */
export function expectChairRemoved(input: PressedForm, chairs: CommitteeChair[]): string | null {
	if (pressedAction(input.action) !== '?/removeChair') return null;

	const userId = pressedField(input.formData, 'userId');
	const isChair = chairs.some((chair) => chair.userId === userId);

	return isChair ? userId : null;
}

/** The chairs without the ones a press still on its way removes. */
export function chairsAfterPresses(
	chairs: CommitteeChair[],
	presses: InstantPress<string>[]
): CommitteeChair[] {
	const removedIds = presses.map((press) => press.expected);

	return chairs.filter((chair) => !removedIds.includes(chair.userId));
}

/** What did not happen when a chair's "Remove" failed, for its toast. */
export function describeChairRemovalFailure(): string {
	return 'The chair was not removed.';
}

/**
 * The id of the invitation a "Withdraw" press takes away, or null for a press
 * that names none of `invites` or posts somewhere else.
 */
export function expectChairInviteWithdrawn(
	input: PressedForm,
	invites: PendingChairInvite[]
): string | null {
	if (pressedAction(input.action) !== '?/withdrawChairInvite') return null;

	const inviteId = pressedField(input.formData, 'inviteId');
	const isWaiting = invites.some((invite) => invite.id === inviteId);

	return isWaiting ? inviteId : null;
}

/** The waiting invitations without the ones a press still on its way withdraws. */
export function chairInvitesAfterPresses(
	invites: PendingChairInvite[],
	presses: InstantPress<string>[]
): PendingChairInvite[] {
	const withdrawnIds = presses.map((press) => press.expected);

	return invites.filter((invite) => !withdrawnIds.includes(invite.id));
}

/** What did not happen when "Withdraw" failed, for its toast. */
export function describeChairInviteWithdrawalFailure(): string {
	return 'The invitation was not withdrawn.';
}

/**
 * The guide as it will be once the presses still on their way are saved: none
 * at all once "Remove guide" has been pressed. The panel's upload does not go
 * through this form, so every press here is a removal.
 */
export function guideAfterPresses(
	guide: BackgroundGuide | null,
	presses: InstantPress[]
): BackgroundGuide | null {
	const isRemoving = presses.some((press) => pressedAction(press.action) === '?/removeGuide');

	return isRemoving ? null : guide;
}

/** What did not happen when "Remove guide" failed, for its toast. */
export function describeGuideRemovalFailure(): string {
	return 'The background guide was not removed.';
}

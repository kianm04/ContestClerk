/**
 * What "Revoke" does to the team's pending invitations list, worked out in the
 * browser at the moment of the press (T142), so the row disappears at once
 * instead of waiting for the server. Mirrors `revokeInvite` in
 * `+page.server.ts`. "Send again" is not part of this file: it changes
 * nothing the reader can see, so it keeps its own in-place spinner.
 */
import { pressedField, type PressedForm, type RowChange } from '$lib/row-changes';
import type { PendingStaffInvite } from '$lib/team';

/**
 * What a press will change: the invitation it names is taken off the list.
 * Null when the press names no invitation.
 */
export function expectPendingInviteRowChange(
	input: PressedForm
): RowChange<PendingStaffInvite>[] | null {
	const inviteId = pressedField(input.formData, 'inviteId');

	if (inviteId === '') return null;

	return [{ id: inviteId, isDeleted: true }];
}

/** What did not happen when a press failed, for its toast. */
export function describePendingInviteFailure(): string {
	return 'The invitation was not revoked.';
}

/**
 * What "Save role", "Remove" and an invitation's "Revoke" on the organisation
 * settings page change, worked out in the browser so the members list changes
 * the moment a button is pressed rather than once the server has answered
 * (T142). Mirrors `changeRole`, `removeMember` and `revokeInvite` in
 * `routes/manage/organizations/[orgSlug]/+page.server.ts`.
 *
 * `MembersTable` keeps one instant form (`createInstantForm` in
 * `$lib/instant-form.svelte.ts`) for every row and draws the members with
 * `membersAfterPresses` and the invitations with `invitesAfterPresses`.
 *
 * The reader's own row is not sent through it: changing your own role or
 * leaving changes what you may do on the page, or takes you off it, so those
 * two keep their in-place spinner and wait for the server.
 */
import type { InstantPress } from '$lib/instant-form.svelte';
import {
	ORGANIZATION_ROLES,
	type OrganizationMember,
	type OrganizationRole,
	type PendingOrganizationInvite
} from '$lib/organizations';
import { pressedAction, pressedField, type PressedForm } from '$lib/row-changes';

/** What one press changes: a member's role, a member gone, or an invitation gone. */
export type MembersChange =
	| { kind: 'role'; userId: string; role: OrganizationRole }
	| { kind: 'remove'; userId: string }
	| { kind: 'revokeInvite'; inviteId: string };

/** One press of the members list, and the change it is expected to make. */
export type MembersPress = InstantPress<MembersChange>;

/** Whether `value` is one of the three roles, as the form's picker sends it. */
function isOrganizationRole(value: string): value is OrganizationRole {
	return ORGANIZATION_ROLES.some((role) => role === value);
}

/**
 * What a press will change, read from its hidden fields. Null for a press
 * that names nobody, sends a role that does not exist, or posts somewhere else.
 */
export function expectMembersChange(input: PressedForm): MembersChange | null {
	const action = pressedAction(input.action);
	const userId = pressedField(input.formData, 'userId');
	const inviteId = pressedField(input.formData, 'inviteId');
	const role = pressedField(input.formData, 'role');

	if (action === '?/changeRole' && userId !== '' && isOrganizationRole(role)) {
		return { kind: 'role', userId, role };
	}
	if (action === '?/removeMember' && userId !== '') return { kind: 'remove', userId };
	if (action === '?/revokeInvite' && inviteId !== '') return { kind: 'revokeInvite', inviteId };

	return null;
}

/** The members with the presses still on their way laid on top, oldest first. */
export function membersAfterPresses(
	members: OrganizationMember[],
	presses: MembersPress[]
): OrganizationMember[] {
	let shown = members;

	for (const press of presses) {
		const change = press.expected;

		if (change?.kind === 'remove') {
			shown = shown.filter((member) => member.userId !== change.userId);
		}
		if (change?.kind === 'role') {
			shown = shown.map((member) =>
				member.userId === change.userId ? { ...member, role: change.role } : member
			);
		}
	}

	return shown;
}

/** The pending invitations without the ones a press still on its way revokes. */
export function invitesAfterPresses(
	invites: PendingOrganizationInvite[],
	presses: MembersPress[]
): PendingOrganizationInvite[] {
	const revokedIds: string[] = [];

	for (const press of presses) {
		if (press.expected?.kind === 'revokeInvite') revokedIds.push(press.expected.inviteId);
	}

	return invites.filter((invite) => !revokedIds.includes(invite.id));
}

/** What did not happen when a press failed, for its toast. */
export function describeMembersFailure(press: MembersPress): string {
	const action = pressedAction(press.action);

	if (action === '?/changeRole') return 'The role was not changed.';
	if (action === '?/removeMember') return 'The member was not removed.';
	if (action === '?/revokeInvite') return 'The invitation was not revoked.';

	return 'The members were not changed.';
}

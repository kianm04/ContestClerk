import { describe, expect, it } from 'vitest';
import {
	describeMembersFailure,
	expectMembersChange,
	invitesAfterPresses,
	membersAfterPresses,
	type MembersPress
} from './organization-member-presses';
import type { OrganizationMember, PendingOrganizationInvite } from './organizations';

/** A press of `action` with `fields`, the way the members table's forms send it. */
function pressInput(action: string, fields: Record<string, string>) {
	const formData = new FormData();
	for (const [name, value] of Object.entries(fields)) formData.set(name, value);

	return {
		action: new URL(`http://localhost/manage/organizations/riverside${action}`),
		formData
	};
}

/** A press still on its way, with the change `expectMembersChange` gave it. */
function pressOf(action: string, fields: Record<string, string>): MembersPress {
	const input = pressInput(action, fields);

	return { id: 1, ...input, expected: expectMembersChange(input) };
}

/** A plain member called `userId`. */
function memberCalled(userId: string): OrganizationMember {
	return { userId, fullName: 'Sara Khan', avatarPath: null, role: 'member', isMe: false };
}

/** An admin invitation called `id`. */
function inviteCalled(id: string): PendingOrganizationInvite {
	return {
		id,
		token: `token-${id}`,
		email: `${id}@example.com`,
		role: 'admin',
		expiresAt: '2026-10-10T00:00:00Z'
	};
}

describe('expectMembersChange', () => {
	it('reads a role change, a removal and a revoked invitation', () => {
		expect(
			expectMembersChange(pressInput('?/changeRole', { userId: 'u1', role: 'admin' }))
		).toEqual({ kind: 'role', userId: 'u1', role: 'admin' });
		expect(expectMembersChange(pressInput('?/removeMember', { userId: 'u1' }))).toEqual({
			kind: 'remove',
			userId: 'u1'
		});
		expect(expectMembersChange(pressInput('?/revokeInvite', { inviteId: 'i1' }))).toEqual({
			kind: 'revokeInvite',
			inviteId: 'i1'
		});
	});

	it('answers null for a role that does not exist, nobody named, or another action', () => {
		expect(
			expectMembersChange(pressInput('?/changeRole', { userId: 'u1', role: 'emperor' }))
		).toBeNull();
		expect(expectMembersChange(pressInput('?/removeMember', {}))).toBeNull();
		expect(expectMembersChange(pressInput('?/invite', { userId: 'u1' }))).toBeNull();
	});
});

describe('membersAfterPresses', () => {
	const members = [memberCalled('u1'), memberCalled('u2')];

	it('changes a role and takes a removed member off, in order', () => {
		const shown = membersAfterPresses(members, [
			pressOf('?/changeRole', { userId: 'u1', role: 'admin' }),
			pressOf('?/removeMember', { userId: 'u2' })
		]);

		expect(shown).toEqual([{ ...memberCalled('u1'), role: 'admin' }]);
	});

	it('leaves the members alone for a revoked invitation', () => {
		expect(membersAfterPresses(members, [pressOf('?/revokeInvite', { inviteId: 'i1' })])).toEqual(
			members
		);
	});
});

describe('invitesAfterPresses', () => {
	it('takes a revoked invitation off the list', () => {
		const invites = [inviteCalled('i1'), inviteCalled('i2')];

		expect(invitesAfterPresses(invites, [pressOf('?/revokeInvite', { inviteId: 'i1' })])).toEqual([
			inviteCalled('i2')
		]);
	});
});

describe('describeMembersFailure', () => {
	it('names what did not happen', () => {
		expect(describeMembersFailure(pressOf('?/changeRole', { userId: 'u1', role: 'admin' }))).toBe(
			'The role was not changed.'
		);
		expect(describeMembersFailure(pressOf('?/removeMember', { userId: 'u1' }))).toBe(
			'The member was not removed.'
		);
		expect(describeMembersFailure(pressOf('?/revokeInvite', { inviteId: 'i1' }))).toBe(
			'The invitation was not revoked.'
		);
	});
});

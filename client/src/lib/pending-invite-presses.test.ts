import { describe, expect, it } from 'vitest';
import {
	describePendingInviteFailure,
	expectPendingInviteRowChange
} from './pending-invite-presses';

/** A press of `?/revokeInvite` naming `inviteId`, the way `PendingInviteRow` sends it. */
function pressInput(inviteId: string) {
	const formData = new FormData();
	if (inviteId !== '') formData.set('inviteId', inviteId);

	return {
		action: new URL('http://localhost/manage/riverside-mun-2027/team?/revokeInvite'),
		formData
	};
}

describe('expectPendingInviteRowChange', () => {
	it('takes the named invitation off the list', () => {
		expect(expectPendingInviteRowChange(pressInput('invite-1'))).toEqual([
			{ id: 'invite-1', isDeleted: true }
		]);
	});

	it('answers null when no invitation is named', () => {
		expect(expectPendingInviteRowChange(pressInput(''))).toBeNull();
	});
});

describe('describePendingInviteFailure', () => {
	it('names the invitation', () => {
		expect(describePendingInviteFailure()).toBe('The invitation was not revoked.');
	});
});

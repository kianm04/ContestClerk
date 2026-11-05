import { describe, expect, it } from 'vitest';
import {
	chairInvitesAfterPresses,
	chairsAfterPresses,
	describeChairInviteWithdrawalFailure,
	describeChairRemovalFailure,
	describeGuideRemovalFailure,
	expectChairInviteWithdrawn,
	expectChairRemoved,
	guideAfterPresses
} from './committee-editor-presses';
import type { CommitteeChair } from './committees';
import type { BackgroundGuide } from './documents';
import type { InstantPress } from './instant-form.svelte';
import type { PendingChairInvite } from './team';

const ANA: CommitteeChair = {
	userId: 'u-ana',
	fullName: 'Ana Silva',
	avatarPath: null,
	title: 'Chair'
};
const BEN: CommitteeChair = { ...ANA, userId: 'u-ben', fullName: 'Ben Okafor' };

/** A press of `action` with `fields`, the way the committee editor's forms send it. */
function pressInput(action: string, fields: Record<string, string>) {
	const formData = new FormData();
	for (const [name, value] of Object.entries(fields)) formData.set(name, value);

	return { action: new URL(`http://localhost/manage/mun/committees/c1${action}`), formData };
}

/** A chair "Remove" press still on its way, with what `expectChairRemoved` gave it. */
function chairPress(userId: string): InstantPress<string> {
	const input = pressInput('?/removeChair', { userId });

	return { id: 1, ...input, expected: expectChairRemoved(input, [ANA, BEN]) };
}

describe('expectChairRemoved', () => {
	it('names the chair the press removes', () => {
		expect(expectChairRemoved(pressInput('?/removeChair', { userId: 'u-ben' }), [ANA, BEN])).toBe(
			'u-ben'
		);
	});

	it('expects nothing for somebody who does not chair it, or another action', () => {
		expect(expectChairRemoved(pressInput('?/removeChair', { userId: 'u-x' }), [ANA])).toBeNull();
		expect(expectChairRemoved(pressInput('?/addChair', { userId: 'u-ana' }), [ANA])).toBeNull();
	});
});

describe('chairsAfterPresses', () => {
	it('leaves out the chairs a press removes, and nobody else', () => {
		expect(chairsAfterPresses([ANA, BEN], [chairPress('u-ana')])).toEqual([BEN]);
		expect(chairsAfterPresses([ANA, BEN], [chairPress('u-x')])).toEqual([ANA, BEN]);
	});
});

describe('the chair invitations', () => {
	const INVITE: PendingChairInvite = {
		id: 'i-1',
		token: 'a'.repeat(32),
		email: 'ana@example.org',
		expiresAt: '2026-10-12T10:00:00Z'
	};
	const OTHER: PendingChairInvite = { ...INVITE, id: 'i-2', email: 'ben@example.org' };

	/** A "Withdraw" press still on its way, with what `expectChairInviteWithdrawn` gave it. */
	function withdrawPress(inviteId: string): InstantPress<string> {
		const input = pressInput('?/withdrawChairInvite', { inviteId });

		return { id: 1, ...input, expected: expectChairInviteWithdrawn(input, [INVITE, OTHER]) };
	}

	it('names the invitation a press withdraws, and nothing for any other press', () => {
		const withdraw = pressInput('?/withdrawChairInvite', { inviteId: 'i-2' });
		const stranger = pressInput('?/withdrawChairInvite', { inviteId: 'i-x' });
		const remove = pressInput('?/removeChair', { inviteId: 'i-1' });

		expect(expectChairInviteWithdrawn(withdraw, [INVITE, OTHER])).toBe('i-2');
		expect(expectChairInviteWithdrawn(stranger, [INVITE, OTHER])).toBeNull();
		expect(expectChairInviteWithdrawn(remove, [INVITE, OTHER])).toBeNull();
	});

	it('leaves out only the invitations a press withdraws', () => {
		expect(chairInvitesAfterPresses([INVITE, OTHER], [withdrawPress('i-1')])).toEqual([OTHER]);
		expect(chairInvitesAfterPresses([INVITE, OTHER], [withdrawPress('i-x')])).toEqual([
			INVITE,
			OTHER
		]);
	});

	it('says what did not happen when a withdrawal failed', () => {
		expect(describeChairInviteWithdrawalFailure()).toBe('The invitation was not withdrawn.');
	});
});

describe('guideAfterPresses', () => {
	const GUIDE: BackgroundGuide = {
		id: 'd1',
		title: 'Background guide',
		fileName: 'guide.pdf',
		fileSizeBytes: 1000,
		audience: 'delegates',
		downloadUrl: null
	};

	it('shows no guide once "Remove guide" is pressed, and the guide otherwise', () => {
		const removal: InstantPress = { id: 1, ...pressInput('?/removeGuide', {}), expected: null };

		expect(guideAfterPresses(GUIDE, [removal])).toBeNull();
		expect(guideAfterPresses(GUIDE, [])).toBe(GUIDE);
	});
});

describe('failure toasts', () => {
	it('say what was not removed', () => {
		expect(describeChairRemovalFailure()).toBe('The chair was not removed.');
		expect(describeGuideRemovalFailure()).toBe('The background guide was not removed.');
	});
});

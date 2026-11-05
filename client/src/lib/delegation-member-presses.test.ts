import { describe, expect, it } from 'vitest';
import type { DelegationMember } from '$lib/delegations';
import type { PressedForm } from '$lib/row-changes';
import {
	describeMemberFailure,
	expectMemberPress,
	membersAfterPresses,
	type MemberPress
} from './delegation-member-presses';

/** A member with everything filled in, so each test only changes what it needs to. */
function makeMember(overrides: Partial<DelegationMember> = {}): DelegationMember {
	return {
		userId: 'user-ana',
		fullName: 'Ana Silva',
		avatarPath: null,
		institutionName: null,
		experienceLevel: 'beginner',
		role: 'member',
		joinedAt: '2026-02-01T10:00:00Z',
		seat: null,
		details: null,
		...overrides
	};
}

const MEMBERS = [
	makeMember(),
	makeMember({
		userId: 'user-luis',
		fullName: 'Luis Ortega',
		seat: {
			seatName: 'France',
			countryCode: 'FR',
			committeeName: 'Security Council',
			committeeAbbreviation: 'UNSC'
		}
	})
];

/** A press posting to `address` with `fields`, as `use:enhance` hands it over. */
function pressInput(address: string, fields: Record<string, string> = {}): PressedForm {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) formData.set(name, value);

	return {
		action: new URL(`http://localhost/delegations/d-1/members${address}`),
		formData
	};
}

/** The press as the instant form keeps it. */
function keptPress(input: PressedForm): MemberPress {
	return {
		id: 1,
		action: input.action,
		formData: input.formData,
		expected: expectMemberPress(input, MEMBERS)
	};
}

describe('expectMemberPress', () => {
	it('makes the member a head at once', () => {
		const press = keptPress(pressInput('?/makeHead', { userId: 'user-ana' }));

		expect(membersAfterPresses(MEMBERS, [press])[0].role).toBe('head');
	});

	it('takes a removed member out of the list', () => {
		const press = keptPress(pressInput('?/remove&user=user-ana'));

		expect(membersAfterPresses(MEMBERS, [press]).map((member) => member.userId)).toEqual([
			'user-luis'
		]);
	});

	it('leaves a member who holds a seat, whom the server will not remove', () => {
		expect(expectMemberPress(pressInput('?/remove&user=user-luis'), MEMBERS)).toBeNull();
	});

	it('expects nothing of "Step down", which takes the reader off the page', () => {
		expect(expectMemberPress(pressInput('?/stepDown'), MEMBERS)).toBeNull();
	});
});

describe('describeMemberFailure', () => {
	it('names the member', () => {
		const press = keptPress(pressInput('?/makeHead', { userId: 'user-ana' }));

		expect(describeMemberFailure(press, MEMBERS)).toBe('Ana Silva was not made a head.');
	});
});

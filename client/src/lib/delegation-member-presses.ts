/**
 * What "Make head" and "Remove" on a delegation's Members page change, worked
 * out in the browser so the row changes the moment it is pressed (T142).
 *
 * The page keeps one instant form (`createInstantForm` in
 * `$lib/instant-form.svelte.ts`) for every row. Each press keeps what it does
 * to one member as a `MemberChange`, and the page draws its members with those
 * laid on top (`membersAfterPresses`). "Step down" is not one of them: it
 * takes the reader off this page, which is the server's to decide.
 */
import type { InstantPress } from '$lib/instant-form.svelte';
import type { DelegationMember } from '$lib/delegations';
import { pressedAction, pressedField, type PressedForm } from '$lib/row-changes';

/** What one press does to one member: made a head, or taken out of the delegation. */
export type MemberChange = {
	userId: string;
	isMadeHead?: boolean;
	isRemoved?: boolean;
};

/** One press on the Members page and what it will change. */
export type MemberPress = InstantPress<MemberChange>;

/**
 * What a press will change, given the members on screen when it was made, or
 * null when the server will refuse it anyway: like the server, a member who
 * holds a seat cannot be removed, so that press changes nothing on screen and
 * the server's own warning says why. "Remove" posts to an address carrying the
 * member (`removeDelegationMemberUrl`).
 */
export function expectMemberPress(
	input: PressedForm,
	members: DelegationMember[]
): MemberChange | null {
	const action = pressedAction(input.action);

	if (action === '?/makeHead') {
		return { userId: pressedField(input.formData, 'userId'), isMadeHead: true };
	}

	if (action !== '?/remove') return null;

	const userId = input.action.searchParams.get('user') ?? '';
	const member = members.find((candidate) => candidate.userId === userId);

	if (!member || member.seat !== null) return null;

	return { userId, isRemoved: true };
}

/** `members` with one change laid on top. */
function withChange(members: DelegationMember[], change: MemberChange): DelegationMember[] {
	if (change.isRemoved) return members.filter((member) => member.userId !== change.userId);

	if (!change.isMadeHead) return members;

	return members.map((member) =>
		member.userId === change.userId ? { ...member, role: 'head' } : member
	);
}

/**
 * The members with every press still on its way laid on top, oldest first.
 * Laid over members that already hold a press, it changes nothing.
 */
export function membersAfterPresses(
	members: DelegationMember[],
	presses: MemberPress[]
): DelegationMember[] {
	let shown = members;

	for (const press of presses) {
		if (press.expected !== null) shown = withChange(shown, press.expected);
	}

	return shown;
}

/** What did not happen when a press failed, for its toast, naming the member. */
export function describeMemberFailure(press: MemberPress, members: DelegationMember[]): string {
	const userId = press.expected?.userId;
	const name = members.find((member) => member.userId === userId)?.fullName ?? 'The member';

	if (pressedAction(press.action) === '?/makeHead') return `${name} was not made a head.`;

	return `${name} was not removed.`;
}

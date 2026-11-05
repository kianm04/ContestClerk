import { describe, expect, it } from 'vitest';
import type { AllocatableSeat, SeatGroup } from '$lib/allocation';
import type { InstantSubmitInput } from '$lib/instant-form.svelte';
import {
	describeApplicationBoardFailure,
	expectApplicationBoardChange,
	isApplicationBoardWriteAction,
	seatGroupsByApplicationId,
	type ApplicationBoardPress
} from './application-board-presses';

/** A press of `search` carrying `fields`, the ids given as repeated `ids` values. */
function pressInput(search: string, ids: string[], fields: Record<string, string> = {}) {
	const formData = new FormData();
	for (const id of ids) formData.append('ids', id);
	for (const [name, value] of Object.entries(fields)) formData.set(name, value);

	return {
		action: new URL(`http://localhost/manage/rotterdam-2026/applications${search}`),
		formData,
		// A stand-in: nothing under test reads the real form element, and this
		// file's tests run in plain Node, which has no `document` to make one from.
		formElement: {} as HTMLFormElement,
		controller: new AbortController(),
		submitter: null,
		cancel: () => undefined
	} satisfies InstantSubmitInput;
}

/** A free seat in "UNSC", the way `listSeatsByCommittee` shapes one. */
function makeSeat(overrides: Partial<AllocatableSeat> = {}): AllocatableSeat {
	return {
		id: 'seat-1',
		committeeId: 'committee-1',
		name: 'France',
		countryCode: 'FR',
		isAvailable: true,
		delegationId: null,
		userId: null,
		...overrides
	};
}

const SEAT_GROUPS: SeatGroup[] = [
	{ committeeId: 'committee-1', committeeLabel: 'UNSC', seats: [makeSeat()] }
];

/** The press as the instant form keeps it, with its expectation. */
function keptPress(
	input: InstantSubmitInput,
	seatGroupsById: Map<string, SeatGroup[]> = new Map()
): ApplicationBoardPress {
	return {
		id: 1,
		formData: input.formData,
		action: input.action,
		expected: expectApplicationBoardChange(input, seatGroupsById)
	};
}

describe('isApplicationBoardWriteAction', () => {
	it('recognises the three write actions', () => {
		expect(isApplicationBoardWriteAction(pressInput('?/bulkWaitlist', ['a']).action)).toBe(true);
		expect(isApplicationBoardWriteAction(pressInput('?/bulkReject', ['a']).action)).toBe(true);
		expect(isApplicationBoardWriteAction(pressInput('?/bulkAccept', ['a']).action)).toBe(true);
	});

	it('reads the action from behind the board filter', () => {
		expect(
			isApplicationBoardWriteAction(pressInput('?status=submitted&/bulkWaitlist', ['a']).action)
		).toBe(true);
	});

	it('is false for the two actions that only open a panel', () => {
		expect(isApplicationBoardWriteAction(pressInput('?/chooseAccept', ['a']).action)).toBe(false);
		expect(isApplicationBoardWriteAction(pressInput('?/chooseReject', ['a']).action)).toBe(false);
	});
});

describe('expectApplicationBoardChange', () => {
	it('waitlists every ticked application', () => {
		const change = expectApplicationBoardChange(
			pressInput('?/bulkWaitlist', ['a', 'b']),
			new Map()
		);

		expect(change).toEqual([
			{ id: 'a', changes: { status: 'waitlisted' } },
			{ id: 'b', changes: { status: 'waitlisted' } }
		]);
	});

	it('marks every ticked application not accepted', () => {
		const change = expectApplicationBoardChange(pressInput('?/bulkReject', ['a', 'b']), new Map());

		expect(change).toEqual([
			{ id: 'a', changes: { status: 'rejected' } },
			{ id: 'b', changes: { status: 'rejected' } }
		]);
	});

	it('reads the same ticked id sent twice, from the table and the phone cards, only once', () => {
		const change = expectApplicationBoardChange(
			pressInput('?/bulkWaitlist', ['a', 'a']),
			new Map()
		);

		expect(change).toEqual([{ id: 'a', changes: { status: 'waitlisted' } }]);
	});

	it('accepts every ticked application into its own chosen seat', () => {
		const seatGroupsById = seatGroupsByApplicationId(
			[{ id: 'a', applicantName: 'Anna' } as never, { id: 'b', applicantName: 'Boris' } as never],
			[SEAT_GROUPS, [{ committeeId: 'committee-2', committeeLabel: 'UNGA', seats: [] }]]
		);
		const change = expectApplicationBoardChange(
			pressInput('?/bulkAccept', ['a'], { 'seat:a': 'seat-1' }),
			seatGroupsById
		);

		expect(change).toEqual([
			{ id: 'a', changes: { status: 'accepted', seatLabel: 'UNSC · France' } }
		]);
	});

	it('leaves bulkAccept unpredicted when one chosen seat is not among the free seats offered', () => {
		const seatGroupsById = seatGroupsByApplicationId(
			[{ id: 'a', applicantName: 'Anna' } as never],
			[SEAT_GROUPS]
		);
		const change = expectApplicationBoardChange(
			pressInput('?/bulkAccept', ['a'], { 'seat:a': 'seat-taken' }),
			seatGroupsById
		);

		expect(change).toBeNull();
	});

	it('leaves nothing predicted when nothing was ticked', () => {
		expect(expectApplicationBoardChange(pressInput('?/bulkWaitlist', []), new Map())).toBeNull();
	});

	it('leaves a press to open a panel unpredicted', () => {
		expect(expectApplicationBoardChange(pressInput('?/chooseAccept', ['a']), new Map())).toBeNull();
	});
});

describe('describeApplicationBoardFailure', () => {
	it('names what did not happen for one application', () => {
		expect(describeApplicationBoardFailure(keptPress(pressInput('?/bulkWaitlist', ['a'])))).toBe(
			'The application was not waitlisted.'
		);
		expect(describeApplicationBoardFailure(keptPress(pressInput('?/bulkReject', ['a'])))).toBe(
			'The application was not marked as not accepted.'
		);
		expect(describeApplicationBoardFailure(keptPress(pressInput('?/bulkAccept', ['a'])))).toBe(
			'The application was not accepted.'
		);
	});

	it('names what did not happen for more than one application', () => {
		expect(
			describeApplicationBoardFailure(keptPress(pressInput('?/bulkWaitlist', ['a', 'b'])))
		).toBe('The 2 applications were not waitlisted.');
	});
});

import { describe, expect, it } from 'vitest';
import type { PressedForm } from '$lib/row-changes';
import {
	delegationReviewAfterPresses,
	describeDelegationReviewFailure,
	expectDelegationReviewChange,
	type DelegationReviewPress,
	type DelegationReviewRows
} from './delegation-review-presses';

const ROWS: DelegationReviewRows = {
	status: 'submitted',
	seatGroups: [
		{
			committee: { id: 'c-1', name: 'Security Council', abbreviation: 'UNSC', level: 'advanced' },
			seats: [{ id: 'seat-de', name: 'Germany', countryCode: 'DE', holder: null }]
		}
	],
	freeSeatsByCommittee: [
		{
			committeeId: 'c-1',
			committeeLabel: 'UNSC',
			seats: [
				{
					id: 'seat-fr',
					committeeId: 'c-1',
					name: 'France',
					countryCode: 'FR',
					isAvailable: true,
					delegationId: null,
					userId: null
				}
			]
		},
		{
			committeeId: 'c-2',
			committeeLabel: 'ECOSOC',
			seats: [
				{
					id: 'seat-br',
					committeeId: 'c-2',
					name: 'Brazil',
					countryCode: 'BR',
					isAvailable: true,
					delegationId: null,
					userId: null
				}
			]
		}
	]
};

/** A press posting to `address` with `fields`, as `use:enhance` hands it over. */
function pressInput(address: string, fields: Record<string, string[] | string> = {}): PressedForm {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		for (const one of Array.isArray(value) ? value : [value]) formData.append(name, one);
	}

	return {
		action: new URL(`http://localhost/manage/riverside-mun/delegations/d-1${address}`),
		formData
	};
}

/** The press as the instant form keeps it. */
function keptPress(input: PressedForm, rows: DelegationReviewRows = ROWS): DelegationReviewPress {
	return {
		id: 1,
		action: input.action,
		formData: input.formData,
		expected: expectDelegationReviewChange(input, rows)
	};
}

describe('expectDelegationReviewChange for ?/allocate', () => {
	it('moves a ticked free seat into a committee already holding a reserved seat', () => {
		const press = keptPress(pressInput('?/allocate', { seatIds: 'seat-fr' }));
		const shown = delegationReviewAfterPresses(ROWS, [press]);

		expect(shown.status).toBe('accepted');
		expect(shown.seatGroups[0].seats.map((seat) => seat.id)).toEqual(['seat-de', 'seat-fr']);
		expect(
			shown.freeSeatsByCommittee.flatMap((group) => group.seats.map((seat) => seat.id))
		).toEqual(['seat-br']);
	});

	it('opens a new group for a committee this delegation held no seat in yet', () => {
		const press = keptPress(pressInput('?/allocate', { seatIds: 'seat-br' }));
		const shown = delegationReviewAfterPresses(ROWS, [press]);

		const newGroup = shown.seatGroups.find((group) => group.committee.id === 'c-2');

		expect(newGroup?.committee.name).toBe('ECOSOC');
		expect(newGroup?.seats.map((seat) => seat.id)).toEqual(['seat-br']);
	});

	it('leaves the status alone once the delegation has already been accepted', () => {
		const accepted: DelegationReviewRows = { ...ROWS, status: 'accepted' };
		const press = keptPress(pressInput('?/allocate', { seatIds: 'seat-fr' }), accepted);
		const shown = delegationReviewAfterPresses(accepted, [press]);

		expect(shown.status).toBe('accepted');
	});

	it('predicts nothing for an empty tick list', () => {
		const press = keptPress(pressInput('?/allocate', {}));

		expect(press.expected).toBeNull();
	});

	it('predicts nothing for a seat this page is not offering', () => {
		const press = keptPress(pressInput('?/allocate', { seatIds: 'seat-unknown' }));

		expect(press.expected).toBeNull();
	});

	it('changes nothing when laid over rows that already hold the press', () => {
		const press = keptPress(pressInput('?/allocate', { seatIds: 'seat-fr' }));
		const once = delegationReviewAfterPresses(ROWS, [press]);

		expect(delegationReviewAfterPresses(once, [press])).toEqual(once);
	});
});

describe('expectDelegationReviewChange for ?/removeSeat', () => {
	it('gives an empty seat back to its committee, free again', () => {
		const press = keptPress(pressInput('?seatId=seat-de&/removeSeat'));
		const shown = delegationReviewAfterPresses(ROWS, [press]);

		expect(shown.seatGroups).toEqual([]);
		const backFree = shown.freeSeatsByCommittee.find((group) => group.committeeId === 'c-1');
		expect(backFree?.seats.map((seat) => seat.id)).toEqual(['seat-fr', 'seat-de']);
	});

	it('predicts nothing for a seat somebody is already sitting in', () => {
		const occupied: DelegationReviewRows = {
			...ROWS,
			seatGroups: [
				{
					...ROWS.seatGroups[0],
					seats: [
						{
							id: 'seat-de',
							name: 'Germany',
							countryCode: 'DE',
							holder: {
								userId: 'u-1',
								fullName: 'Max Weber',
								avatarPath: null,
								experienceLevel: 'advanced'
							}
						}
					]
				}
			]
		};
		const press = keptPress(pressInput('?seatId=seat-de&/removeSeat'), occupied);

		expect(press.expected).toBeNull();
	});

	it('predicts nothing for a seat this page no longer lists', () => {
		const press = keptPress(pressInput('?seatId=seat-gone&/removeSeat'));

		expect(press.expected).toBeNull();
	});
});

describe('expectDelegationReviewChange for ?/reject', () => {
	it('marks the delegation not accepted once it holds no reserved seats', () => {
		const noSeats: DelegationReviewRows = { ...ROWS, seatGroups: [] };
		const press = keptPress(pressInput('?/reject'), noSeats);
		const shown = delegationReviewAfterPresses(noSeats, [press]);

		expect(shown.status).toBe('rejected');
	});

	it('predicts nothing while the delegation still holds a reserved seat', () => {
		const press = keptPress(pressInput('?/reject'));

		expect(press.expected).toBeNull();
	});
});

describe('describeDelegationReviewFailure', () => {
	it('names each of the three actions', () => {
		expect(describeDelegationReviewFailure(keptPress(pressInput('?/allocate')))).toBe(
			'The seats were not allocated.'
		);
		expect(
			describeDelegationReviewFailure(keptPress(pressInput('?seatId=seat-de&/removeSeat')))
		).toBe('The seat was not removed.');
		expect(describeDelegationReviewFailure(keptPress(pressInput('?/reject')))).toBe(
			'The delegation was not marked as not accepted.'
		);
	});
});

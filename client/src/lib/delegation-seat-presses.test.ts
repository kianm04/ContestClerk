import { describe, expect, it } from 'vitest';
import type { PressedForm } from '$lib/row-changes';
import {
	describeSeatFailure,
	expectSeatPress,
	seatsAfterPresses,
	type DelegationSeatPress,
	type SeatsPageRows
} from './delegation-seat-presses';

const ROWS: SeatsPageRows = {
	groups: [
		{
			committee: { id: 'c-1', name: 'Security Council', abbreviation: 'UNSC', level: 'advanced' },
			seats: [
				{ id: 'seat-fr', name: 'France', countryCode: 'FR', holder: null },
				{
					id: 'seat-de',
					name: 'Germany',
					countryCode: 'DE',
					holder: {
						userId: 'user-luis',
						fullName: 'Luis Ortega',
						avatarPath: null,
						experienceLevel: 'advanced'
					}
				}
			]
		}
	],
	unseatedMembers: [
		{ userId: 'user-ana', fullName: 'Ana Silva', avatarPath: null, experienceLevel: 'beginner' }
	]
};

/** A press posting to `address` with `fields`, as `use:enhance` hands it over. */
function pressInput(address: string, fields: Record<string, string> = {}): PressedForm {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) formData.set(name, value);

	return {
		action: new URL(`http://localhost/delegations/d-1/seats${address}`),
		formData
	};
}

/** The press as the instant form keeps it. */
function keptPress(input: PressedForm): DelegationSeatPress {
	return {
		id: 1,
		action: input.action,
		formData: input.formData,
		expected: expectSeatPress(input, ROWS.unseatedMembers)
	};
}

const ASSIGN_ANA = pressInput('?/assign', { seatId: 'seat-fr', 'userId-seat-fr': 'user-ana' });
const UNASSIGN_LUIS = pressInput('?/unassign&seat=seat-de');

describe('seatsAfterPresses', () => {
	it('puts the chosen member in the seat and out of the unseated list', () => {
		const shown = seatsAfterPresses(ROWS, [keptPress(ASSIGN_ANA)]);

		expect(shown.groups[0].seats[0].holder?.fullName).toBe('Ana Silva');
		expect(shown.unseatedMembers).toEqual([]);
	});

	it('empties the seat and puts its holder back among the unseated', () => {
		const shown = seatsAfterPresses(ROWS, [keptPress(UNASSIGN_LUIS)]);

		expect(shown.groups[0].seats[1].holder).toBeNull();
		expect(shown.unseatedMembers.map((member) => member.userId)).toEqual(['user-ana', 'user-luis']);
	});

	it('changes nothing when laid over rows that already hold the press', () => {
		const press = keptPress(ASSIGN_ANA);
		const once = seatsAfterPresses(ROWS, [press]);

		expect(seatsAfterPresses(once, [press])).toEqual(once);
	});

	it('leaves the rows alone for a press that chose nobody', () => {
		const press = keptPress(pressInput('?/assign', { seatId: 'seat-fr' }));

		expect(press.expected).toBeNull();
		expect(seatsAfterPresses(ROWS, [press])).toEqual(ROWS);
	});

	it('does not bring back a holder whose account has gone', () => {
		const goneHolder = { ...ROWS.groups[0].seats[1].holder!, experienceLevel: null };
		const rows: SeatsPageRows = {
			...ROWS,
			groups: [{ ...ROWS.groups[0], seats: [{ ...ROWS.groups[0].seats[1], holder: goneHolder }] }]
		};

		const shown = seatsAfterPresses(rows, [keptPress(UNASSIGN_LUIS)]);

		expect(shown.unseatedMembers.map((member) => member.userId)).toEqual(['user-ana']);
	});
});

describe('describeSeatFailure', () => {
	it('names the member who was not given the seat', () => {
		expect(describeSeatFailure(keptPress(ASSIGN_ANA))).toBe('Ana Silva was not given the seat.');
	});

	it('says the seat was not emptied', () => {
		expect(describeSeatFailure(keptPress(UNASSIGN_LUIS))).toBe('The seat was not emptied.');
	});
});

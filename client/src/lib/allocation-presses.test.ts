import { describe, expect, it } from 'vitest';
import type { SeatColumn } from '$lib/allocation';
import type { PressedForm } from '$lib/row-changes';
import {
	allocationColumnsAfterPresses,
	describeAllocationFailure,
	expectAllocationChange,
	type AllocationPress
} from './allocation-presses';

const COMMITTEE_A = {
	id: 'c-1',
	name: 'Security Council',
	abbreviation: 'UNSC',
	level: 'advanced'
};
const COMMITTEE_B = { id: 'c-2', name: 'ECOSOC', abbreviation: 'ECOSOC', level: 'none' };

/** A seat filled by an individual delegate, with no delegation behind it. */
const FILLED_SEAT_DE = {
	id: 'seat-de',
	committeeId: 'c-1',
	committee: COMMITTEE_A,
	name: 'Germany',
	countryCode: 'DE',
	isAvailable: true,
	delegationId: null,
	userId: 'user-de',
	holderName: 'Dana',
	holderAvatarPath: null,
	holderCountryCode: 'DE',
	holderInstitution: null,
	delegationName: null,
	applicationId: 'app-de'
};

/** A seat reserved for a delegation and filled by one of its members. */
const RESERVED_FILLED_SEAT_FR = {
	id: 'seat-fr',
	committeeId: 'c-1',
	committee: COMMITTEE_A,
	name: 'France',
	countryCode: 'FR',
	isAvailable: true,
	delegationId: 'delegation-1',
	userId: 'user-fr',
	holderName: 'Farah',
	holderAvatarPath: '/avatars/farah.png',
	holderCountryCode: 'FR',
	holderInstitution: null,
	delegationName: 'Team Riverside',
	applicationId: 'app-fr'
};

/** A seat reserved for a delegation but nobody sitting in it yet. */
const RESERVED_EMPTY_SEAT_BR = {
	id: 'seat-br',
	committeeId: 'c-2',
	committee: COMMITTEE_B,
	name: 'Brazil',
	countryCode: 'BR',
	isAvailable: true,
	delegationId: 'delegation-1',
	userId: null,
	holderName: null,
	holderAvatarPath: null,
	holderCountryCode: null,
	holderInstitution: null,
	delegationName: 'Team Riverside',
	applicationId: null
};

/** An open seat with nobody in it and no delegation holding it. */
const FREE_SEAT_CA = {
	id: 'seat-ca',
	committeeId: 'c-2',
	committee: COMMITTEE_B,
	name: 'Canada',
	countryCode: 'CA',
	isAvailable: true,
	delegationId: null,
	userId: null,
	holderName: null,
	holderAvatarPath: null,
	holderCountryCode: null,
	holderInstitution: null,
	delegationName: null,
	applicationId: null
};

/** A seat the organisers have hidden this year. */
const HIDDEN_SEAT_JP = {
	id: 'seat-jp',
	committeeId: 'c-2',
	committee: COMMITTEE_B,
	name: 'Japan',
	countryCode: 'JP',
	isAvailable: false,
	delegationId: null,
	userId: null,
	holderName: null,
	holderAvatarPath: null,
	holderCountryCode: null,
	holderInstitution: null,
	delegationName: null,
	applicationId: null
};

const COLUMNS: SeatColumn[] = [
	{
		committee: COMMITTEE_A,
		seats: [FILLED_SEAT_DE, RESERVED_FILLED_SEAT_FR],
		totalCount: 2,
		filledCount: 2
	},
	{
		committee: COMMITTEE_B,
		seats: [RESERVED_EMPTY_SEAT_BR, FREE_SEAT_CA, HIDDEN_SEAT_JP],
		totalCount: 3,
		filledCount: 0
	}
];

/** A press posting to `address` with `fields`, as `use:enhance` hands it over. */
function pressInput(address: string, fields: Record<string, string> = {}): PressedForm {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.append(name, value);
	}

	return {
		action: new URL(`http://localhost/manage/riverside-mun/allocation${address}`),
		formData
	};
}

/** The press as the instant form keeps it. */
function keptPress(input: PressedForm, columns: SeatColumn[] = COLUMNS): AllocationPress {
	return {
		id: 1,
		action: input.action,
		formData: input.formData,
		expected: expectAllocationChange(input, columns)
	};
}

/** The seat named `seatId`, once every press has been laid on top of `COLUMNS`. */
function shownSeat(seatId: string, presses: AllocationPress[]) {
	const shown = allocationColumnsAfterPresses(COLUMNS, presses);
	return shown.flatMap((column) => column.seats).find((seat) => seat.id === seatId) ?? null;
}

describe('expectAllocationChange for ?/freeSeat', () => {
	it('empties a seat held only by an individual delegate', () => {
		const press = keptPress(pressInput('?seat=seat-de&/freeSeat'));
		const seat = shownSeat('seat-de', [press]);

		expect(seat?.userId).toBeNull();
		expect(seat?.holderName).toBeNull();
		expect(seat?.delegationId).toBeNull();
	});

	it('unassigns the member but keeps a delegation-reserved seat reserved', () => {
		const press = keptPress(pressInput('?seat=seat-fr&/freeSeat'));
		const seat = shownSeat('seat-fr', [press]);

		expect(seat?.userId).toBeNull();
		expect(seat?.holderName).toBeNull();
		expect(seat?.delegationId).toBe('delegation-1');
		expect(seat?.delegationName).toBe('Team Riverside');
	});

	it('clears the delegation off a reserved seat with nobody sitting in it', () => {
		const press = keptPress(pressInput('?seat=seat-br&/freeSeat'));
		const seat = shownSeat('seat-br', [press]);

		expect(seat?.delegationId).toBeNull();
		expect(seat?.delegationName).toBeNull();
	});

	it('does not predict freeing a seat that is already free', () => {
		const press = keptPress(pressInput('?seat=seat-ca&/freeSeat'));

		expect(press.expected).toBeNull();
	});

	it('does not predict a press naming a seat the filters are hiding', () => {
		const press = keptPress(pressInput('?seat=seat-unknown&/freeSeat'));

		expect(press.expected).toBeNull();
	});
});

describe('expectAllocationChange for ?/toggleHidden', () => {
	it('hides a free seat', () => {
		const press = keptPress(pressInput('?seat=seat-ca&/toggleHidden'));
		const seat = shownSeat('seat-ca', [press]);

		expect(seat?.isAvailable).toBe(false);
	});

	it('makes a hidden seat available again', () => {
		const press = keptPress(pressInput('?seat=seat-jp&/toggleHidden'));
		const seat = shownSeat('seat-jp', [press]);

		expect(seat?.isAvailable).toBe(true);
	});

	it('does not predict hiding a seat that already has a delegate in it', () => {
		const press = keptPress(pressInput('?seat=seat-de&/toggleHidden'));

		expect(press.expected).toBeNull();
	});

	it('does not predict hiding a seat that is still reserved', () => {
		const press = keptPress(pressInput('?seat=seat-br&/toggleHidden'));

		expect(press.expected).toBeNull();
	});
});

describe('expectAllocationChange for ?/moveDelegate', () => {
	it('moves an individual delegate to a free seat, taking their details with them', () => {
		const press = keptPress(
			pressInput('?seat=seat-de&/moveDelegate', { seatId: 'seat-de', toSeatId: 'seat-ca' })
		);
		const shown = allocationColumnsAfterPresses(COLUMNS, [press]);
		const from = shown.flatMap((column) => column.seats).find((seat) => seat.id === 'seat-de');
		const to = shown.flatMap((column) => column.seats).find((seat) => seat.id === 'seat-ca');

		expect(from?.userId).toBeNull();
		expect(to?.userId).toBe('user-de');
		expect(to?.holderName).toBe('Dana');
		// A move never touches `delegationId`: this seat had none before and has none after.
		expect(to?.delegationId).toBeNull();
	});

	it('does not predict moving a delegation member into a seat outside their delegation', () => {
		const press = keptPress(
			pressInput('?seat=seat-fr&/moveDelegate', { seatId: 'seat-fr', toSeatId: 'seat-ca' })
		);

		expect(press.expected).toBeNull();
	});

	it('does not predict moving a seat with nobody in it', () => {
		const press = keptPress(
			pressInput('?seat=seat-br&/moveDelegate', { seatId: 'seat-br', toSeatId: 'seat-ca' })
		);

		expect(press.expected).toBeNull();
	});

	it('still empties the seat left behind when the target seat is hidden by a filter', () => {
		const press = keptPress(
			pressInput('?seat=seat-de&/moveDelegate', { seatId: 'seat-de', toSeatId: 'seat-unknown' })
		);
		const seat = shownSeat('seat-de', [press]);

		expect(seat?.userId).toBeNull();
	});
});

describe('describeAllocationFailure', () => {
	it('names freeing a seat', () => {
		const press = keptPress(pressInput('?seat=seat-de&/freeSeat'));
		expect(describeAllocationFailure(press)).toBe('The seat was not freed.');
	});

	it('names moving a delegate', () => {
		const press = keptPress(
			pressInput('?seat=seat-de&/moveDelegate', { seatId: 'seat-de', toSeatId: 'seat-ca' })
		);
		expect(describeAllocationFailure(press)).toBe('The delegate was not moved.');
	});

	it('names hiding a seat', () => {
		const press = keptPress(pressInput('?seat=seat-ca&/toggleHidden'));
		expect(describeAllocationFailure(press)).toBe('The seat was not hidden.');
	});

	it('names making a seat available again', () => {
		const press = keptPress(pressInput('?seat=seat-jp&/toggleHidden'));
		expect(describeAllocationFailure(press)).toBe('The seat was not made available again.');
	});
});

import { describe, expect, it } from 'vitest';
import type { GridSeat, SeatColumn } from './allocation';
import type { CommitteeChoice } from './applications';
import {
	dragSourceName,
	seatDropKind,
	showPendingDrop,
	showPendingTray,
	swapSentence,
	type PendingSeatDrop,
	type SeatDragSource,
	type TrayDelegation
} from './seat-drop';

const SECURITY_COUNCIL: CommitteeChoice = {
	id: 'committee-unsc',
	name: 'United Nations Security Council',
	abbreviation: 'UNSC'
};

const HUMAN_RIGHTS_COUNCIL: CommitteeChoice = {
	id: 'committee-hrc',
	name: 'Human Rights Council',
	abbreviation: 'HRC'
};

/** One free seat of the Security Council, with whatever a test changes about it. */
function makeGridSeat(id: string, name: string, changes: Partial<GridSeat> = {}): GridSeat {
	const committee = changes.committee ?? SECURITY_COUNCIL;

	return {
		id,
		committeeId: committee.id,
		name,
		countryCode: null,
		isAvailable: true,
		delegationId: null,
		userId: null,
		committee,
		holderName: null,
		holderAvatarPath: null,
		holderCountryCode: null,
		holderInstitution: null,
		delegationName: null,
		applicationId: null,
		...changes
	};
}

const ANNA_IN_FRANCE = makeGridSeat('seat-france', 'France', {
	userId: 'user-anna',
	applicationId: 'application-anna',
	holderName: 'Anna Kowalski',
	holderAvatarPath: 'anna.png'
});

const BEN_IN_JAPAN = makeGridSeat('seat-japan', 'Japan', {
	committee: HUMAN_RIGHTS_COUNCIL,
	userId: 'user-ben',
	applicationId: 'application-ben',
	holderName: 'Ben Lee'
});

const FREE_PERU = makeGridSeat('seat-peru', 'Peru', { committee: HUMAN_RIGHTS_COUNCIL });

const LYCEE: TrayDelegation = {
	id: 'delegation-lycee',
	name: 'Lycée Français',
	countryCode: 'FR',
	requestedSeats: 4,
	allocatedSeats: 1
};

const ANNA_SOURCE: SeatDragSource = { kind: 'seat', seat: ANNA_IN_FRANCE };
const LYCEE_SOURCE: SeatDragSource = { kind: 'delegation', delegation: LYCEE };

describe('seatDropKind', () => {
	it('moves a delegate onto a free seat', () => {
		expect(seatDropKind(ANNA_SOURCE, FREE_PERU)).toBe('move');
	});

	it('swaps a delegate with another delegate held the same way', () => {
		expect(seatDropKind(ANNA_SOURCE, BEN_IN_JAPAN)).toBe('swap');
	});

	it('does nothing on the seat the delegate is already in', () => {
		expect(seatDropKind(ANNA_SOURCE, ANNA_IN_FRANCE)).toBeNull();
	});

	it('does nothing on a seat a delegation holds, whoever is dragged', () => {
		const reserved = makeGridSeat('seat-chile', 'Chile', { delegationId: 'delegation-other' });

		expect(seatDropKind(ANNA_SOURCE, reserved)).toBeNull();
		expect(seatDropKind(LYCEE_SOURCE, reserved)).toBeNull();
	});

	it('does nothing on a hidden seat', () => {
		const hidden = makeGridSeat('seat-chile', 'Chile', { isAvailable: false });

		expect(seatDropKind(ANNA_SOURCE, hidden)).toBeNull();
		expect(seatDropKind(LYCEE_SOURCE, hidden)).toBeNull();
	});

	it('assigns a delegation a free seat', () => {
		expect(seatDropKind(LYCEE_SOURCE, FREE_PERU)).toBe('assign');
	});

	it('never lets a delegation land on somebody', () => {
		expect(seatDropKind(LYCEE_SOURCE, BEN_IN_JAPAN)).toBeNull();
	});
});

describe('dragSourceName', () => {
	it('names the delegate or the delegation', () => {
		expect(dragSourceName(ANNA_SOURCE)).toBe('Anna Kowalski');
		expect(dragSourceName(LYCEE_SOURCE)).toBe('Lycée Français');
	});
});

describe('swapSentence', () => {
	it('says where each of the two goes', () => {
		expect(swapSentence(ANNA_IN_FRANCE, BEN_IN_JAPAN)).toBe(
			'Anna Kowalski moves to HRC · Japan, and Ben Lee moves to UNSC · France.'
		);
	});
});

describe('showPendingDrop', () => {
	const COLUMNS: SeatColumn[] = [
		{ committee: SECURITY_COUNCIL, seats: [ANNA_IN_FRANCE], totalCount: 1, filledCount: 1 },
		{
			committee: HUMAN_RIGHTS_COUNCIL,
			seats: [BEN_IN_JAPAN, FREE_PERU],
			totalCount: 2,
			filledCount: 1
		}
	];

	it('leaves the grid alone when nothing is being saved', () => {
		expect(showPendingDrop(COLUMNS, null)).toBe(COLUMNS);
	});

	it('moves the delegate and the filled counts with them', () => {
		const drop: PendingSeatDrop = { kind: 'move', source: ANNA_SOURCE, target: FREE_PERU };
		const [security, humanRights] = showPendingDrop(COLUMNS, drop);

		expect(security.seats[0].userId).toBeNull();
		expect(security.seats[0].holderName).toBeNull();
		expect(security.filledCount).toBe(0);
		expect(humanRights.seats[1].holderName).toBe('Anna Kowalski');
		expect(humanRights.seats[1].applicationId).toBe('application-anna');
		expect(humanRights.filledCount).toBe(2);
	});

	it('trades the two delegates and keeps the counts', () => {
		const drop: PendingSeatDrop = { kind: 'swap', source: ANNA_SOURCE, target: BEN_IN_JAPAN };
		const [security, humanRights] = showPendingDrop(COLUMNS, drop);

		expect(security.seats[0].holderName).toBe('Ben Lee');
		expect(security.seats[0].holderAvatarPath).toBeNull();
		expect(humanRights.seats[0].holderName).toBe('Anna Kowalski');
		expect(humanRights.seats[0].holderAvatarPath).toBe('anna.png');
		expect(security.filledCount).toBe(1);
		expect(humanRights.filledCount).toBe(1);
	});

	it('reserves the seat for an assigned delegation', () => {
		const drop: PendingSeatDrop = { kind: 'assign', source: LYCEE_SOURCE, target: FREE_PERU };
		const [, humanRights] = showPendingDrop(COLUMNS, drop);

		expect(humanRights.seats[1].delegationId).toBe('delegation-lycee');
		expect(humanRights.seats[1].delegationName).toBe('Lycée Français');
		expect(humanRights.seats[0]).toBe(BEN_IN_JAPAN);
	});
});

describe('showPendingTray', () => {
	it('counts the seat an assignment is saving', () => {
		const drop: PendingSeatDrop = { kind: 'assign', source: LYCEE_SOURCE, target: FREE_PERU };

		expect(showPendingTray([LYCEE], drop)[0].allocatedSeats).toBe(2);
	});

	it('leaves the tray alone for a move', () => {
		const drop: PendingSeatDrop = { kind: 'move', source: ANNA_SOURCE, target: FREE_PERU };

		expect(showPendingTray([LYCEE], drop)).toEqual([LYCEE]);
	});
});

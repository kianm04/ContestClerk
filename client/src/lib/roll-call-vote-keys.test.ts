import { describe, expect, it } from 'vitest';
import {
	movedMarkedSeatId,
	rollCallVoteKeyAction,
	startingMarkedSeatId
} from './roll-call-vote-keys';

const SEAT_IDS = ['brazil', 'china', 'france'];

describe('rollCallVoteKeyAction', () => {
	it('answers Yes, No and Abstain with Y, N and A, in either case', () => {
		expect(rollCallVoteKeyAction('y')).toEqual({ kind: 'answer', choice: 'for' });
		expect(rollCallVoteKeyAction('N')).toEqual({ kind: 'answer', choice: 'against' });
		expect(rollCallVoteKeyAction('a')).toEqual({ kind: 'answer', choice: 'abstain' });
	});

	it('moves the marker with the arrows and leaves every other key alone', () => {
		expect(rollCallVoteKeyAction('ArrowDown')).toEqual({ kind: 'move', step: 1 });
		expect(rollCallVoteKeyAction('ArrowUp')).toEqual({ kind: 'move', step: -1 });
		expect(rollCallVoteKeyAction('p')).toBeNull();
		expect(rollCallVoteKeyAction('Enter')).toBeNull();
	});
});

describe('startingMarkedSeatId', () => {
	it('starts on the seat the address names', () => {
		expect(startingMarkedSeatId(SEAT_IDS, {}, 'china')).toBe('china');
	});

	it('otherwise starts on the first seat that has not answered, from the top', () => {
		expect(startingMarkedSeatId(SEAT_IDS, { brazil: 'for' }, null)).toBe('china');
		expect(startingMarkedSeatId(SEAT_IDS, { brazil: 'for' }, 'japan')).toBe('china');
	});

	it('starts at the top once everyone has answered, and on nothing in an empty list', () => {
		const everyone = { brazil: 'for', china: 'against', france: 'abstain' } as const;

		expect(startingMarkedSeatId(SEAT_IDS, everyone, null)).toBe('brazil');
		expect(startingMarkedSeatId([], {}, null)).toBeNull();
	});
});

describe('movedMarkedSeatId', () => {
	it('moves one seat down or up', () => {
		expect(movedMarkedSeatId(SEAT_IDS, 'china', 1)).toBe('france');
		expect(movedMarkedSeatId(SEAT_IDS, 'china', -1)).toBe('brazil');
	});

	it('stays put at either end', () => {
		expect(movedMarkedSeatId(SEAT_IDS, 'france', 1)).toBe('france');
		expect(movedMarkedSeatId(SEAT_IDS, 'brazil', -1)).toBe('brazil');
	});

	it('starts again at the top from a seat no longer listed', () => {
		expect(movedMarkedSeatId(SEAT_IDS, 'japan', 1)).toBe('brazil');
		expect(movedMarkedSeatId(SEAT_IDS, null, 1)).toBe('brazil');
	});
});

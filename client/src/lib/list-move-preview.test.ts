import { describe, expect, it } from 'vitest';
import { movedOrder, pendingMoveFrom } from './list-move-preview';

type Row = { id: string; label: string };

const ROWS: Row[] = [
	{ id: 'a', label: 'A' },
	{ id: 'b', label: 'B' },
	{ id: 'c', label: 'C' }
];

describe('movedOrder', () => {
	it('returns the rows unchanged when there is no pending move', () => {
		expect(movedOrder(ROWS, null)).toEqual(ROWS);
	});

	it('returns the rows unchanged when the pending id is not in the list', () => {
		expect(movedOrder(ROWS, { id: 'missing', direction: 'up' })).toEqual(ROWS);
	});

	it('swaps a row with its neighbour above when moving up', () => {
		const shown = movedOrder(ROWS, { id: 'b', direction: 'up' });

		expect(shown.map((row) => row.id)).toEqual(['b', 'a', 'c']);
	});

	it('swaps a row with its neighbour below when moving down', () => {
		const shown = movedOrder(ROWS, { id: 'b', direction: 'down' });

		expect(shown.map((row) => row.id)).toEqual(['a', 'c', 'b']);
	});

	it('returns the rows unchanged when moving the first row up', () => {
		expect(movedOrder(ROWS, { id: 'a', direction: 'up' })).toEqual(ROWS);
	});

	it('returns the rows unchanged when moving the last row down', () => {
		expect(movedOrder(ROWS, { id: 'c', direction: 'down' })).toEqual(ROWS);
	});

	it('does not mutate the rows it was given', () => {
		const original = [...ROWS];

		movedOrder(ROWS, { id: 'b', direction: 'up' });

		expect(ROWS).toEqual(original);
	});
});

describe('pendingMoveFrom', () => {
	it('reads the direction from the address the arrow posts to', () => {
		const action = new URL('https://munmeet.test/manage/x/fees?/moveFee&direction=down');

		expect(pendingMoveFrom('fee-1', action)).toEqual({ id: 'fee-1', direction: 'down' });
	});

	it('is null for a button of the same form that moves nothing', () => {
		const action = new URL('https://munmeet.test/manage/x/committees/c?/deleteSeat');

		expect(pendingMoveFrom('seat-1', action)).toBeNull();
	});
});

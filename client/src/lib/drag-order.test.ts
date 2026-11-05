import { describe, expect, it } from 'vitest';
import {
	cancelledMessage,
	dropIndex,
	droppedMessage,
	keyboardTarget,
	makeRoomOffset,
	moveItem,
	movedMessage,
	pickedUpMessage,
	placeOffset,
	placedOrder,
	positionsAfterDrop,
	readDroppedPlace,
	reorderHint,
	rowStep,
	type RowBox
} from './drag-order';

// Four rows 40px tall with 8px between them, starting 100px down the screen.
const BOXES: RowBox[] = [
	{ top: 100, height: 40 },
	{ top: 148, height: 40 },
	{ top: 196, height: 40 },
	{ top: 244, height: 40 }
];

describe('moveItem', () => {
	it('takes an item out and puts it back at the new place', () => {
		expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
		expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
	});

	it('leaves the array it was given alone', () => {
		const items = ['a', 'b'];
		moveItem(items, 0, 1);

		expect(items).toEqual(['a', 'b']);
	});

	it('changes nothing for a place outside the list', () => {
		expect(moveItem(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
		expect(moveItem(['a', 'b'], -1, 0)).toEqual(['a', 'b']);
	});
});

describe('placedOrder', () => {
	const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

	it('shows a drop on its way to the server at once', () => {
		expect(placedOrder(rows, { id: 'c', toIndex: 0 }).map((row) => row.id)).toEqual([
			'c',
			'a',
			'b'
		]);
	});

	it('shows the rows as they are when nothing is pending or the row has gone', () => {
		expect(placedOrder(rows, null)).toBe(rows);
		expect(placedOrder(rows, { id: 'gone', toIndex: 0 })).toBe(rows);
	});

	it('puts a row dropped past the end of a list that has since shrunk last', () => {
		expect(placedOrder(rows, { id: 'a', toIndex: 9 }).map((row) => row.id)).toEqual([
			'b',
			'c',
			'a'
		]);
	});
});

describe('dropIndex', () => {
	it('stays in place until the dragged middle passes a neighbour’s middle', () => {
		// The first row's middle is at 120; the second row's middle is at 168.
		expect(dropIndex(BOXES, 0, 160)).toBe(0);
		expect(dropIndex(BOXES, 0, 170)).toBe(1);
	});

	it('lands at the top or the bottom when dragged past either end', () => {
		expect(dropIndex(BOXES, 2, 0)).toBe(0);
		expect(dropIndex(BOXES, 1, 999)).toBe(3);
	});
});

describe('makeRoomOffset', () => {
	it('slides the rows between the old and new place towards the old place', () => {
		// Row 0 dragged to place 2: rows 1 and 2 slide up one step.
		expect([0, 1, 2, 3].map((index) => makeRoomOffset(index, 0, 2, 48))).toEqual([0, -48, -48, 0]);
		// Row 3 dragged to place 1: rows 1 and 2 slide down one step.
		expect([0, 1, 2, 3].map((index) => makeRoomOffset(index, 3, 1, 48))).toEqual([0, 48, 48, 0]);
	});

	it('leaves every row alone while the dragged row is still in its own place', () => {
		expect([0, 1, 2].map((index) => makeRoomOffset(index, 1, 1, 48))).toEqual([0, 0, 0]);
	});
});

describe('placeOffset and rowStep', () => {
	it('slides a row exactly onto the place it is moved to', () => {
		expect(placeOffset(BOXES, 0, 2)).toBe(96);
		expect(placeOffset(BOXES, 3, 0)).toBe(-144);
		expect(placeOffset(BOXES, 1, 1)).toBe(0);
	});

	it('measures a row’s height with the gap under it, or above it for the last row', () => {
		expect(rowStep(BOXES, 0)).toBe(48);
		expect(rowStep(BOXES, 3)).toBe(48);
		expect(rowStep([{ top: 0, height: 40 }], 0)).toBe(40);
		expect(rowStep(BOXES, 9)).toBe(0);
	});
});

describe('keyboardTarget', () => {
	it('moves one place with the arrows and to either end with Home and End', () => {
		expect(keyboardTarget('ArrowUp', 2, 4)).toBe(1);
		expect(keyboardTarget('ArrowDown', 2, 4)).toBe(3);
		expect(keyboardTarget('Home', 2, 4)).toBe(0);
		expect(keyboardTarget('End', 0, 4)).toBe(3);
	});

	it('never moves past either end, and ignores every other key', () => {
		expect(keyboardTarget('ArrowUp', 0, 4)).toBe(0);
		expect(keyboardTarget('ArrowDown', 3, 4)).toBe(3);
		expect(keyboardTarget('a', 1, 4)).toBeNull();
	});
});

describe('the screen reader’s messages', () => {
	it('count places from 1, the way the list shows them', () => {
		expect(pickedUpMessage('Brazil', 1, 5)).toBe(
			'Brazil picked up, place 2 of 5. Use the arrow keys to move it, Space to drop it and Escape to cancel.'
		);
		expect(movedMessage('Brazil', 2, 5)).toBe('Brazil, place 3 of 5.');
		expect(droppedMessage('Brazil', 1, 3, 5)).toBe('Brazil dropped at place 4 of 5.');
		expect(droppedMessage('Brazil', 1, 1, 5)).toBe('Brazil dropped, still place 2 of 5.');
		expect(cancelledMessage('Brazil', 1)).toBe('Brazil put back at place 2.');
	});
});

describe('positionsAfterDrop', () => {
	// Positions with a gap in them, the way a list looks after a row was deleted.
	const ROWS = [
		{ id: 'a', position: 3 },
		{ id: 'b', position: 4 },
		{ id: 'c', position: 7 },
		{ id: 'd', position: 8 }
	];

	it('numbers the rows again from the first position and returns only those that change', () => {
		expect(positionsAfterDrop(ROWS, 'a', 2)).toEqual([
			{ id: 'b', position: 3 },
			{ id: 'c', position: 4 },
			{ id: 'a', position: 5 },
			{ id: 'd', position: 6 }
		]);
		expect(positionsAfterDrop(ROWS, 'b', 0)).toEqual([
			{ id: 'b', position: 3 },
			{ id: 'a', position: 4 },
			{ id: 'c', position: 5 },
			{ id: 'd', position: 6 }
		]);
	});

	it('leaves rows that keep their number out', () => {
		const numbered = [
			{ id: 'a', position: 1 },
			{ id: 'b', position: 2 },
			{ id: 'c', position: 3 }
		];

		expect(positionsAfterDrop(numbered, 'c', 1)).toEqual([
			{ id: 'c', position: 2 },
			{ id: 'b', position: 3 }
		]);
		expect(positionsAfterDrop(numbered, 'b', 1)).toEqual([]);
	});

	it('puts a row dropped past the end last, and changes nothing for a row not in the list', () => {
		expect(positionsAfterDrop(ROWS, 'c', 40)).toEqual([
			{ id: 'd', position: 5 },
			{ id: 'c', position: 6 }
		]);
		expect(positionsAfterDrop(ROWS, 'z', 1)).toEqual([]);
	});
});

describe('readDroppedPlace', () => {
	it('reads a place counting from 1 into an index counting from 0', () => {
		expect(readDroppedPlace('1')).toBe(0);
		expect(readDroppedPlace(' 4 ')).toBe(3);
	});

	it('refuses anything that is not a whole number of at least 1', () => {
		expect(readDroppedPlace('0')).toBeNull();
		expect(readDroppedPlace('-2')).toBeNull();
		expect(readDroppedPlace('2.5')).toBeNull();
		expect(readDroppedPlace('two')).toBeNull();
		expect(readDroppedPlace('')).toBeNull();
		expect(readDroppedPlace(null)).toBeNull();
	});
});

describe('reorderHint', () => {
	it('names the kind of row being dragged', () => {
		expect(reorderHint('fee')).toBe(
			'Drag to reorder, or press Space to pick the fee up, the arrow keys to move it and Space to drop it.'
		);
	});
});

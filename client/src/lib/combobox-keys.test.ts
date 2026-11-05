import { describe, expect, it } from 'vitest';
import type { SeatOption } from '$lib/seat-search';
import { comboboxKeyAction, highlightedIndex } from './combobox-keys';

const OPEN = { isOpen: true, query: 'fra', isSpaceForTheClock: true };
const CLOSED = { ...OPEN, isOpen: false };

describe('comboboxKeyAction', () => {
	it('moves the highlight with ↓ and ↑ while the list is open', () => {
		expect(comboboxKeyAction('ArrowDown', OPEN)).toBe('highlightNext');
		expect(comboboxKeyAction('ArrowUp', OPEN)).toBe('highlightPrevious');
	});

	it('chooses the highlighted option with Enter while the list is open', () => {
		expect(comboboxKeyAction('Enter', OPEN)).toBe('choose');
	});

	it('opens a closed list with ↓, ↑ or Enter', () => {
		expect(comboboxKeyAction('ArrowDown', CLOSED)).toBe('open');
		expect(comboboxKeyAction('ArrowUp', CLOSED)).toBe('open');
		expect(comboboxKeyAction('Enter', CLOSED)).toBe('open');
	});

	it('closes the list on the first Escape and leaves the box on the second', () => {
		expect(comboboxKeyAction('Escape', OPEN)).toBe('close');
		expect(comboboxKeyAction('Escape', CLOSED)).toBe('leave');
	});

	it("gives Space in an empty add box to the room's clock", () => {
		expect(comboboxKeyAction(' ', { ...OPEN, query: '' })).toBe('pressClock');
	});

	it('types a space once something is typed, or in a box whose Space is not the clock', () => {
		expect(comboboxKeyAction(' ', OPEN)).toBeNull();
		expect(comboboxKeyAction(' ', { ...OPEN, query: '', isSpaceForTheClock: false })).toBeNull();
	});

	it('leaves every other key to the browser', () => {
		expect(comboboxKeyAction('f', OPEN)).toBeNull();
		expect(comboboxKeyAction('Tab', OPEN)).toBeNull();
	});
});

describe('highlightedIndex', () => {
	/** An option of the box, which can be chosen or not. */
	function option(value: string, isChoosable: boolean): SeatOption {
		return {
			kind: 'seat',
			seat: null,
			label: value,
			value,
			mark: null,
			isChoosable,
			marksPresent: false
		};
	}

	const OPTIONS = [option('china', false), option('france', true), option('kenya', true)];

	it('is the first option that can be chosen until the chair moves it', () => {
		expect(highlightedIndex(OPTIONS, null)).toBe(1);
	});

	it('is where ↑ and ↓ moved it', () => {
		expect(highlightedIndex(OPTIONS, 2)).toBe(2);
	});

	it('goes back to the first when the moved-to option can no longer be chosen', () => {
		expect(highlightedIndex(OPTIONS, 0)).toBe(1);
		expect(highlightedIndex(OPTIONS, 7)).toBe(1);
	});

	it('is -1 when nothing can be chosen', () => {
		expect(highlightedIndex([option('china', false)], null)).toBe(-1);
	});
});

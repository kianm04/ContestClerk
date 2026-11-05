import { describe, expect, it } from 'vitest';
import {
	pressedAction,
	pressedField,
	rowsAfterChanges,
	rowsAfterPresses,
	type RowPress
} from './row-changes';

type Row = { id: string; status: string };

const ROWS: Row[] = [
	{ id: 'a', status: 'submitted' },
	{ id: 'b', status: 'submitted' }
];

/** A kept press whose note is `expected`. */
function press(expected: RowPress<Row>['expected'], id = 1): RowPress<Row> {
	return { id, formData: new FormData(), action: new URL('http://localhost/?/x'), expected };
}

describe('rowsAfterPresses', () => {
	it('lays every press on the rows, oldest first, so the last one wins', () => {
		const shown = rowsAfterPresses(ROWS, [
			press([{ id: 'a', changes: { status: 'accepted' } }], 1),
			press([{ id: 'a', changes: { status: 'rejected' } }], 2)
		]);

		expect(shown[0].status).toBe('rejected');
		expect(shown[1].status).toBe('submitted');
	});

	it('leaves the rows alone for a press that said nothing about them', () => {
		expect(rowsAfterPresses(ROWS, [press(null)])).toEqual(ROWS);
	});

	it('changes nothing when laid over rows that already hold the change', () => {
		const change = press([{ id: 'b', isDeleted: true }]);
		const shown = rowsAfterPresses(ROWS, [change]);

		expect(rowsAfterPresses(shown, [change])).toEqual(shown);
	});
});

describe('rowsAfterChanges', () => {
	it('changes the named rows, removes a deleted one and leaves the rest alone', () => {
		const shown = rowsAfterChanges(ROWS, [
			{ id: 'a', changes: { status: 'accepted' } },
			{ id: 'b', isDeleted: true }
		]);

		expect(shown).toEqual([{ id: 'a', status: 'accepted' }]);
	});
});

describe('pressedAction', () => {
	it('reads the action after a filter in the address', () => {
		expect(pressedAction(new URL('http://localhost/manage?status=submitted&/decide'))).toBe(
			'?/decide'
		);
		expect(pressedAction(new URL('http://localhost/manage?/decide'))).toBe('?/decide');
	});
});

describe('pressedField', () => {
	it('gives an empty string for a field that was not sent', () => {
		const formData = new FormData();
		formData.set('seatId', 'seat-1');

		expect(pressedField(formData, 'seatId')).toBe('seat-1');
		expect(pressedField(formData, 'missing')).toBe('');
	});
});

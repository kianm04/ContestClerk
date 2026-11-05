import { describe, expect, it } from 'vitest';
import { describeSeatFailure, expectSeatRowChange, type SeatPress } from './seat-presses';

/** A press of `action` naming `seatId`, the way `SeatRow`'s form sends it. */
function pressInput(action: string, seatId: string) {
	const formData = new FormData();
	formData.set('seatId', seatId);

	return {
		action: new URL(`http://localhost/manage/riverside-mun-2027/committees/comm-1${action}`),
		formData
	};
}

describe('expectSeatRowChange', () => {
	it('hides the seat named in the form', () => {
		expect(expectSeatRowChange(pressInput('?/hideSeat', 'seat-1'))).toEqual([
			{ id: 'seat-1', changes: { isAvailable: false } }
		]);
	});

	it('shows the seat named in the form', () => {
		expect(expectSeatRowChange(pressInput('?/showSeat', 'seat-1'))).toEqual([
			{ id: 'seat-1', changes: { isAvailable: true } }
		]);
	});

	it('takes the seat off the list', () => {
		expect(expectSeatRowChange(pressInput('?/deleteSeat', 'seat-1'))).toEqual([
			{ id: 'seat-1', isDeleted: true }
		]);
	});

	it('answers null for a press this form does not predict, such as moving a seat', () => {
		expect(expectSeatRowChange(pressInput('?/moveSeat&direction=up', 'seat-1'))).toBeNull();
	});
});

describe('describeSeatFailure', () => {
	/** A press whose action is all `describeSeatFailure` reads. */
	function pressOf(action: string): SeatPress {
		return {
			id: 1,
			formData: new FormData(),
			action: new URL(`http://localhost/manage/riverside-mun-2027/committees/comm-1${action}`),
			expected: null
		};
	}

	it('names what did not happen for each action', () => {
		expect(describeSeatFailure(pressOf('?/hideSeat'))).toBe('The seat was not hidden.');
		expect(describeSeatFailure(pressOf('?/showSeat'))).toBe('The seat was not shown again.');
		expect(describeSeatFailure(pressOf('?/deleteSeat'))).toBe('The seat was not deleted.');
	});
});

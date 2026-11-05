import { describe, expect, it } from 'vitest';
import {
	OPENING_ROOM,
	ROOM_SPEAKER_CODES,
	ROOM_SPEAKING_TIME_SECONDS,
	clockPercent,
	floorCountryCode,
	tickRoom,
	waitingCountryCodes
} from './landing-room';

describe('tickRoom', () => {
	it('takes one second off the clock', () => {
		expect(tickRoom({ floorIndex: 0, secondsLeft: 24 })).toEqual({
			floorIndex: 0,
			secondsLeft: 23
		});
	});

	it('lets the clock reach 0:00 before the floor passes', () => {
		expect(tickRoom({ floorIndex: 0, secondsLeft: 1 })).toEqual({ floorIndex: 0, secondsLeft: 0 });
	});

	it('passes the floor to the next country with a full speaking time once the clock is at 0:00', () => {
		expect(tickRoom({ floorIndex: 0, secondsLeft: 0 })).toEqual({
			floorIndex: 1,
			secondsLeft: ROOM_SPEAKING_TIME_SECONDS
		});
	});

	it('goes back to the first country after the last one', () => {
		const lastIndex = ROOM_SPEAKER_CODES.length - 1;

		expect(tickRoom({ floorIndex: lastIndex, secondsLeft: 0 }).floorIndex).toBe(0);
	});
});

describe('floorCountryCode', () => {
	it('names the country speaking', () => {
		expect(floorCountryCode(OPENING_ROOM)).toBe('KE');
		expect(floorCountryCode({ floorIndex: 2, secondsLeft: 10 })).toBe('JP');
	});
});

describe('waitingCountryCodes', () => {
	it('lists everybody else in order, starting after the floor', () => {
		expect(waitingCountryCodes({ floorIndex: 0, secondsLeft: 24 })).toEqual([
			'BR',
			'JP',
			'NO',
			'IN',
			'CL'
		]);
	});

	it('wraps round to the start of the list', () => {
		expect(waitingCountryCodes({ floorIndex: 4, secondsLeft: 24 })).toEqual([
			'CL',
			'KE',
			'BR',
			'JP',
			'NO'
		]);
	});
});

describe('clockPercent', () => {
	it('is full at the start of a speech and empty at its end', () => {
		expect(clockPercent({ floorIndex: 0, secondsLeft: ROOM_SPEAKING_TIME_SECONDS })).toBe(100);
		expect(clockPercent({ floorIndex: 0, secondsLeft: 0 })).toBe(0);
	});

	it('rounds to whole percent', () => {
		// 24 of 90 seconds is 26.67%.
		expect(clockPercent(OPENING_ROOM)).toBe(27);
	});
});

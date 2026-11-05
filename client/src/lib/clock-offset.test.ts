import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	PRESSED_AT_TOLERANCE_MS,
	clockOffsetSample,
	createClockOffsetGuess,
	pressedMoment,
	serverNow
} from './clock-offset';

const SERVER_TIME = new Date('2026-09-26T10:00:00.000Z');

afterEach(() => {
	vi.useRealTimers();
});

describe('clockOffsetSample', () => {
	it('is positive when the server is ahead of the browser', () => {
		const browserNow = new Date('2026-09-26T09:59:57.000Z');

		expect(clockOffsetSample(SERVER_TIME.toISOString(), browserNow)).toBe(3_000);
	});

	it('is negative when the browser is ahead of the server', () => {
		const browserNow = new Date('2026-09-26T10:00:05.250Z');

		expect(clockOffsetSample(SERVER_TIME.toISOString(), browserNow)).toBe(-5_250);
	});
});

describe('createClockOffsetGuess', () => {
	it('answers the first reading it is given', () => {
		const guess = createClockOffsetGuess();

		expect(guess.learn(-5_300)).toBe(-5_300);
	});

	it('keeps the highest reading, which travelled for the shortest time', () => {
		const guess = createClockOffsetGuess();

		guess.learn(-5_300);
		expect(guess.learn(-5_040)).toBe(-5_040);
		// A slower answer later on does not move the guess back.
		expect(guess.learn(-5_600)).toBe(-5_040);
	});

	it('keeps a separate guess for each page that makes one', () => {
		const first = createClockOffsetGuess();
		const second = createClockOffsetGuess();

		first.learn(2_000);

		expect(second.learn(-1_000)).toBe(-1_000);
	});
});

describe('serverNow', () => {
	it('moves the browser clock by the guess', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-09-26T10:00:05.000Z'));

		expect(serverNow(-5_000).toISOString()).toBe('2026-09-26T10:00:00.000Z');
	});
});

describe('pressedMoment', () => {
	it('believes a press from a moment ago', () => {
		const pressedAt = '2026-09-26T09:59:59.200Z';

		expect(pressedMoment(pressedAt, SERVER_TIME).toISOString()).toBe(pressedAt);
	});

	it('uses the server time when the press carries no moment, as without JavaScript', () => {
		expect(pressedMoment(null, SERVER_TIME)).toBe(SERVER_TIME);
	});

	it('does not believe a moment that is not a time', () => {
		expect(pressedMoment('soon', SERVER_TIME)).toBe(SERVER_TIME);
	});

	it('does not believe a press from after the server read it', () => {
		expect(pressedMoment('2026-09-26T10:00:00.500Z', SERVER_TIME)).toBe(SERVER_TIME);
	});

	it('believes a press right up to the tolerance, and not beyond it', () => {
		const atTolerance = new Date(SERVER_TIME.getTime() - PRESSED_AT_TOLERANCE_MS);
		const beyondTolerance = new Date(atTolerance.getTime() - 1);

		expect(pressedMoment(atTolerance.toISOString(), SERVER_TIME)).toEqual(atTolerance);
		expect(pressedMoment(beyondTolerance.toISOString(), SERVER_TIME)).toBe(SERVER_TIME);
	});

	it('does not believe a file sent in place of a moment', () => {
		const file = new File(['2026-09-26T09:59:59.200Z'], 'moment.txt');

		expect(pressedMoment(file, SERVER_TIME)).toBe(SERVER_TIME);
	});
});

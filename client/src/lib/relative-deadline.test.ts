import { describe, expect, it } from 'vitest';
import {
	CLOSE_OFFSET_OPTIONS,
	DEFAULT_CLOSE_OFFSET_DAYS,
	isDeadlinePast,
	nearestFutureOffset,
	readCloseOffsetDays,
	relativeDeadlineInstant,
	relativeDeadlineLabel
} from './relative-deadline';

describe('relativeDeadlineLabel', () => {
	it('counts whole weeks in weeks and the rest in days', () => {
		expect(relativeDeadlineLabel(-14)).toBe('2 weeks before conference');
		expect(relativeDeadlineLabel(-7)).toBe('1 week before conference');
		expect(relativeDeadlineLabel(-10)).toBe('10 days before conference');
		expect(relativeDeadlineLabel(-1)).toBe('1 day before conference');
		expect(relativeDeadlineLabel(0)).toBe('the day the conference starts');
	});

	it('offers the default among its options', () => {
		expect(CLOSE_OFFSET_OPTIONS.map((option) => option.value)).toContain(
			String(DEFAULT_CLOSE_OFFSET_DAYS)
		);
	});
});

describe('relativeDeadlineInstant', () => {
	it('closes at 23:59 on the conference clock, the offset before the first day', () => {
		// 2 April 2027 23:59 in Amsterdam (summer time, UTC+2) is 21:59 UTC.
		expect(relativeDeadlineInstant('2027-04-16', -14, 'Europe/Amsterdam')).toBe(
			'2027-04-02T21:59:00.000Z'
		);
	});

	it('has no answer without a start date', () => {
		expect(relativeDeadlineInstant('', -14, 'Europe/Amsterdam')).toBeNull();
	});
});

describe('isDeadlinePast', () => {
	it('compares with the moment given, and never calls a missing deadline past', () => {
		const now = new Date('2027-04-03T00:00:00Z');

		expect(isDeadlinePast('2027-04-02T21:59:00.000Z', now)).toBe(true);
		expect(isDeadlinePast('2027-04-03T21:59:00.000Z', now)).toBe(false);
		expect(isDeadlinePast(null, now)).toBe(false);
	});
});

describe('nearestFutureOffset', () => {
	it('keeps the asked-for offset while it lies ahead', () => {
		const now = new Date('2026-10-03T12:00:00Z');

		expect(nearestFutureOffset('2027-04-16', -14, 'Europe/Amsterdam', now)).toBe(-14);
	});

	it('falls back to a shorter offset when the asked-for one has gone', () => {
		const now = new Date('2027-04-10T12:00:00Z');

		expect(nearestFutureOffset('2027-04-16', -14, 'Europe/Amsterdam', now)).toBe(-3);
	});

	it('answers null once even the day before has gone', () => {
		const now = new Date('2027-04-16T08:00:00Z');

		expect(nearestFutureOffset('2027-04-16', -14, 'Europe/Amsterdam', now)).toBeNull();
	});
});

describe('readCloseOffsetDays', () => {
	it('reads a whole non-positive number and falls back otherwise', () => {
		expect(readCloseOffsetDays('-21')).toBe(-21);
		expect(readCloseOffsetDays('0')).toBe(0);
		expect(readCloseOffsetDays('7')).toBe(DEFAULT_CLOSE_OFFSET_DAYS);
		expect(readCloseOffsetDays('soon')).toBe(DEFAULT_CLOSE_OFFSET_DAYS);
	});
});

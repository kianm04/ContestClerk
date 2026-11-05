import { describe, expect, it } from 'vitest';
import {
	committeeEditorSummary,
	isSeatFree,
	seatCountsLine,
	seatHolder,
	seatKindLabel
} from './committee-editor';
import type { ManagedSeat } from './committees';

/** A free, open country seat, which each test changes the one field it is about. */
const FREE_SEAT: ManagedSeat = {
	id: 'seat-1',
	name: 'Brazil',
	kind: 'country',
	countryCode: 'BR',
	position: 1,
	isAvailable: true,
	isFilled: false,
	isReserved: false,
	holderName: null,
	delegationName: null
};

describe('committeeEditorSummary', () => {
	it('names the short name, the seats and the chairs', () => {
		expect(committeeEditorSummary({ abbreviation: 'HRC' }, 4, 1)).toBe('HRC · 4 seats · 1 chair');
	});

	it('starts at the seats when the committee has no short name', () => {
		expect(committeeEditorSummary({ abbreviation: null }, 1, 0)).toBe('1 seat · 0 chairs');
	});
});

describe('seatCountsLine', () => {
	it('counts the seats and the filled ones', () => {
		expect(seatCountsLine({ total: 15, filled: 12 })).toBe('15 seats · 12 filled');
	});

	it('says one seat in the singular', () => {
		expect(seatCountsLine({ total: 1, filled: 0 })).toBe('1 seat · 0 filled');
	});
});

describe('seatKindLabel', () => {
	it('gives each kind its word', () => {
		expect(seatKindLabel('country')).toBe('Country');
		expect(seatKindLabel('character')).toBe('Character');
		expect(seatKindLabel('observer')).toBe('Observer');
		expect(seatKindLabel('other')).toBe('Other');
	});
});

describe('isSeatFree', () => {
	it('is true for a seat nobody holds', () => {
		expect(isSeatFree(FREE_SEAT)).toBe(true);
	});

	it('is false for a filled or a reserved seat', () => {
		expect(isSeatFree({ ...FREE_SEAT, isFilled: true })).toBe(false);
		expect(isSeatFree({ ...FREE_SEAT, isReserved: true })).toBe(false);
	});
});

describe('seatHolder', () => {
	it('says a free seat is free', () => {
		expect(seatHolder(FREE_SEAT)).toBe('Free');
	});

	it('says a hidden seat is hidden', () => {
		expect(seatHolder({ ...FREE_SEAT, isAvailable: false })).toBe('Hidden');
	});

	it('names the delegate in a filled seat', () => {
		expect(seatHolder({ ...FREE_SEAT, isFilled: true, holderName: 'Ana Dupont' })).toBe(
			'Ana Dupont'
		);
	});

	it('still says a seat is taken when the delegate has no name to show', () => {
		expect(seatHolder({ ...FREE_SEAT, isFilled: true })).toBe('A delegate');
	});

	it('names the delegation a reserved seat is held for', () => {
		expect(seatHolder({ ...FREE_SEAT, isReserved: true, delegationName: 'Lycée Molière' })).toBe(
			'Reserved for Lycée Molière'
		);
		expect(seatHolder({ ...FREE_SEAT, isReserved: true })).toBe('Reserved for a delegation');
	});
});

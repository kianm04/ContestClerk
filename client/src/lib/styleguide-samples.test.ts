import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	SAMPLE_SORT_ASCENDING,
	SAMPLE_SORT_DESCENDING,
	samplePageHref,
	sampleSortHref,
	sampleTimerEndsAt
} from './styleguide-samples';

describe('sampleSortHref', () => {
	it('turns the column that is already sorted round', () => {
		expect(sampleSortHref(SAMPLE_SORT_ASCENDING, 'name')).toBe(
			'/styleguide?sort=name&direction=desc'
		);
	});

	it('starts any other column at A to Z', () => {
		expect(sampleSortHref(SAMPLE_SORT_ASCENDING, 'status')).toBe('/styleguide?sort=status');
	});

	it('goes back to A to Z on a column that is sorted the other way', () => {
		expect(sampleSortHref(SAMPLE_SORT_DESCENDING, 'status')).toBe('/styleguide?sort=status');
	});
});

describe('samplePageHref', () => {
	it('leaves the first page out of the address', () => {
		expect(samplePageHref(1)).toBe('/styleguide');
	});

	it('names every other page', () => {
		expect(samplePageHref(2)).toBe('/styleguide?page=2');
	});
});

describe('sampleTimerEndsAt', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('is the moment that many seconds from now, forwards or back', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-09-23T10:00:00.000Z'));

		expect(sampleTimerEndsAt(287)).toBe('2026-09-23T10:04:47.000Z');
		expect(sampleTimerEndsAt(-60)).toBe('2026-09-23T09:59:00.000Z');
	});
});

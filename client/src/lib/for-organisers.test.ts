import { describe, expect, it } from 'vitest';
import {
	AFTERWARDS_ROWS,
	APPLICATIONS_ROWS,
	BEFORE_ROWS,
	DAYS_ROWS,
	FEES_ROWS,
	SCHOOL_STEPS,
	SETUP_ROWS
} from './for-organisers';

// The words on `/for-organisers`. Each list is drawn with its row titles as the
// `{#each}` keys, so two rows with the same title in one list would confuse
// Svelte; the words themselves are checked against the design by eye.

const ROW_LISTS = {
	setup: SETUP_ROWS,
	applications: APPLICATIONS_ROWS,
	fees: FEES_ROWS,
	before: BEFORE_ROWS,
	days: DAYS_ROWS,
	afterwards: AFTERWARDS_ROWS
};

describe('the rows of each section', () => {
	it.each(Object.entries(ROW_LISTS))('gives every %s row its own title', (_name, rows) => {
		const titles = new Set(rows.map((row) => row.title));

		expect(titles.size).toBe(rows.length);
	});

	it.each(Object.entries(ROW_LISTS))('gives every %s row an icon and a detail', (_name, rows) => {
		for (const row of rows) {
			expect(row.icon).toBeDefined();
			expect(row.detail).not.toBe('');
		}
	});

	it('lists the six things a chair does in the room', () => {
		expect(DAYS_ROWS).toHaveLength(6);
	});
});

describe('SCHOOL_STEPS', () => {
	it('puts the three steps in the order a school takes them', () => {
		expect(SCHOOL_STEPS.map((step) => step.title)).toEqual([
			'Registers a delegation',
			'Shares a join code',
			'Assigns its seats'
		]);
	});
});

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { GslEntry } from '$lib/gsl-floor';
import LiveList from './LiveList.svelte';

/** A waiting entry for the seat `name`, whose flag is `countryCode`'s. */
function waiting(name: string, countryCode: string, position: number): GslEntry {
	const id = `seat-${name.toLowerCase()}`;
	const seat = { id, name, countryCode };

	return { id: `entry-${id}`, position, status: 'waiting', spokeSeconds: null, seat };
}

const ENTRIES = [waiting('Kenya', 'KE', 1), waiting('Brazil', 'BR', 2), waiting('Japan', 'JP', 3)];

describe('LiveList', () => {
	it("lists every waiting seat in order, marking the reader's own and a seat marked absent", () => {
		const { container } = render(LiveList, {
			props: {
				title: 'Speakers’ list',
				entries: ENTRIES,
				mySeatId: 'seat-brazil',
				absentSeatIds: ['seat-japan']
			}
		});
		const rows = screen.getAllByRole('listitem');

		expect(screen.getByRole('region', { name: 'Speakers’ list' })).toBeTruthy();
		expect(rows.map((row) => row.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
			'1 Kenya',
			'2 Brazil You',
			'3 Japan absent'
		]);
		expect(rows[1].className).toContain('font-semibold');
		// Read only: no drag handle and no row menu.
		expect(container.querySelectorAll('button, summary, form')).toHaveLength(0);
	});

	it('is not drawn when nobody waits', () => {
		const { container } = render(LiveList, {
			props: { title: 'Caucus speakers', entries: [], mySeatId: null, absentSeatIds: [] }
		});

		expect(container.textContent?.trim()).toBe('');
	});
});

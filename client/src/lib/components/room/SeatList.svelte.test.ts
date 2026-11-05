import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import SeatList from './SeatList.svelte';
import type { RoomSeat } from '$lib/committee-room';

const SEATS: RoomSeat[] = [
	{ id: 'seat-fr', name: 'France', countryCode: 'FR' },
	{ id: 'seat-br', name: 'Brazil', countryCode: 'BR' },
	{ id: 'seat-ke', name: 'Kenya', countryCode: 'KE' }
];

describe('SeatList', () => {
	it('lists every seat with its flag, without links or dots when given neither', () => {
		render(SeatList, { props: { seats: SEATS } });

		expect(screen.getAllByRole('listitem')).toHaveLength(3);
		expect(screen.getByAltText('Brazil')).toBeTruthy();
		expect(screen.queryByRole('link')).toBeNull();
		expect(screen.queryByText('Present')).toBeNull();
	});

	it('gives each seat the roll call answer in words', () => {
		const attendance = { 'seat-fr': 'present', 'seat-br': 'present_and_voting' } as const;
		render(SeatList, { props: { seats: SEATS, attendance } });

		expect(screen.getByText('Present')).toBeTruthy();
		expect(screen.getByText('Present and voting')).toBeTruthy();
		expect(screen.getByText('Not recorded')).toBeTruthy();
	});

	it('makes every row a link and marks the chosen seat', () => {
		render(SeatList, {
			props: {
				seats: SEATS,
				hrefForSeat: (seat: RoomSeat) => `/conferences/${seat.id}` as const,
				selectedSeatId: 'seat-br'
			}
		});

		const brazil = screen.getByRole('link', { name: 'Brazil Brazil' });
		expect(brazil.getAttribute('href')).toBe('/conferences/seat-br');
		expect(brazil.getAttribute('aria-current')).toBe('true');
		expect(screen.getByRole('link', { name: 'France France' }).hasAttribute('aria-current')).toBe(
			false
		);
	});

	it('shows a count at the end of each row, 0 for a seat the counts leave out', () => {
		render(SeatList, {
			props: { seats: SEATS, counts: { 'seat-fr': 3 }, countNoun: 'notes' }
		});

		const rows = screen.getAllByRole('listitem');

		expect(rows[0].textContent).toContain('3 notes');
		expect(rows[1].textContent).toContain('0 notes');
	});
});

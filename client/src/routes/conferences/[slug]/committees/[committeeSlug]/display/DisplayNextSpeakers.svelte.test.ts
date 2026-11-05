import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { RoomSeat } from '$lib/committee-room';
import DisplayNextSpeakers from './DisplayNextSpeakers.svelte';

/** Seats named `names`, as `nextSeats` hands them on. */
function seatsNamed(names: string[]): RoomSeat[] {
	return names.map((name) => ({ id: name, name, countryCode: null }));
}

describe('DisplayNextSpeakers', () => {
	it('names who speaks next, joined by dots', () => {
		render(DisplayNextSpeakers, { props: { seats: seatsNamed(['France', 'Japan']) } });

		expect(screen.getByText('Next')).toBeTruthy();
		expect(screen.getByText('France · Japan')).toBeTruthy();
	});

	it('is not drawn when nobody waits', () => {
		const { container } = render(DisplayNextSpeakers, { props: { seats: [] } });

		expect(container.textContent?.trim()).toBe('');
	});
});

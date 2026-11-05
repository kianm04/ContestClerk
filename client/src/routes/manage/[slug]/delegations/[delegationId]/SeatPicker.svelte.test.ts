import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { SeatGroup } from '$lib/allocation';
import { NO_FREE_SEATS_NOTICE, allocateButtonLabel } from '$lib/delegation-review';
import { manageAllocationUrl } from '$lib/urls';
import SeatPicker from './SeatPicker.svelte';

/** One committee with two free seats, the picker's usual starting point. */
const FREE_SEATS: SeatGroup[] = [
	{
		committeeId: 'committee-unsc',
		committeeLabel: 'UNSC',
		seats: [
			{
				id: 'seat-france',
				committeeId: 'committee-unsc',
				name: 'France',
				countryCode: 'FR',
				isAvailable: true,
				delegationId: null,
				userId: null
			},
			{
				id: 'seat-brazil',
				committeeId: 'committee-unsc',
				name: 'Brazil',
				countryCode: 'BR',
				isAvailable: true,
				delegationId: null,
				userId: null
			}
		]
	}
];

/** A stand-in for the page's instant form, which the picker posts through. */
const onSubmit = vi.fn();

/** The props every test starts from, overriding only what it is about. */
const PROPS = {
	freeSeatsByCommittee: FREE_SEATS,
	selectedSeatIds: [] as string[],
	error: null as string | null,
	decisionNote: '',
	status: 'submitted' as const,
	slug: 'thimun-2027',
	onSubmit
};

describe('SeatPicker', () => {
	it('lists the seats it was given, under their committee', () => {
		render(SeatPicker, { props: PROPS });

		expect(screen.getByText('UNSC')).toBeTruthy();
		expect(screen.getByText('France')).toBeTruthy();
		expect(screen.getByText('Brazil')).toBeTruthy();
	});

	it('posts the checkbox list under "seatIds" to the allocate action', () => {
		const { container } = render(SeatPicker, { props: PROPS });

		const form = container.querySelector('form');
		expect(form?.getAttribute('method')).toBe('post');
		expect(form?.getAttribute('action')).toBe('?/allocate');

		const boxes = container.querySelectorAll('input[name="seatIds"]');
		expect(boxes.length).toBe(2);
	});

	it('comes back with the seats from a refused post already ticked', () => {
		const { container } = render(SeatPicker, {
			props: { ...PROPS, selectedSeatIds: ['seat-france'] }
		});

		const franceBox = container.querySelector(
			'input[name="seatIds"][value="seat-france"]'
		) as HTMLInputElement;
		const brazilBox = container.querySelector(
			'input[name="seatIds"][value="seat-brazil"]'
		) as HTMLInputElement;

		expect(franceBox.checked).toBe(true);
		expect(brazilBox.checked).toBe(false);
	});

	it('shows the counter and the button label for the seats ticked', () => {
		render(SeatPicker, { props: { ...PROPS, selectedSeatIds: ['seat-france', 'seat-brazil'] } });

		expect(screen.getByText('2 selected')).toBeTruthy();
		expect(screen.getByText(allocateButtonLabel(2, 'submitted'))).toBeTruthy();
	});

	it('shows the refusal from the last post', () => {
		render(SeatPicker, { props: { ...PROPS, error: 'Tick at least one seat.' } });

		expect(screen.getByText('Tick at least one seat.')).toBeTruthy();
	});

	it('replaces the picker with a notice and a link to Allocation when nothing is free', () => {
		render(SeatPicker, { props: { ...PROPS, freeSeatsByCommittee: [] } });

		expect(screen.getByText(NO_FREE_SEATS_NOTICE)).toBeTruthy();

		const link = screen.getByRole('link', { name: 'Allocation' });
		expect(link.getAttribute('href')).toBe(manageAllocationUrl('thimun-2027'));
	});
});

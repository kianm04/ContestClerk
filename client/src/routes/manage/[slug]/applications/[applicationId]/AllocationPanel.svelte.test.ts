import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { SeatGroup } from '$lib/allocation';
import AllocationPanel from './AllocationPanel.svelte';

// The page's instant form hands this down for real; a stand-in is enough here
// because these tests only check what is drawn, not what a submit does.
const onSubmit = vi.fn();

/** Two free seats in two committees, the one the applicant asked for first. */
const SEAT_GROUPS: SeatGroup[] = [
	{
		committeeId: 'committee-hrc',
		committeeLabel: 'HRC',
		seats: [
			{
				id: 'seat-france',
				committeeId: 'committee-hrc',
				name: 'France',
				countryCode: 'FR',
				isAvailable: true,
				delegationId: null,
				userId: null
			}
		]
	},
	{
		committeeId: 'committee-unsc',
		committeeLabel: 'UNSC',
		seats: [
			{
				id: 'seat-chad',
				committeeId: 'committee-unsc',
				name: 'Chad',
				countryCode: 'TD',
				isAvailable: true,
				delegationId: null,
				userId: null
			}
		]
	}
];

describe('AllocationPanel', () => {
	it('offers every free seat, preferred committees first, and posts to accept', () => {
		const { container } = render(AllocationPanel, {
			props: { seatGroups: SEAT_GROUPS, seatId: '', error: null, formaction: '?/accept', onSubmit }
		});

		const optionLabels = Array.from(container.querySelectorAll('option'))
			.map((option) => option.textContent?.trim())
			.filter((label) => label !== 'Choose a seat');

		expect(optionLabels).toEqual(['HRC · France', 'UNSC · Chad']);
		expect(container.querySelector('form[action="?/accept"]')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Accept and allocate' })).toBeTruthy();
	});

	it('keeps the seat chosen when the last accept was refused, and says why', () => {
		render(AllocationPanel, {
			props: {
				seatGroups: SEAT_GROUPS,
				seatId: 'seat-chad',
				error: 'That seat was just taken. Pick another.',
				formaction: '?/accept',
				onSubmit
			}
		});

		const select = screen.getByLabelText('Seat', { exact: false }) as HTMLSelectElement;

		expect(select.value).toBe('seat-chad');
		expect(screen.getByText('That seat was just taken. Pick another.')).toBeTruthy();
	});

	it('says every seat is taken instead of offering an empty list', () => {
		render(AllocationPanel, {
			props: { seatGroups: [], seatId: '', error: null, formaction: '?/accept', onSubmit }
		});

		expect(screen.getByText(/Every seat is taken/)).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Accept and allocate' })).toBeNull();
	});
});

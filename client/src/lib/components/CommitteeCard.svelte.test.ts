import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { Committee } from '$lib/committees';
import CommitteeCard from './CommitteeCard.svelte';

const committee: Committee = {
	id: '22222222-2222-2222-2222-222222222222',
	slug: 'unsc',
	name: 'United Nations Security Council',
	abbreviation: 'UNSC',
	description: null,
	topics: ['Climate finance', 'Peacekeeping mandates'],
	level: 'advanced',
	room: 'Committee Room 1'
};

describe('CommitteeCard', () => {
	it('leads with the short name and keeps the full one underneath', () => {
		render(CommitteeCard, { props: { committee } });

		expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('UNSC');
		expect(screen.getByText('United Nations Security Council')).toBeTruthy();
	});

	it('leads with the full name when there is no short one', () => {
		const withoutAbbreviation = { ...committee, abbreviation: null };

		render(CommitteeCard, { props: { committee: withoutAbbreviation } });

		expect(screen.getByRole('heading', { level: 3 }).textContent).toBe(
			'United Nations Security Council'
		);
	});

	it('lists every topic', () => {
		render(CommitteeCard, { props: { committee } });

		expect(screen.getByText('Climate finance')).toBeTruthy();
		expect(screen.getByText('Peacekeeping mandates')).toBeTruthy();
	});

	it('shows the level in the words the interface uses for it', () => {
		render(CommitteeCard, { props: { committee } });

		expect(screen.getByText('Advanced')).toBeTruthy();
	});

	it('is a plain box with no link when there is no href', () => {
		const { container } = render(CommitteeCard, { props: { committee } });

		expect(container.querySelector('a')).toBeNull();
	});

	it('becomes a link to the committee when given an href', () => {
		render(CommitteeCard, {
			props: { committee, href: '/conferences/thimun-2027/committees/unsc' }
		});

		expect(screen.getByRole('link').getAttribute('href')).toBe(
			'/conferences/thimun-2027/committees/unsc'
		);
	});

	it('says how many seats are taken only when it has been told', () => {
		const withoutSeats = render(CommitteeCard, { props: { committee } });

		expect(withoutSeats.container.textContent).not.toContain('seats taken');
		withoutSeats.unmount();

		render(CommitteeCard, { props: { committee, seatSummary: { taken: 12, total: 15 } } });

		expect(screen.getByText('12 of 15 seats taken')).toBeTruthy();
	});
});

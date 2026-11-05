import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Timeline from './Timeline.svelte';

const items = [
	{ time: '09:00 – 10:00', title: 'Opening ceremony', location: 'Main hall' },
	{ time: '10:30', title: 'Committee session I', subtitle: 'UNSC' }
];

describe('Timeline', () => {
	it('shows the time and the title of every moment', () => {
		render(Timeline, { props: { items } });

		expect(screen.getByText('09:00 – 10:00')).toBeTruthy();
		expect(screen.getByText('Opening ceremony')).toBeTruthy();
		expect(screen.getByText('10:30')).toBeTruthy();
		expect(screen.getByText('Committee session I')).toBeTruthy();
	});

	it('shows the subtitle and the place when a moment has them', () => {
		render(Timeline, { props: { items } });

		expect(screen.getByText('Main hall')).toBeTruthy();
		expect(screen.getByText('UNSC')).toBeTruthy();
	});

	it('keeps the moments in the order it was given them', () => {
		const { container } = render(Timeline, { props: { items } });

		const rows = container.querySelectorAll('li');

		expect(rows).toHaveLength(2);
		expect(rows[0].textContent).toContain('Opening ceremony');
	});

	it('shows an empty list as nothing at all', () => {
		const { container } = render(Timeline, { props: { items: [] } });

		expect(container.querySelectorAll('li')).toHaveLength(0);
	});
});

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import DateRange from './DateRange.svelte';

describe('DateRange', () => {
	it('writes the two dates as one range', () => {
		render(DateRange, { props: { startDate: '2026-02-12', endDate: '2026-02-15' } });

		expect(screen.getByText('12 – 15 Feb 2026')).toBeTruthy();
	});

	it('says nothing about a timezone unless it is given one', () => {
		const { container } = render(DateRange, {
			props: { startDate: '2026-02-12', endDate: '2026-02-15' }
		});

		expect(container.textContent).not.toContain('·');
	});

	it('adds the timezone after the dates when the page asks for it', () => {
		const { container } = render(DateRange, {
			props: { startDate: '2026-02-12', endDate: '2026-02-15', timezone: 'Europe/Amsterdam' }
		});

		expect(container.textContent).toContain('Europe/Amsterdam');
	});
});

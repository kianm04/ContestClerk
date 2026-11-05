import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Money from './Money.svelte';

describe('Money', () => {
	it('turns whole cents into the amount a person reads', () => {
		render(Money, { props: { amountCents: 6500, currency: 'EUR' } });

		expect(screen.getByText('€65.00')).toBeTruthy();
	});

	it('shows two decimals even for a round amount', () => {
		render(Money, { props: { amountCents: 5000, currency: 'GBP' } });

		expect(screen.getByText('£50.00')).toBeTruthy();
	});

	it('uses the currency it is given', () => {
		const { container } = render(Money, { props: { amountCents: 1999, currency: 'USD' } });

		expect(container.textContent).toContain('19.99');
	});
});

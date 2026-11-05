import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { committeeUrl, invoiceUrl } from '$lib/urls';
import HeroActions from './HeroActions.svelte';

const PAY_INVOICE = { label: 'Pay invoice', href: invoiceUrl('invoice-1') };
const OPEN_COMMITTEE = {
	label: 'Open committee page',
	href: committeeUrl('amsterdam-open-mun-2027', 'unhrc')
};

describe('HeroActions', () => {
	it('draws the primary as the one filled button, a link to where it leads', () => {
		render(HeroActions, { props: { primary: PAY_INVOICE, secondary: OPEN_COMMITTEE } });

		const button = screen.getByRole('link', { name: 'Pay invoice' });

		expect(button.getAttribute('href')).toBe(PAY_INVOICE.href);
		expect(button.className).toContain('bg-primary');
		// The button fills its box, which is a whole line on a phone and its words' width from `sm` up.
		expect(button.className).toContain('w-full');
		expect(button.parentElement?.className).toContain('sm:w-auto');
	});

	it('draws the secondary as a plain text link beside it, tall enough for a thumb', () => {
		render(HeroActions, { props: { primary: PAY_INVOICE, secondary: OPEN_COMMITTEE } });

		const link = screen.getByRole('link', { name: 'Open committee page' });

		expect(link.getAttribute('href')).toBe(OPEN_COMMITTEE.href);
		expect(link.className).toContain('text-link');
		expect(link.className).toContain('min-h-11');
		expect(link.className).not.toContain('bg-primary');
	});

	it('never draws two buttons', () => {
		const { container } = render(HeroActions, {
			props: { primary: PAY_INVOICE, secondary: OPEN_COMMITTEE }
		});

		expect(container.querySelectorAll('.bg-primary')).toHaveLength(1);
		expect(screen.queryByRole('button')).toBeNull();
	});

	it('draws the button alone when there is nothing to put beside it', () => {
		render(HeroActions, { props: { primary: PAY_INVOICE, secondary: null } });

		expect(screen.getAllByRole('link')).toHaveLength(1);
		expect(screen.getByRole('link').textContent?.trim()).toBe('Pay invoice');
	});
});

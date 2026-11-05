import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { DelegationInvoiceLine } from '$lib/delegation-review';
import DelegationInvoices from './DelegationInvoices.svelte';

/** One invoice written against the delegation, the shape the Invoices card lists. */
const INVOICE: DelegationInvoiceLine = {
	id: 'invoice-0004',
	number: 'thimun-2027-0004',
	description: '10 seats for Lycée Français Delegation',
	amountCents: 6500,
	currency: 'EUR',
	status: 'unpaid'
};

describe('DelegationInvoices', () => {
	it('says there are no invoices yet when the delegation has none', () => {
		render(DelegationInvoices, { props: { invoices: [], conferenceSlug: 'thimun-2027' } });

		expect(screen.getByText('No invoices yet.')).toBeTruthy();
	});

	it("shows an invoice's number, description, amount and status", () => {
		render(DelegationInvoices, { props: { invoices: [INVOICE], conferenceSlug: 'thimun-2027' } });

		expect(screen.getByText('thimun-2027-0004')).toBeTruthy();
		expect(screen.getByText('10 seats for Lycée Français Delegation')).toBeTruthy();
		expect(screen.getByText('€65.00')).toBeTruthy();
		expect(screen.getByText('Unpaid')).toBeTruthy();
	});

	it('links each invoice number to its highlighted row on the fees page', () => {
		render(DelegationInvoices, { props: { invoices: [INVOICE], conferenceSlug: 'thimun-2027' } });

		const link = screen.getByRole('link', { name: 'thimun-2027-0004' });
		expect(link.getAttribute('href')).toBe(
			'/manage/thimun-2027/fees?invoice=invoice-0004#invoices'
		);
	});
});

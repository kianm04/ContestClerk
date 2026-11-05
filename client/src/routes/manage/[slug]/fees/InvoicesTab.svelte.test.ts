import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import {
	EMPTY_INVOICE_LIST_QUERY,
	type InvoiceListQuery,
	type InvoiceTablePage,
	type OrganiserInvoiceRow
} from '$lib/invoices';
import InvoicesTab from './InvoicesTab.svelte';

/*
	Every `ConfirmButton` reads the page's address from `$app/state`, to build
	the confirmation page it falls back to without JavaScript. Outside a running
	app there is no address, so this stand-in gives it one.
*/
vi.mock('$app/state', () => ({
	page: { url: new URL('http://localhost/manage/thimun-2027/fees') }
}));

/** An unpaid invoice for one delegate's seat, the everyday row of the table. */
function invoiceRow(changes: Partial<OrganiserInvoiceRow> = {}): OrganiserInvoiceRow {
	return {
		id: 'invoice-1',
		number: 'ROTTERDAMMUN-2026-0001',
		payerName: 'Maria Kowalska',
		payerUserId: 'user-1',
		delegationName: null,
		seatLabel: 'UNSC · France',
		description: 'Delegate fee · Rotterdam Spring MUN 2026',
		quantity: 1,
		unitAmountCents: 6500,
		amountCents: 6500,
		currency: 'EUR',
		platformFeeCents: 0,
		status: 'unpaid',
		paidAt: null,
		paidMethod: null,
		createdAt: '2026-09-01T09:00:00Z',
		note: null,
		...changes
	};
}

/** The tab's props for a table of `rows`, which the tests change one at a time. */
function tabProps(
	rows: OrganiserInvoiceRow[],
	changes: { table?: Partial<InvoiceTablePage>; query?: Partial<InvoiceListQuery> } = {}
) {
	return {
		table: {
			rows,
			matchingCount: rows.length,
			pageCount: 1,
			highlightedId: null,
			...changes.table
		},
		totals: {
			invoicedCents: 13000,
			paidCents: 6500,
			outstandingCents: 6500,
			outstandingCount: 1,
			platformFeesCents: 120,
			waivedCents: 0
		},
		currency: 'EUR',
		query: { ...EMPTY_INVOICE_LIST_QUERY, ...changes.query },
		hasInvoices: true,
		message: null,
		timezone: 'Europe/Amsterdam',
		conferenceSlug: 'rotterdam-2026',
		canManage: true
	};
}

/*
	jsdom has no `<dialog>` behaviour of its own, so these stand-ins do what a
	browser does, the way `ConfirmButton.svelte.test.ts` explains.
*/
beforeAll(() => {
	HTMLDialogElement.prototype.showModal = function showModal() {
		this.open = true;
	};

	HTMLDialogElement.prototype.close = function close() {
		this.open = false;
	};
});

describe('InvoicesTab', () => {
	it('says how invoices appear before the conference has any', () => {
		render(InvoicesTab, { props: { ...tabProps([]), hasInvoices: false } });

		expect(screen.getByText('No invoices yet.')).toBeTruthy();
		expect(screen.getByText('Invoices are created when you accept delegates.')).toBeTruthy();
	});

	it('says when the filters leave nothing, and keeps the filters to change', () => {
		render(InvoicesTab, { props: tabProps([], { query: { status: 'refunded' } }) });

		expect(screen.getByText('No invoices match these filters.')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Reset' }).getAttribute('href')).toBe(
			'/manage/rotterdam-2026/fees?tab=invoices#invoices'
		);
	});

	it('shows the four totals in the conference currency', () => {
		render(InvoicesTab, { props: tabProps([invoiceRow()]) });

		expect(screen.getByText('Invoiced')).toBeTruthy();
		expect(screen.getByText('€130.00')).toBeTruthy();
		expect(screen.getAllByText('€65.00').length).toBeGreaterThan(1);
		// Nothing waived yet. "Waived" itself is also a choice of the status filter.
		expect(screen.getByText('€0.00')).toBeTruthy();
		expect(screen.getByText('1 invoice')).toBeTruthy();
		expect(screen.getByText('€1.20 platform fees')).toBeTruthy();
	});

	it('gives an unpaid invoice its three buttons, each posting back to the same filters', () => {
		const { container } = render(InvoicesTab, {
			props: tabProps([invoiceRow()], { query: { status: 'unpaid' } })
		});

		const actions = [...container.querySelectorAll('tr form')].map((form) =>
			form.getAttribute('action')
		);
		expect(actions).toEqual([
			'/manage/rotterdam-2026/fees?status=unpaid&/markPaid',
			'/manage/rotterdam-2026/fees?status=unpaid&/waive',
			'/manage/rotterdam-2026/fees?status=unpaid&/void'
		]);
	});

	it('sends the invoice id with every button, and a note box with paying and waiving only', () => {
		const { container } = render(InvoicesTab, { props: tabProps([invoiceRow()]) });

		const forms = [...container.querySelectorAll('tr form')];
		const ids = forms.map((form) =>
			form.querySelector('input[name="invoiceId"]')?.getAttribute('value')
		);
		const hasNote = forms.map((form) => form.querySelector('dialog input[name="note"]') !== null);

		expect(ids).toEqual(['invoice-1', 'invoice-1', 'invoice-1']);
		expect(hasNote).toEqual([true, true, false]);
	});

	it('gives a reader who may not manage invoices no buttons and no actions column', () => {
		const { container } = render(InvoicesTab, {
			props: { ...tabProps([invoiceRow()]), canManage: false }
		});

		expect(container.querySelectorAll('form[action*="markPaid"]')).toHaveLength(0);
		expect(screen.queryByRole('button', { name: /Mark paid/ })).toBeNull();
	});

	it('gives a settled invoice no buttons', () => {
		const paid = invoiceRow({
			status: 'paid',
			paidAt: '2026-09-02T10:00:00Z',
			paidMethod: 'manual'
		});
		const { container } = render(InvoicesTab, { props: tabProps([paid]) });

		expect(container.querySelectorAll('tr form')).toHaveLength(0);
		// The paid day and the method share one line under the status.
		expect(screen.getAllByText(/ · Manual$/).length).toBeGreaterThan(0);
	});

	it('greys a void invoice and shades the one another page linked to', () => {
		const voided = invoiceRow({ id: 'invoice-2', status: 'void' });
		const { container } = render(InvoicesTab, {
			props: tabProps([invoiceRow(), voided], { table: { highlightedId: 'invoice-1' } })
		});

		const rows = container.querySelectorAll('tbody tr');
		expect(rows[0].className).toContain('bg-accent');
		expect(rows[1].className).toContain('opacity-60');
	});

	it('pages through the table without carrying the highlighted invoice along', () => {
		render(InvoicesTab, {
			props: tabProps([invoiceRow()], {
				table: { pageCount: 3 },
				query: { status: 'unpaid', page: 2, invoice: 'invoice-1' }
			})
		});

		expect(screen.getByRole('link', { name: /Next/ }).getAttribute('href')).toBe(
			'/manage/rotterdam-2026/fees?status=unpaid&page=3#invoices'
		);
	});

	it('shows why an action was refused', () => {
		const props = {
			...tabProps([invoiceRow()]),
			message: 'This invoice is paid and cannot be waived.'
		};
		render(InvoicesTab, { props });

		expect(screen.getByText('This invoice is paid and cannot be waived.')).toBeTruthy();
	});
});

import { describe, expect, it } from 'vitest';
import {
	availableInvoiceActions,
	CARD_PAYMENT_NOT_READY,
	EMPTY_INVOICE_LIST_QUERY,
	filterInvoices,
	INVOICES_PAGE_SIZE,
	invoiceActionFlash,
	invoiceActionRefusal,
	invoiceCsvRows,
	invoicePaidMethodLabel,
	invoicesCsvFileName,
	invoiceStatusOptions,
	matchesInvoiceSearch,
	pageOfInvoices,
	parseInvoiceQuery,
	readInvoiceNote,
	type InvoiceListQuery,
	type OrganiserInvoiceRow,
	invoiceDueSentence,
	invoicePaidSentence,
	invoicePaymentSection,
	invoiceStateSentence,
	isInvoiceOverdue,
	NO_PAYMENT_INSTRUCTIONS,
	paymentInstructionsText,
	sortMyInvoices,
	type MyInvoice
} from './invoices';
import { toCsvText } from './csv';

/** The timezone every test reads its dates in, so no test depends on where it runs. */
const AMSTERDAM = 'Europe/Amsterdam';

/** An invoice somebody could really hold, so a test can change one field of it. */
function invoice(changes: Partial<MyInvoice> = {}): MyInvoice {
	return {
		id: 'invoice-1',
		number: 'DELFTMUN-2026-0031',
		description: 'Delegate fee · DelftMUN 2026',
		amountCents: 6500,
		currency: 'EUR',
		status: 'unpaid',
		dueAt: '2027-01-22T12:00:00Z',
		paidAt: null,
		paidMethod: null,
		createdAt: '2026-09-01T09:00:00Z',
		conference: {
			slug: 'delftmun-2026',
			name: 'DelftMUN 2026',
			logoPath: null,
			timezone: AMSTERDAM
		},
		delegationName: null,
		...changes
	};
}

describe('isInvoiceOverdue', () => {
	it('is true for an unpaid invoice whose due date has gone by', () => {
		const now = new Date('2027-02-01T09:00:00Z');

		expect(isInvoiceOverdue(invoice(), now)).toBe(true);
	});

	it('is false while the due date is still ahead', () => {
		const now = new Date('2026-12-01T09:00:00Z');

		expect(isInvoiceOverdue(invoice(), now)).toBe(false);
	});

	it('is false for an invoice with no due date at all', () => {
		const now = new Date('2027-02-01T09:00:00Z');

		expect(isInvoiceOverdue(invoice({ dueAt: null }), now)).toBe(false);
	});

	it('is false for an invoice that is no longer unpaid, however old', () => {
		const now = new Date('2027-02-01T09:00:00Z');

		expect(isInvoiceOverdue(invoice({ status: 'paid' }), now)).toBe(false);
		expect(isInvoiceOverdue(invoice({ status: 'waived' }), now)).toBe(false);
		expect(isInvoiceOverdue(invoice({ status: 'void' }), now)).toBe(false);
	});
});

describe('invoiceDueSentence', () => {
	it('names the day in the conference timezone', () => {
		expect(invoiceDueSentence('2027-01-22T12:00:00Z', AMSTERDAM)).toBe('Due 22 Jan 2027');
	});

	it('reads a late-evening moment as the next day where the conference is', () => {
		// 23:30 UTC on 21 January is 00:30 on 22 January in Amsterdam.
		expect(invoiceDueSentence('2027-01-21T23:30:00Z', AMSTERDAM)).toBe('Due 22 Jan 2027');
	});

	it('has nothing to say when the organisers set no date', () => {
		expect(invoiceDueSentence(null, AMSTERDAM)).toBeNull();
	});
});

describe('invoicePaidSentence', () => {
	const paid = { paidAt: '2026-09-03T10:00:00Z', paidMethod: 'stripe' as const };

	it('gives the date alone for a list row', () => {
		expect(invoicePaidSentence(paid, AMSTERDAM, false)).toBe('Paid 3 Sept 2026');
	});

	it('names the method on the invoice page', () => {
		expect(invoicePaidSentence(paid, AMSTERDAM, true)).toBe('Paid 3 Sept 2026 · card');
	});

	it('says who marked a manually collected invoice paid', () => {
		const marked = { paidAt: '2026-09-03T10:00:00Z', paidMethod: 'manual' as const };

		expect(invoicePaidSentence(marked, AMSTERDAM, true)).toBe(
			'Paid 3 Sept 2026 · marked as paid by the organisers'
		);
	});

	it('leaves the method out when none was recorded', () => {
		const unknown = { paidAt: '2026-09-03T10:00:00Z', paidMethod: null };

		expect(invoicePaidSentence(unknown, AMSTERDAM, true)).toBe('Paid 3 Sept 2026');
	});

	it('has nothing to say about an invoice that was never paid', () => {
		expect(invoicePaidSentence({ paidAt: null, paidMethod: null }, AMSTERDAM, true)).toBeNull();
	});
});

describe('invoiceStateSentence', () => {
	/** The three columns the sentence reads beyond the status itself. */
	const base = {
		paidAt: null,
		paidMethod: null,
		updatedAt: '2026-10-05T08:00:00Z'
	};

	it('says nothing about an unpaid invoice, which shows what it owes instead', () => {
		expect(invoiceStateSentence({ ...base, status: 'unpaid' }, AMSTERDAM)).toBeNull();
	});

	it('gives a paid invoice its receipt line', () => {
		const sentence = invoiceStateSentence(
			{ ...base, status: 'paid', paidAt: '2026-09-03T10:00:00Z', paidMethod: 'manual' },
			AMSTERDAM
		);

		expect(sentence).toBe('Paid 3 Sept 2026 · marked as paid by the organisers');
	});

	it('falls back to a plain sentence for a paid invoice with no date on it', () => {
		expect(invoiceStateSentence({ ...base, status: 'paid' }, AMSTERDAM)).toBe(
			'This invoice has been paid.'
		);
	});

	it('gives each of the other statuses its own sentence', () => {
		expect(invoiceStateSentence({ ...base, status: 'waived' }, AMSTERDAM)).toBe(
			'The organisers waived this invoice.'
		);
		expect(invoiceStateSentence({ ...base, status: 'void' }, AMSTERDAM)).toBe(
			'This invoice was cancelled.'
		);
		expect(invoiceStateSentence({ ...base, status: 'refunded' }, AMSTERDAM)).toBe(
			'This invoice was refunded on 5 Oct 2026.'
		);
	});
});

describe('paymentInstructionsText', () => {
	it('gives the organiser their own words', () => {
		expect(paymentInstructionsText('Transfer to NL12 ABCD 0123.')).toBe(
			'Transfer to NL12 ABCD 0123.'
		);
	});

	it('stands in for a conference that wrote none', () => {
		expect(paymentInstructionsText(null)).toBe(NO_PAYMENT_INSTRUCTIONS);
		expect(paymentInstructionsText('   ')).toBe(NO_PAYMENT_INSTRUCTIONS);
	});
});

describe('invoicePaymentSection', () => {
	it('offers the organiser instructions when the conference collects outside MUNMeet', () => {
		const section = invoicePaymentSection({
			status: 'unpaid',
			collectsPaymentsManually: true
		});

		expect(section).toBe('instructions');
	});

	it('says card payment is not ready when the conference collects by card', () => {
		const section = invoicePaymentSection({
			status: 'unpaid',
			collectsPaymentsManually: false
		});

		expect(section).toBe('card-not-ready');
		expect(CARD_PAYMENT_NOT_READY).toContain('not available yet');
	});

	it('offers no way to pay an invoice that is not unpaid', () => {
		// This is the refusal T31 was asked to decide: the page is what refuses a
		// paid, waived, cancelled or refunded invoice a way to pay, because
		// `set_invoice_checkout_session` checks only that the caller is the payer.
		for (const status of ['paid', 'waived', 'void', 'refunded'] as const) {
			expect(invoicePaymentSection({ status, collectsPaymentsManually: true })).toBe('none');
			expect(invoicePaymentSection({ status, collectsPaymentsManually: false })).toBe('none');
		}
	});
});

describe('sortMyInvoices', () => {
	it('puts everything still to be paid first', () => {
		const rows = [
			invoice({ id: 'paid', status: 'paid', dueAt: '2026-01-01T00:00:00Z' }),
			invoice({ id: 'unpaid', status: 'unpaid', dueAt: '2027-06-01T00:00:00Z' })
		];

		expect(sortMyInvoices(rows).map((row) => row.id)).toEqual(['unpaid', 'paid']);
	});

	it('orders invoices of the same kind by due date, soonest first', () => {
		const rows = [
			invoice({ id: 'later', dueAt: '2027-03-01T00:00:00Z' }),
			invoice({ id: 'sooner', dueAt: '2027-01-01T00:00:00Z' })
		];

		expect(sortMyInvoices(rows).map((row) => row.id)).toEqual(['sooner', 'later']);
	});

	it('puts an invoice with no due date after the ones that have one', () => {
		const rows = [
			invoice({ id: 'undated', dueAt: null }),
			invoice({ id: 'dated', dueAt: '2027-03-01T00:00:00Z' })
		];

		expect(sortMyInvoices(rows).map((row) => row.id)).toEqual(['dated', 'undated']);
	});

	it('breaks a tie on the due date with the newest invoice first', () => {
		const rows = [
			invoice({ id: 'older', createdAt: '2026-08-01T09:00:00Z' }),
			invoice({ id: 'newer', createdAt: '2026-09-01T09:00:00Z' })
		];

		expect(sortMyInvoices(rows).map((row) => row.id)).toEqual(['newer', 'older']);
	});

	it('leaves the list it was given alone', () => {
		const rows = [invoice({ id: 'paid', status: 'paid' }), invoice({ id: 'unpaid' })];

		sortMyInvoices(rows);

		expect(rows.map((row) => row.id)).toEqual(['paid', 'unpaid']);
	});
});

/** One row of the organiser's table, so a test can change one field of it. */
function organiserRow(changes: Partial<OrganiserInvoiceRow> = {}): OrganiserInvoiceRow {
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
		platformFeeCents: 200,
		status: 'unpaid',
		paidAt: null,
		paidMethod: null,
		createdAt: '2026-09-01T09:00:00Z',
		note: null,
		...changes
	};
}

/** `count` rows numbered from 1, so paging can be tested on something long enough. */
function manyRows(count: number): OrganiserInvoiceRow[] {
	const rows: OrganiserInvoiceRow[] = [];

	for (let index = 1; index <= count; index += 1) {
		rows.push(organiserRow({ id: `invoice-${index}`, number: `ROTTERDAMMUN-2026-${index}` }));
	}

	return rows;
}

/** A query that differs from the default in the fields given. */
function listQuery(changes: Partial<InvoiceListQuery> = {}): InvoiceListQuery {
	return { ...EMPTY_INVOICE_LIST_QUERY, ...changes };
}

describe('parseInvoiceQuery', () => {
	it('reads the search, the status, the page and the highlighted invoice', () => {
		const params = new URLSearchParams('q= kowalska &status=paid&page=3&invoice=invoice-7');

		expect(parseInvoiceQuery(params)).toEqual({
			q: 'kowalska',
			status: 'paid',
			page: 3,
			invoice: 'invoice-7'
		});
	});

	it('opens on every invoice and the first page when the URL asks for nothing', () => {
		expect(parseInvoiceQuery(new URLSearchParams())).toEqual(EMPTY_INVOICE_LIST_QUERY);
	});

	it('ignores a status that does not exist and a page that is not a whole number above zero', () => {
		const params = new URLSearchParams('status=owing&page=-2');

		expect(parseInvoiceQuery(params)).toMatchObject({ status: '', page: 1 });
		expect(parseInvoiceQuery(new URLSearchParams('page=1.5')).page).toBe(1);
	});
});

describe('invoiceStatusOptions', () => {
	it('offers every status under the badge words, after "Any status"', () => {
		expect(invoiceStatusOptions()).toEqual([
			{ value: '', label: 'Any status' },
			{ value: 'unpaid', label: 'Unpaid' },
			{ value: 'paid', label: 'Paid' },
			{ value: 'waived', label: 'Waived' },
			{ value: 'refunded', label: 'Refunded' },
			{ value: 'void', label: 'Cancelled' }
		]);
	});
});

describe('matchesInvoiceSearch', () => {
	const row = organiserRow({ delegationName: 'Lycée Voltaire' });

	it('finds the payer, the delegation and the number, in any case', () => {
		expect(matchesInvoiceSearch(row, 'KOWALSKA')).toBe(true);
		expect(matchesInvoiceSearch(row, 'voltaire')).toBe(true);
		expect(matchesInvoiceSearch(row, '2026-0001')).toBe(true);
	});

	it('matches everything when the search is empty, and nothing it does not contain', () => {
		expect(matchesInvoiceSearch(row, '  ')).toBe(true);
		expect(matchesInvoiceSearch(row, 'France')).toBe(false);
	});
});

describe('filterInvoices', () => {
	it('keeps only the status asked for and the rows the search finds', () => {
		const rows = [
			organiserRow({ id: 'a', status: 'paid' }),
			organiserRow({ id: 'b', status: 'unpaid' }),
			organiserRow({ id: 'c', status: 'paid', payerName: 'Jan de Vries' })
		];

		const filtered = filterInvoices(rows, listQuery({ status: 'paid', q: 'maria' }));

		expect(filtered.map((invoice) => invoice.id)).toEqual(['a']);
	});
});

describe('pageOfInvoices', () => {
	it('cuts the filtered list into pages and counts them', () => {
		const rows = manyRows(INVOICES_PAGE_SIZE + 3);

		const secondPage = pageOfInvoices(rows, listQuery({ page: 2 }));

		expect(secondPage.rows.map((invoice) => invoice.id)).toEqual([
			'invoice-26',
			'invoice-27',
			'invoice-28'
		]);
		expect(secondPage.pageCount).toBe(2);
		expect(secondPage.matchingCount).toBe(28);
		expect(secondPage.highlightedId).toBeNull();
	});

	it('still has one page to be on when nothing matches', () => {
		expect(pageOfInvoices([], EMPTY_INVOICE_LIST_QUERY)).toEqual({
			rows: [],
			matchingCount: 0,
			pageCount: 1,
			highlightedId: null
		});
	});

	it('puts a highlighted invoice from another page first, without moving the rest', () => {
		const rows = manyRows(INVOICES_PAGE_SIZE + 3);

		const firstPage = pageOfInvoices(rows, listQuery({ invoice: 'invoice-27' }));

		expect(firstPage.rows[0].id).toBe('invoice-27');
		expect(firstPage.rows[1].id).toBe('invoice-1');
		expect(firstPage.rows).toHaveLength(INVOICES_PAGE_SIZE + 1);
		expect(firstPage.highlightedId).toBe('invoice-27');
	});

	it('finds a highlighted invoice even when the filter would hide it', () => {
		const rows = [
			organiserRow({ id: 'a', status: 'unpaid' }),
			organiserRow({ id: 'b', status: 'paid' })
		];

		const page = pageOfInvoices(rows, listQuery({ status: 'unpaid', invoice: 'b' }));

		expect(page.rows.map((invoice) => invoice.id)).toEqual(['b', 'a']);
		expect(page.matchingCount).toBe(1);
	});

	it('leaves a highlighted invoice where it is when it is already on the page', () => {
		const rows = manyRows(3);

		const page = pageOfInvoices(rows, listQuery({ invoice: 'invoice-2' }));

		expect(page.rows.map((invoice) => invoice.id)).toEqual(['invoice-1', 'invoice-2', 'invoice-3']);
		expect(page.highlightedId).toBe('invoice-2');
	});

	it('highlights nothing for an id that is not one of these invoices', () => {
		const page = pageOfInvoices(manyRows(2), listQuery({ invoice: 'somebody-elses' }));

		expect(page.rows).toHaveLength(2);
		expect(page.highlightedId).toBeNull();
	});
});

describe('invoicePaidMethodLabel', () => {
	it('names the two methods, and leaves an unpaid invoice blank', () => {
		expect(invoicePaidMethodLabel('stripe')).toBe('Card');
		expect(invoicePaidMethodLabel('manual')).toBe('Manual');
		expect(invoicePaidMethodLabel(null)).toBe('');
	});
});

describe('availableInvoiceActions', () => {
	it('gives an unpaid invoice all three, in the order the row shows them', () => {
		expect(availableInvoiceActions('unpaid')).toEqual(['markPaid', 'waive', 'void']);
	});

	it('gives every other status none of them', () => {
		for (const status of ['paid', 'waived', 'void', 'refunded'] as const) {
			expect(availableInvoiceActions(status), status).toEqual([]);
		}
	});
});

describe('invoiceActionRefusal', () => {
	it('names the status the way the badge does, and the action that was refused', () => {
		expect(invoiceActionRefusal('paid', 'waive')).toBe(
			'This invoice is paid and cannot be waived.'
		);
		expect(invoiceActionRefusal('void', 'markPaid')).toBe(
			'This invoice is cancelled and cannot be marked as paid.'
		);
		expect(invoiceActionRefusal('waived', 'void')).toBe(
			'This invoice is waived and cannot be voided.'
		);
	});
});

describe('invoiceActionFlash', () => {
	it('names the invoice number', () => {
		expect(invoiceActionFlash('ROTTERDAMMUN-2026-0001', 'markPaid')).toBe(
			'Invoice ROTTERDAMMUN-2026-0001 marked as paid.'
		);
	});
});

describe('readInvoiceNote', () => {
	/** A posted form holding one note. */
	function formWithNote(note: string): FormData {
		const formData = new FormData();
		formData.set('note', note);
		return formData;
	}

	it('reads a note, trimmed', () => {
		expect(readInvoiceNote(formWithNote('  Paid in cash at registration '), 'markPaid')).toBe(
			'Paid in cash at registration'
		);
	});

	it('reads an empty box, or no box at all, as no note', () => {
		expect(readInvoiceNote(formWithNote('   '), 'waive')).toBeNull();
		expect(readInvoiceNote(new FormData(), 'waive')).toBeNull();
	});

	it('ignores a note sent with "Void", which has no box for one', () => {
		expect(readInvoiceNote(formWithNote('Raised twice'), 'void')).toBeNull();
	});
});

describe('invoiceCsvRows', () => {
	it('writes the headings and one row per invoice in the columns the spec lists', () => {
		const paid = {
			...organiserRow({
				delegationName: 'Lycée Voltaire',
				quantity: 3,
				unitAmountCents: 5500,
				amountCents: 16500,
				platformFeeCents: 600,
				status: 'paid',
				paidAt: '2026-09-03T10:00:00Z',
				paidMethod: 'manual',
				note: 'Bank transfer, 3 Sep'
			}),
			payerEmail: 'maria@example.com'
		};

		expect(invoiceCsvRows([paid])).toEqual([
			[
				'Number',
				'Payer name',
				'Payer email',
				'Delegation',
				'Description',
				'Quantity',
				'Unit amount',
				'Amount',
				'Currency',
				'Platform fee',
				'Status',
				'Paid at',
				'Method',
				'Note'
			],
			[
				'ROTTERDAMMUN-2026-0001',
				'Maria Kowalska',
				'maria@example.com',
				'Lycée Voltaire',
				'Delegate fee · Rotterdam Spring MUN 2026',
				'3',
				'55.00',
				'165.00',
				'EUR',
				'',
				'Paid',
				'2026-09-03T10:00:00Z',
				'Manual',
				'Bank transfer, 3 Sep'
			]
		]);
	});

	it('writes the platform fee only for an invoice paid by card', () => {
		const byCard = organiserRow({ status: 'paid', paidMethod: 'stripe', platformFeeCents: 200 });
		const rows = invoiceCsvRows([{ ...byCard, payerEmail: null }]);

		expect(rows[1][9]).toBe('2.00');
	});

	it('leaves the cells it has nothing for empty, rather than writing "null"', () => {
		const rows = invoiceCsvRows([{ ...organiserRow(), payerEmail: null }]);

		expect(toCsvText(rows)).not.toContain('null');
		expect(rows[1][2]).toBe('');
		expect(rows[1][13]).toBe('');
	});
});

describe('invoicesCsvFileName', () => {
	it('puts the slug first and the day last', () => {
		expect(invoicesCsvFileName('rotterdammun-2026', '2026-09-22')).toBe(
			'rotterdammun-2026-invoices-2026-09-22.csv'
		);
	});
});

/**
 * The words and figures of the "Invoices" tab of an organiser's fees page,
 * `/manage/[slug]/fees?tab=invoices`: the strip of totals above the table and
 * the quiet lines under a row's payer and payment.
 *
 * They live here rather than in the components, because `CLAUDE.md` keeps
 * formatting out of a component's script block, and the table row and the
 * phone card write them the same way. Nothing here talks to Supabase.
 */
import type { StripStat } from '$lib/components/manage/StatStrip.svelte';
import { formatDayAndMonth } from '$lib/dates';
import type { ConferenceInvoiceTotals } from '$lib/fees';
import { invoicePaidMethodLabel, type OrganiserInvoiceRow } from '$lib/invoices';
import { formatMoney } from '$lib/money';

/**
 * Who or what an invoice was raised for, as one line under the payer:
 * "UNSC · France" for one delegate's seat, "Harbour View College · 3 seats"
 * for a delegation's group invoice, or '' when neither is known.
 */
export function invoicePayerDetail(
	invoice: Pick<OrganiserInvoiceRow, 'delegationName' | 'seatLabel' | 'quantity'>
): string {
	if (invoice.delegationName === null) {
		return invoice.seatLabel ?? '';
	}

	if (invoice.quantity > 1) {
		return `${invoice.delegationName} · ${invoice.quantity} seats`;
	}

	return invoice.delegationName;
}

/**
 * When and how an invoice was paid, such as "28 Oct · Manual", or '' while it
 * is not paid. The day is the one it was where the conference is held; the
 * year is left out because every invoice of one conference falls in the few
 * months before it.
 */
export function invoicePaidDetail(
	invoice: Pick<OrganiserInvoiceRow, 'paidAt' | 'paidMethod'>,
	timezone: string
): string {
	if (invoice.paidAt === null) {
		return '';
	}

	const day = formatDayAndMonth(invoice.paidAt, timezone);
	const method = invoicePaidMethodLabel(invoice.paidMethod);

	return method ? `${day} · ${method}` : day;
}

/**
 * The four figures above the table: invoiced, paid, outstanding and waived.
 * "Outstanding" names how many invoices are still unpaid, and "Paid" names
 * what MUNMeet kept on card payments, but only once it kept something.
 */
export function invoiceTotalStats(totals: ConferenceInvoiceTotals, currency: string): StripStat[] {
	const outstandingNote =
		totals.outstandingCount === 1 ? '1 invoice' : `${totals.outstandingCount} invoices`;
	const paidNote =
		totals.platformFeesCents > 0
			? `${formatMoney(totals.platformFeesCents, currency)} platform fees`
			: undefined;

	return [
		{ value: formatMoney(totals.invoicedCents, currency), label: 'Invoiced' },
		{ value: formatMoney(totals.paidCents, currency), label: 'Paid', note: paidNote },
		{
			value: formatMoney(totals.outstandingCents, currency),
			label: 'Outstanding',
			note: outstandingNote
		},
		{ value: formatMoney(totals.waivedCents, currency), label: 'Waived' }
	];
}

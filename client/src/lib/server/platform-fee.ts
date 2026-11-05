/**
 * What MUNMeet charges an organiser, and one of the two places it is written.
 *
 * This is the copy the application reads: the invoice a delegate pays is
 * charged with it as Stripe's `application_fee_amount`.
 *
 * The other copy is the `platform_fee_per_delegate_cents()` SQL function in
 * `supabase/migrations/20260919120000_fees_and_invoices.sql`, and **changing the
 * fee means changing both**. It exists because `compute_invoice_amount` fills
 * every `invoices.platform_fee_cents` inside the database, where no TypeScript
 * file can be read, and the four allocation functions create every invoice
 * there. Moving this number alone would send the new fee to Stripe while the
 * database went on stamping invoices at the old one.
 * `specs/02-architecture/payments.md` says the same beside the rule.
 *
 * Files under `$lib/server` only ever run on the server, so a page that wants
 * to show the number has to be given it by a `load` function rather than
 * import this file. That is deliberate: it keeps a page from hard-coding a
 * price that has moved on.
 */

/**
 * What MUNMeet keeps from each delegate seat paid by card, in whole cents.
 *
 * €2.00 per seat is the default the spec assumes while open question 1 in
 * `specs/07-delivery/open-questions.md` is unanswered: the founders have still
 * to decide whether the fee is a fixed amount or a percentage. Invoices in
 * another currency use the same number in that currency's minor unit for now.
 */
export const PLATFORM_FEE_PER_DELEGATE_CENTS = 200;

/**
 * The currency the amount above is quoted in.
 *
 * It is one of the codes in `$lib/money`, so that `Money` and
 * `Intl.NumberFormat` can format it. Like the amount, it is part of open
 * question 1 and lives here so that it is written down exactly once.
 */
export const PLATFORM_FEE_CURRENCY = 'EUR';

/**
 * Does this invoice need a Stripe Checkout at all?
 *
 * A fee of nothing, a seat an organiser priced at zero, is still an invoice,
 * because the fees page lists it and the payer sees it settled. It is not a
 * payment: Stripe refuses a Checkout for zero, and MUNMeet takes no fee on
 * money that never moved. The future `pay` action asks this before it talks to
 * Stripe and marks such an invoice paid without a session (security review
 * 2026-10-10, I10).
 */
export function needsCheckout(invoice: { amountCents: number }): boolean {
	return invoice.amountCents > 0;
}

/**
 * What MUNMeet asks Stripe to keep from one invoice, as the
 * `application_fee_amount` of its Checkout session.
 *
 * The database stamps `platform_fee_cents` as quantity times the fee per seat
 * in the invoice's own minor unit, whatever the currency. Stripe refuses an
 * application fee larger than the charge, and a fee on a charge of nothing is
 * no fee, so the amount asked for is never more than the invoice itself and is
 * zero for an invoice that is zero. The stored column stays what it is: a
 * record of the rate on the day.
 */
export function applicationFeeCents(invoice: { amountCents: number; quantity: number }): number {
	if (!needsCheckout(invoice)) {
		return 0;
	}

	return Math.min(invoice.quantity * PLATFORM_FEE_PER_DELEGATE_CENTS, invoice.amountCents);
}

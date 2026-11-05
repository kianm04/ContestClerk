/**
 * What the conference dashboard knows about the money still owed: the unpaid
 * invoices, for "3 invoices are unpaid" and "1 invoice is still unpaid"
 * (`specs/05-pages/organiser/dashboard.md`).
 *
 * Nothing here talks to Supabase or knows any Svelte.
 * `$lib/server/dashboard-invoices.ts` reads the rows.
 */

/** The conference's unpaid invoices, added up. */
export type UnpaidInvoices = {
	count: number;
	/** Every unpaid invoice's amount added up, in cents. */
	totalCents: number;
	/** When the oldest of them was made, an ISO timestamp, or `null` when there are none. */
	oldestCreatedAt: string | null;
	/**
	 * Who the one unpaid invoice is for, when there is exactly one: the payer's
	 * name, or the delegation's. `null` when there are several, or none, or the
	 * name could not be read.
	 */
	onlyPayerName: string | null;
};

/** No unpaid invoices, for the phases that do not read them. */
export const NO_UNPAID_INVOICES: UnpaidInvoices = {
	count: 0,
	totalCents: 0,
	oldestCreatedAt: null,
	onlyPayerName: null
};

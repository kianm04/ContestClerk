/**
 * What the conference dashboard reads about the money still owed, from the
 * time seats are given until after the conference
 * (`specs/05-pages/organiser/dashboard.md`).
 *
 * Files under `$lib/server` only ever run on the server.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { UnpaidInvoices } from '$lib/dashboard-invoices';
import { readFullNames } from '$lib/server/dashboard-people';

/** One unpaid `invoices` row, with the delegation it was made out to, if any. */
type UnpaidInvoiceRow = {
	amount_cents: number;
	created_at: string;
	payer_user_id: string | null;
	delegations: { name: string } | null;
};

/** Every unpaid invoice of the conference, oldest first. */
async function readUnpaidInvoices(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<UnpaidInvoiceRow[]> {
	const { data, error } = await supabase
		.from('invoices')
		.select('amount_cents, created_at, payer_user_id, delegations(name)')
		.eq('conference_id', conferenceId)
		.eq('status', 'unpaid')
		.order('created_at', { ascending: true })
		.overrideTypes<UnpaidInvoiceRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the unpaid invoices: ${error.message}`);
	}

	return data ?? [];
}

/**
 * Who one invoice is for: the person paying it, or else the delegation it was
 * made out to. The person's name is a second request, which only this one
 * invoice ever needs.
 */
async function payerName(
	supabase: SupabaseClient,
	invoice: UnpaidInvoiceRow
): Promise<string | null> {
	if (invoice.payer_user_id === null) {
		return invoice.delegations?.name ?? null;
	}

	const names = await readFullNames(supabase, [invoice.payer_user_id]);

	return names.get(invoice.payer_user_id) ?? invoice.delegations?.name ?? null;
}

/** How many invoices are unpaid, for how much in all, since when, and for whom when there is one. */
export async function loadUnpaidInvoices(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<UnpaidInvoices> {
	const invoices = await readUnpaidInvoices(supabase, conferenceId);
	let totalCents = 0;

	for (const invoice of invoices) {
		totalCents += invoice.amount_cents;
	}

	const onlyPayerName = invoices.length === 1 ? await payerName(supabase, invoices[0]) : null;

	return {
		count: invoices.length,
		totalCents,
		oldestCreatedAt: invoices[0]?.created_at ?? null,
		onlyPayerName
	};
}

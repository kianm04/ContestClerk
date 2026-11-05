import { invoiceTotals } from '$lib/fees';
import { sortMyInvoices } from '$lib/invoices';
import { requireOnboarded } from '$lib/server/access';
import { listMyInvoices } from '$lib/server/invoices';
import type { PageServerLoad } from './$types';

/**
 * Runs on the server before the page is rendered. Whatever it returns arrives
 * in `+page.svelte` as `data`.
 *
 * `requireOnboarded` is `requireUser` plus the onboarding gate: a brand-new
 * account is sent to `/welcome` first, and comes back here once it is filled
 * in. A visitor is sent to `/login?next=/invoices`.
 *
 * Files under `$lib/server` only ever run on the server, so the query cannot
 * reach the browser.
 */
export const load: PageServerLoad = async ({ url, locals }) => {
	const user = await requireOnboarded(locals, url);

	const invoices = sortMyInvoices(await listMyInvoices(locals.supabase, user.id));

	/*
		One moment for the whole page, so that two rows cannot disagree about
		whether "now" was before or after a due date. It is returned because every
		row draws its due date against it.
	*/
	const now = new Date();

	return {
		invoices,
		/** Outstanding and paid, one entry per currency, for the line under the title. */
		totals: invoiceTotals(invoices),
		now
	};
};

import { error } from '@sveltejs/kit';
import { invoicePaymentSection } from '$lib/invoices';
import { requireOnboarded } from '$lib/server/access';
import { getInvoice } from '$lib/server/invoices';
import type { PageServerLoad } from './$types';

/** What the page says when the invoice is not there, or is not this reader's. */
const NO_SUCH_INVOICE = 'This invoice does not exist.';

/**
 * Runs on the server before the page is rendered. Whatever it returns arrives
 * in `+page.svelte` as `data`.
 *
 * `./$types` holds the types SvelteKit generates for this one route, so
 * `PageServerLoad` already knows that `params` has an `invoiceId` in it.
 *
 * `getInvoice` answers `null` both for an invoice that does not exist and for
 * one belonging to somebody else, so both become the same 404 and a guessed id
 * cannot tell the two apart.
 */
export const load: PageServerLoad = async ({ params, url, locals }) => {
	const user = await requireOnboarded(locals, url);

	const page = await getInvoice(locals.supabase, params.invoiceId, user.id);

	if (!page) {
		error(404, NO_SUCH_INVOICE);
	}

	return {
		...page,
		/**
		 * Which payment section the page draws under the summary. It is worked out
		 * here rather than in the component so that T32's `pay` action can ask the
		 * same function before it talks to Stripe.
		 */
		paymentSection: invoicePaymentSection({
			status: page.invoice.status,
			collectsPaymentsManually: page.collectsPaymentsManually
		})
	};
};

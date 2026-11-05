import { redirect } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in event below is exactly the shape `load` is given.
import type { PageServerLoadEvent } from './$types';
// The real type, not a copy of it: renaming a field in `$lib/server/invoices.ts`
// has to fail here too.
import type { InvoicePage } from '$lib/server/invoices';

// The gate and the query are stood in for, so these tests are about what `load`
// itself decides: which gate to use, what to do when the query answers nothing,
// and which payment section the page draws. `requireOnboarded` has its own
// tests in `src/lib/server/access`, and who the database lets read an invoice
// is tested in `tests/db/`.
//
// `$lib/invoices` is deliberately not stood in for: running the real
// `invoicePaymentSection` is what proves the page offers a way to pay only
// where there is one.
vi.mock('$lib/server/access', () => ({ requireOnboarded: vi.fn() }));

vi.mock('$lib/server/invoices', () => ({ getInvoice: vi.fn() }));

import { requireOnboarded } from '$lib/server/access';
import { getInvoice } from '$lib/server/invoices';

/** Somebody signed in who has finished onboarding, as `requireOnboarded` returns them. */
const SIGNED_IN_USER = { id: 'user-1', email: 'amara@example.com' };

/** The Supabase client. `load` only hands it on. */
const SUPABASE = {};

/** The invoice every test is about, and the address it lives at. */
const INVOICE_ID = '33333333-3333-3333-3333-333333333333';
const INVOICE_PATH = `/invoices/${INVOICE_ID}`;

/** An invoice page as `getInvoice` answers with one, so a test can change one field. */
function invoicePage(changes: Partial<InvoicePage> = {}): InvoicePage {
	return {
		invoice: {
			id: INVOICE_ID,
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
				timezone: 'Europe/Amsterdam'
			},
			delegationName: null,
			quantity: 1,
			unitAmountCents: 6500,
			updatedAt: '2026-09-01T09:00:00Z'
		},
		collectsPaymentsManually: true,
		paymentInstructions: 'Transfer to NL12 ABCD 0123.',
		organisationName: 'Delft MUN Association',
		seat: { seatName: 'France', committeeName: 'Security Council', countryCode: 'FR' },
		...changes
	};
}

/**
 * The few pieces of a request that `load` here actually reads.
 *
 * SvelteKit hands it a great many more, so the cast says "this is enough".
 */
function makeLoadEvent(): PageServerLoadEvent {
	return {
		params: { invoiceId: INVOICE_ID },
		url: new URL(`http://localhost${INVOICE_PATH}`),
		locals: { supabase: SUPABASE }
	} as unknown as PageServerLoadEvent;
}

/**
 * The redirect `requireOnboarded` throws at a visitor who is not signed in.
 *
 * SvelteKit's `redirect` works by throwing rather than by returning, so the
 * only way to get hold of one to throw again is to catch it here.
 */
function loginRedirect(): unknown {
	try {
		redirect(303, `/login?next=${encodeURIComponent(INVOICE_PATH)}`);
	} catch (thrown) {
		return thrown;
	}

	throw new Error('Nothing was thrown, so there is no redirect to hand on.');
}

/** Run `load` and hand back whatever it threw, which is how `error` reports a 404. */
async function catchThrown(): Promise<{ status: number; body: { message: string } }> {
	try {
		await load(makeLoadEvent());
	} catch (thrown) {
		return thrown as { status: number; body: { message: string } };
	}

	throw new Error('Nothing was thrown, so the page loaded.');
}

/** What `load` answered, as much of it as these tests look at. */
type LoadedPage = InvoicePage & { paymentSection: string };

/** Run `load` and hand back its answer, which SvelteKit types loosely. */
async function loadPage(): Promise<LoadedPage> {
	return (await load(makeLoadEvent())) as unknown as LoadedPage;
}

beforeEach(() => {
	vi.mocked(requireOnboarded).mockResolvedValue(SIGNED_IN_USER);
	vi.mocked(getInvoice).mockResolvedValue(invoicePage());
});

describe('load', () => {
	it('sends a visitor to the sign in page, with this invoice to come back to', async () => {
		vi.mocked(requireOnboarded).mockRejectedValue(loginRedirect());

		const thrown = (await catchThrown()) as unknown as { status: number; location: string };

		expect(thrown.status).toBe(303);
		expect(thrown.location).toBe(`/login?next=${encodeURIComponent(INVOICE_PATH)}`);
		expect(getInvoice).not.toHaveBeenCalled();
	});

	it('asks for this invoice on behalf of the reader', async () => {
		await loadPage();

		expect(getInvoice).toHaveBeenCalledWith(SUPABASE, INVOICE_ID, 'user-1');
	});

	it('gives the page the invoice, the conference and the seat it is for', async () => {
		const page = await loadPage();

		expect(page.invoice.number).toBe('DELFTMUN-2026-0031');
		expect(page.organisationName).toBe('Delft MUN Association');
		expect(page.seat).toEqual({
			seatName: 'France',
			committeeName: 'Security Council',
			countryCode: 'FR'
		});
	});

	it('answers 404 when the invoice is not there, or belongs to somebody else', async () => {
		// `getInvoice` gives `null` for both, so a guessed id cannot tell an
		// invoice that does not exist from one belonging to somebody else.
		vi.mocked(getInvoice).mockResolvedValue(null);

		const thrown = await catchThrown();

		expect(thrown.status).toBe(404);
		expect(thrown.body.message).toBe('This invoice does not exist.');
	});

	it('shows the instructions the organisers wrote when the conference collects its own money', async () => {
		const page = await loadPage();

		expect(page.paymentSection).toBe('instructions');
		expect(page.paymentInstructions).toBe('Transfer to NL12 ABCD 0123.');
	});

	it('says card payment is not ready yet when the conference collects by card', async () => {
		vi.mocked(getInvoice).mockResolvedValue(
			invoicePage({ collectsPaymentsManually: false, paymentInstructions: null })
		);

		const page = await loadPage();

		expect(page.paymentSection).toBe('card-not-ready');
	});

	it('offers no way to pay an invoice that is not unpaid', async () => {
		// The page is what refuses a settled invoice a way to pay, which is the
		// decision T31 records in `open-questions.md`.
		for (const status of ['paid', 'waived', 'void', 'refunded'] as const) {
			const settled = invoicePage();

			vi.mocked(getInvoice).mockResolvedValue({
				...settled,
				invoice: { ...settled.invoice, status }
			});

			expect((await loadPage()).paymentSection).toBe('none');
		}
	});
});

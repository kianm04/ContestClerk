import { redirect } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in event below is exactly the shape `load` is given.
import type { PageServerLoadEvent } from './$types';
import type { MyInvoice } from '$lib/invoices';
import type { InvoiceTotal } from '$lib/fees';

// The gate and the query are stood in for, so these tests are about the three
// things `load` itself does: pick the right gate, sort what came back, and add
// the totals the line under the title draws. `requireOnboarded` has its own
// tests in `src/lib/server/access`, and what the database lets a reader see is
// tested in `tests/db/`.
//
// `$lib/invoices` and `$lib/fees` are deliberately not stood in for: the order
// of the list and the sums are the behaviour this page is made of, and a
// stand-in for them would leave nothing worth checking here.
vi.mock('$lib/server/access', () => ({ requireUser: vi.fn(), requireOnboarded: vi.fn() }));

vi.mock('$lib/server/invoices', () => ({ listMyInvoices: vi.fn() }));

import { requireOnboarded, requireUser } from '$lib/server/access';
import { listMyInvoices } from '$lib/server/invoices';

/** Somebody signed in who has finished onboarding, as `requireOnboarded` returns them. */
const SIGNED_IN_USER = { id: 'user-1', email: 'amara@example.com' };

/** The Supabase client. `load` only hands it on, so nothing here ever calls it. */
const SUPABASE = {};

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
			timezone: 'Europe/Amsterdam'
		},
		delegationName: null,
		...changes
	};
}

/**
 * The few pieces of a request that `load` here actually reads.
 *
 * SvelteKit hands it a great many more, so the cast says "this is enough";
 * anything the code reaches for that is missing fails the test loudly.
 */
function makeLoadEvent(): PageServerLoadEvent {
	return {
		url: new URL('http://localhost/invoices'),
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
		redirect(303, '/login?next=%2Finvoices');
	} catch (thrown) {
		return thrown;
	}

	throw new Error('Nothing was thrown, so there is no redirect to hand on.');
}

/** What `load` answered, as much of it as these tests look at. */
type LoadedPage = { invoices: MyInvoice[]; totals: InvoiceTotal[]; now: Date };

/**
 * Run `load` and hand back its answer.
 *
 * The cast says which of the values `load` returns these tests look at;
 * SvelteKit types the return of a `load` loosely enough that it needs one.
 */
async function loadPage(): Promise<LoadedPage> {
	return (await load(makeLoadEvent())) as unknown as LoadedPage;
}

beforeEach(() => {
	vi.mocked(requireOnboarded).mockResolvedValue(SIGNED_IN_USER);
	vi.mocked(listMyInvoices).mockResolvedValue([]);
	vi.mocked(requireUser).mockClear();
});

describe('load', () => {
	it('sends a visitor to the sign in page, with this page to come back to', async () => {
		vi.mocked(requireOnboarded).mockRejectedValue(loginRedirect());

		let thrown: { status: number; location: string } | null = null;

		try {
			await load(makeLoadEvent());
		} catch (caught) {
			thrown = caught as { status: number; location: string };
		}

		expect(thrown?.status).toBe(303);
		expect(thrown?.location).toBe('/login?next=%2Finvoices');
		expect(listMyInvoices).not.toHaveBeenCalled();
	});

	it('uses the onboarding gate rather than the plain signed-in check', async () => {
		const event = makeLoadEvent();

		await load(event);

		expect(requireOnboarded).toHaveBeenCalledWith(event.locals, event.url);
		expect(requireUser).not.toHaveBeenCalled();
	});

	it('asks for the invoices of whoever is signed in', async () => {
		await loadPage();

		expect(listMyInvoices).toHaveBeenCalledWith(SUPABASE, 'user-1');
	});

	it('puts what is still owed at the top of the list', async () => {
		vi.mocked(listMyInvoices).mockResolvedValue([
			invoice({ id: 'paid', status: 'paid', dueAt: '2026-01-01T00:00:00Z' }),
			invoice({ id: 'unpaid', dueAt: '2027-06-01T00:00:00Z' })
		]);

		const page = await loadPage();

		expect(page.invoices.map((row) => row.id)).toEqual(['unpaid', 'paid']);
	});

	it('adds up what is outstanding and what is paid, one entry per currency', async () => {
		vi.mocked(listMyInvoices).mockResolvedValue([
			invoice({ id: 'unpaid', amountCents: 6500 }),
			invoice({ id: 'paid', status: 'paid', amountCents: 60000 }),
			invoice({ id: 'pounds', currency: 'GBP', amountCents: 1000 })
		]);

		const page = await loadPage();

		expect(page.totals).toEqual([
			{ currency: 'EUR', outstandingCents: 6500, paidCents: 60000 },
			{ currency: 'GBP', outstandingCents: 1000, paidCents: 0 }
		]);
	});

	it('gives the page one moment to measure every due date against', async () => {
		const page = await loadPage();

		expect(page.now).toBeInstanceOf(Date);
	});

	it('has an empty list and no totals for somebody who has never been charged', async () => {
		const page = await loadPage();

		expect(page.invoices).toEqual([]);
		expect(page.totals).toEqual([]);
	});
});

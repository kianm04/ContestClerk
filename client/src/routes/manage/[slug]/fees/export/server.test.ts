import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './+server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in event below is exactly the shape the handler is given.
import type { RequestEvent } from './$types';
import type { Conference } from '$lib/conferences';
import type { OrganiserInvoiceRow } from '$lib/invoices';

// The gate and the two queries are stood in for, so these tests are about what
// the endpoint itself does: who it lets in, which rows it writes, and what it
// answers with. `$lib/invoices` and `$lib/csv` are deliberately real: they are
// pure, and running them is what proves the file is built from the rows the
// filter matched.
vi.mock('$lib/server/access', () => ({ requirePermissionAndRank: vi.fn() }));

vi.mock('$lib/server/invoices', () => ({
	listConferenceInvoices: vi.fn(),
	withPayerEmails: vi.fn()
}));

import { requirePermissionAndRank } from '$lib/server/access';
import { hasPermission, type MyPermissions } from '$lib/permissions';
import { listConferenceInvoices, withPayerEmails } from '$lib/server/invoices';

/** The Supabase client. The handler only hands it on. */
const SUPABASE = {};

const SIGNED_IN_USER = { id: 'user-organiser', email: 'daniel@example.com' };

const ADMINISTRATOR: MyPermissions = {
	held: [{ permission: 'administrator', scope: 'conference' }],
	committeeIds: [],
	rank: 0
};

/** The gate answers this reader as the real one would: in when they hold what it asks, else a 404. */
function signedInAs(permissions: MyPermissions) {
	vi.mocked(requirePermissionAndRank).mockImplementation(
		async (_locals, _url, _slug, permission) => {
			if (!hasPermission(permissions, permission)) {
				throw { status: 404 };
			}

			return { user: SIGNED_IN_USER, conference: CONFERENCE, permissions } as unknown as Awaited<
				ReturnType<typeof requirePermissionAndRank>
			>;
		}
	);
}

/** The conference. Its slug names the file and its timezone dates it. */
const CONFERENCE = {
	id: '11111111-1111-1111-1111-111111111111',
	slug: 'riverside-mun-2027',
	name: 'Riverside MUN 2027',
	timezone: 'Europe/Amsterdam'
} as unknown as Conference;

const EXPORT_PATH = '/manage/riverside-mun-2027/fees/export';

/** An unpaid invoice, with a comma in its description so the quoting is exercised too. */
const UNPAID: OrganiserInvoiceRow = {
	id: 'invoice-1',
	number: 'RIVERSIDE-MUN-2027-0001',
	payerName: 'Maria Kowalska',
	payerUserId: 'user-1',
	delegationName: null,
	seatLabel: 'UNSC · France',
	description: 'Delegate fee, Riverside MUN 2027',
	quantity: 1,
	unitAmountCents: 6500,
	amountCents: 6500,
	currency: 'EUR',
	platformFeeCents: 200,
	status: 'unpaid',
	paidAt: null,
	paidMethod: null,
	createdAt: '2026-09-02T09:00:00Z',
	note: null
};

/** A paid one, by somebody else. */
const PAID: OrganiserInvoiceRow = {
	...UNPAID,
	id: 'invoice-2',
	number: 'RIVERSIDE-MUN-2027-0002',
	payerName: 'Jan de Vries',
	payerUserId: 'user-2',
	description: 'Delegate fee · Riverside MUN 2027',
	status: 'paid',
	paidAt: '2026-09-03T09:00:00Z',
	paidMethod: 'manual',
	note: 'Bank transfer'
};

/** The few pieces of a request the handler actually reads. */
function makeEvent(search: string = ''): RequestEvent {
	return {
		params: { slug: CONFERENCE.slug },
		url: new URL(`http://localhost${EXPORT_PATH}${search}`),
		locals: { supabase: SUPABASE }
	} as unknown as RequestEvent;
}

beforeEach(() => {
	vi.clearAllMocks();

	signedInAs(ADMINISTRATOR);
	vi.mocked(listConferenceInvoices).mockResolvedValue([UNPAID, PAID]);
	// Every payer's email is readable, and is made from their id.
	vi.mocked(withPayerEmails).mockImplementation(async (_supabase, invoices) =>
		invoices.map((invoice) => ({ ...invoice, payerEmail: `${invoice.payerUserId}@example.com` }))
	);
});

describe('who may download it', () => {
	it('never reaches the query when the gate turns the caller away', async () => {
		vi.mocked(requirePermissionAndRank).mockRejectedValue({ status: 404 });

		await expect(GET(makeEvent())).rejects.toEqual({ status: 404 });
		expect(listConferenceInvoices).not.toHaveBeenCalled();
	});

	it('is a 404 for a team member who may read invoices but not manage them', async () => {
		signedInAs({
			...ADMINISTRATOR,
			held: [{ permission: 'read_invoices', scope: 'conference' }]
		});

		await expect(GET(makeEvent())).rejects.toMatchObject({ status: 404 });
		expect(listConferenceInvoices).not.toHaveBeenCalled();
	});
});

describe('which rows it writes', () => {
	it('writes every column the page spec lists, headings first', async () => {
		const response = await GET(makeEvent());
		const lines = (await response.text()).split('\r\n');

		expect(listConferenceInvoices).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id);
		expect(lines[0]).toBe(
			'Number,Payer name,Payer email,Delegation,Description,Quantity,Unit amount,Amount,' +
				'Currency,Platform fee,Status,Paid at,Method,Note'
		);
		// The description holds a comma, so the cell is quoted rather than
		// splitting the row in two. The platform fee is empty because nothing
		// has been paid by card, so the platform has taken nothing yet.
		expect(lines[1]).toBe(
			'RIVERSIDE-MUN-2027-0001,Maria Kowalska,user-1@example.com,,' +
				'"Delegate fee, Riverside MUN 2027",1,65.00,65.00,EUR,,Unpaid,,,'
		);
	});

	it('writes only the invoices the search and the status leave, on every page', async () => {
		const response = await GET(makeEvent('?status=paid&q=vries&page=4'));
		const lines = (await response.text()).split('\r\n');

		expect(withPayerEmails).toHaveBeenCalledWith(SUPABASE, [PAID]);
		// Every row ends with a line break, so the last piece of the split is empty.
		expect(lines).toHaveLength(3);
		expect(lines[1]).toContain('RIVERSIDE-MUN-2027-0002');
		expect(lines[1]).toContain('Bank transfer');
	});
});

describe('which columns it writes', () => {
	it('leaves out the payer email for a reader without read_contact_details', async () => {
		signedInAs({
			...ADMINISTRATOR,
			held: [{ permission: 'manage_invoices', scope: 'conference' }]
		});

		const response = await GET(makeEvent());
		const lines = (await response.text()).split('\r\n');

		expect(lines[0]).not.toContain('Payer email');
		expect(lines[1]).not.toContain('user-1@example.com');
	});
});

describe('what the browser is told', () => {
	it('answers as a CSV file named after the conference and the day', async () => {
		const response = await GET(makeEvent());
		const disposition = response.headers.get('content-disposition') ?? '';

		expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
		expect(disposition).toMatch(
			/^attachment; filename="riverside-mun-2027-invoices-\d{4}-\d{2}-\d{2}\.csv"$/
		);
	});
});

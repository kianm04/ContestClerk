import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	getConferenceInvoice,
	getInvoice,
	listConferenceInvoices,
	listMyInvoices,
	settleInvoice,
	withPayerEmails
} from './invoices';

// These tests are about the requests this module builds: which relation each
// one asks for, which conditions end up on the query, what it makes of the
// answer, and who it refuses. Nothing here talks to a database; the stand-in
// client below writes down what it was asked for and answers with fixed rows.
// Whether the database itself lets somebody read an invoice is Row Level
// Security's decision and is tested in `tests/db/`.

/** An error in the shape the real client reports one. */
type QueryError = { message: string; code?: string };

/** What one query was asking for. */
type RecordedQuery = {
	/** The relation `.from(...)` named. */
	table: string;
	/** The columns `.select(...)` was given. */
	columns: string;
	eq: [string, unknown][];
	/** The one string every `.or(...)` was given, which is a whole filter of its own. */
	or: string[];
	/** The column and the list of every `.in(...)`. */
	in: [string, unknown[]][];
	/** What `.update(...)` was given, or null for a query that read. */
	update: unknown;
	/** What `.upsert(...)` was given, or null for a query that did not. */
	upsert: unknown;
	/** The first and last index `.range(...)` asked for, or null for no window. */
	range: [number, number] | null;
};

/** What the stand-in should answer with for one relation. Everything has a default. */
type TableAnswer = {
	/** The row a `maybeSingle()` chain finds, or nothing when there is none. */
	row?: unknown;
	/** The rows a list query finds. */
	rows?: unknown[];
	/** The message the query fails with, instead of answering. */
	message?: string;
	/** The error code it fails with, beside the message. */
	code?: string;
};

/** The end of a chain that asked for one row rather than a list. */
type SingleRowBuilder = {
	overrideTypes: () => Promise<{ data: unknown; error: QueryError | null }>;
};

/** One step of the query. Every step hands the builder back, which is what chains them. */
type QueryBuilder = {
	select: (columns: string) => QueryBuilder;
	eq: (column: string, value: unknown) => QueryBuilder;
	or: (filters: string) => QueryBuilder;
	in: (column: string, values: unknown[]) => QueryBuilder;
	order: (column: string, options: unknown) => QueryBuilder;
	range: (first: number, last: number) => QueryBuilder;
	update: (changes: unknown) => QueryBuilder;
	upsert: (row: unknown, options: unknown) => QueryBuilder;
	maybeSingle: () => SingleRowBuilder;
	overrideTypes: () => Promise<{ data: unknown; error: QueryError | null }>;
	/** What makes the builder awaitable on its own, as a write with no `select` is. */
	then: (resolve: (answer: { data: unknown; error: QueryError | null }) => void) => void;
};

/**
 * A stand-in Supabase client that writes down what it was asked for.
 *
 * The real client is a builder: `.from(...)` gives back an object with
 * `.select(...)` on it, `.select(...)` one with `.eq(...)` on it, and so on.
 * Each step adds one condition to a query that is only sent once the chain is
 * awaited. This copies that shape: every step records its arguments and hands
 * the same builder back. `overrideTypes` changes the type of the answer in the
 * real client rather than the answer itself, and comes after `maybeSingle()`
 * for one row or straight after the filters for a list.
 */
function createStandInSupabase(answers: Record<string, TableAnswer> = {}): {
	supabase: SupabaseClient;
	queries: RecordedQuery[];
} {
	const queries: RecordedQuery[] = [];

	function builderFor(table: string): QueryBuilder {
		const query: RecordedQuery = {
			table,
			columns: '',
			eq: [],
			or: [],
			in: [],
			update: null,
			upsert: null,
			range: null
		};
		queries.push(query);

		const answer = answers[table] ?? {};
		const failure = answer.message ? { message: answer.message, code: answer.code } : null;

		// A query with a window gets that window of the rows, so a loop that reads
		// window after window comes to an empty one and stops.
		function listAnswer(): unknown[] {
			const rows = answer.rows ?? [];

			if (query.range === null) {
				return rows;
			}

			return rows.slice(query.range[0], query.range[1] + 1);
		}

		const builder: QueryBuilder = {
			select: (columns) => {
				query.columns = columns;
				return builder;
			},
			eq: (column, value) => {
				query.eq.push([column, value]);
				return builder;
			},
			or: (filters) => {
				query.or.push(filters);
				return builder;
			},
			in: (column, values) => {
				query.in.push([column, values]);
				return builder;
			},
			order: () => builder,
			range: (first, last) => {
				query.range = [first, last];
				return builder;
			},
			update: (changes) => {
				query.update = changes;
				return builder;
			},
			upsert: (row) => {
				query.upsert = row;
				return builder;
			},
			maybeSingle: () => ({
				overrideTypes: async () => ({ data: failure ? null : (answer.row ?? null), error: failure })
			}),
			overrideTypes: async () => ({ data: failure ? null : listAnswer(), error: failure }),
			then: (resolve) => resolve({ data: null, error: failure })
		};

		return builder;
	}

	return { supabase: { from: builderFor } as unknown as SupabaseClient, queries };
}

/** The reader every test is. */
const USER_ID = 'user-1';

/** The conference columns both queries embed, under the database's own names. */
const CONFERENCE_ROW = {
	slug: 'delftmun-2026',
	name: 'DelftMUN 2026',
	logo_path: null,
	timezone: 'Europe/Amsterdam'
};

/** One invoice as the list query gets it back, under the database's own names. */
const LIST_ROW = {
	id: 'invoice-1',
	number: 'DELFTMUN-2026-0031',
	description: 'Delegate fee · DelftMUN 2026',
	amount_cents: 6500,
	currency: 'EUR',
	status: 'unpaid',
	due_at: '2027-01-22T12:00:00Z',
	paid_at: null,
	paid_method: null,
	created_at: '2026-09-01T09:00:00Z',
	conferences: CONFERENCE_ROW,
	delegations: null
};

/** One invoice as the single-invoice query gets it back. */
const PAGE_ROW = {
	...LIST_ROW,
	payer_user_id: USER_ID,
	delegation_id: null,
	quantity: 1,
	unit_amount_cents: 6500,
	updated_at: '2026-09-01T09:00:00Z',
	conferences: {
		...CONFERENCE_ROW,
		collects_payments_manually: true,
		payment_instructions: 'Transfer to NL12 ABCD 0123.',
		organizations: { name: 'Delft MUN Association' }
	},
	seats: { name: 'France', country_code: 'FR', committees: { name: 'Security Council' } }
};

/** The membership rows that say which delegations the reader heads. */
function headOf(...delegationIds: string[]) {
	return delegationIds.map((delegation_id) => ({ delegation_id }));
}

describe('listMyInvoices', () => {
	it('asks only for the invoices the reader pays for when they head no delegation', async () => {
		const { supabase, queries } = createStandInSupabase({
			delegation_members: { rows: [] },
			invoices: { rows: [LIST_ROW] }
		});

		await listMyInvoices(supabase, USER_ID);

		const invoiceQuery = queries.find((query) => query.table === 'invoices');

		expect(invoiceQuery?.eq).toEqual([['payer_user_id', USER_ID]]);
		expect(invoiceQuery?.or).toEqual([]);
	});

	it('also asks for the invoices of every delegation the reader heads', async () => {
		const { supabase, queries } = createStandInSupabase({
			delegation_members: { rows: headOf('delegation-1', 'delegation-2') },
			invoices: { rows: [] }
		});

		await listMyInvoices(supabase, USER_ID);

		const membershipQuery = queries.find((query) => query.table === 'delegation_members');
		const invoiceQuery = queries.find((query) => query.table === 'invoices');

		expect(membershipQuery?.eq).toEqual([
			['user_id', USER_ID],
			['role', 'head']
		]);
		expect(invoiceQuery?.or).toEqual([
			'payer_user_id.eq.user-1,delegation_id.in.(delegation-1,delegation-2)'
		]);
		expect(invoiceQuery?.eq).toEqual([]);
	});

	it('reads the conference and the delegation along with the invoice', async () => {
		const { supabase } = createStandInSupabase({
			delegation_members: { rows: [] },
			invoices: {
				rows: [{ ...LIST_ROW, delegations: { name: 'Delft University Team' } }]
			}
		});

		const invoices = await listMyInvoices(supabase, USER_ID);

		expect(invoices).toEqual([
			{
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
				delegationName: 'Delft University Team'
			}
		]);
	});

	it('gives an empty list rather than nothing when there are no invoices', async () => {
		const { supabase } = createStandInSupabase({ delegation_members: { rows: [] } });

		expect(await listMyInvoices(supabase, USER_ID)).toEqual([]);
	});

	it('says what went wrong when the database refuses the list', async () => {
		const { supabase } = createStandInSupabase({
			delegation_members: { rows: [] },
			invoices: { message: 'permission denied for table invoices' }
		});

		await expect(listMyInvoices(supabase, USER_ID)).rejects.toThrow(
			'Could not read your invoices: permission denied for table invoices'
		);
	});

	it('says what went wrong when the delegations cannot be read', async () => {
		const { supabase } = createStandInSupabase({
			delegation_members: { message: 'permission denied for table delegation_members' }
		});

		await expect(listMyInvoices(supabase, USER_ID)).rejects.toThrow(
			'Could not read the delegations you head: permission denied for table delegation_members'
		);
	});
});

describe('getInvoice', () => {
	it('gives the payer their invoice, the conference and the seat it is for', async () => {
		const { supabase, queries } = createStandInSupabase({ invoices: { row: PAGE_ROW } });

		const page = await getInvoice(supabase, 'invoice-1', USER_ID);

		expect(queries[0]).toMatchObject({ table: 'invoices', eq: [['id', 'invoice-1']] });
		expect(page?.invoice.number).toBe('DELFTMUN-2026-0031');
		expect(page?.invoice.quantity).toBe(1);
		expect(page?.invoice.unitAmountCents).toBe(6500);
		expect(page?.invoice.updatedAt).toBe('2026-09-01T09:00:00Z');
		expect(page?.collectsPaymentsManually).toBe(true);
		expect(page?.paymentInstructions).toBe('Transfer to NL12 ABCD 0123.');
		expect(page?.organisationName).toBe('Delft MUN Association');
		// The seat's country code travels with it, for the page to draw a flag from.
		expect(page?.seat).toEqual({
			seatName: 'France',
			committeeName: 'Security Council',
			countryCode: 'FR'
		});
	});

	it('answers nothing when there is no such invoice', async () => {
		const { supabase } = createStandInSupabase({ invoices: { row: null } });

		expect(await getInvoice(supabase, 'invoice-1', USER_ID)).toBeNull();
	});

	it('treats an id that is not a uuid as not found', async () => {
		const { supabase } = createStandInSupabase({
			invoices: { message: 'invalid input syntax for type uuid', code: '22P02' }
		});

		expect(await getInvoice(supabase, 'nonsense', USER_ID)).toBeNull();
	});

	it('answers nothing to somebody else, so the page can say 404', async () => {
		const { supabase, queries } = createStandInSupabase({
			invoices: { row: { ...PAGE_ROW, payer_user_id: 'somebody-else' } }
		});

		expect(await getInvoice(supabase, 'invoice-1', USER_ID)).toBeNull();
		// An individual invoice has no delegation, so there is nothing to ask about.
		expect(queries.some((query) => query.table === 'delegation_members')).toBe(false);
	});

	it('gives a delegation head the invoice raised against their delegation', async () => {
		const { supabase } = createStandInSupabase({
			invoices: {
				row: {
					...PAGE_ROW,
					payer_user_id: 'somebody-else',
					delegation_id: 'delegation-1',
					seats: null,
					delegations: { name: 'Delft University Team' }
				}
			},
			delegation_members: { rows: headOf('delegation-1') }
		});

		const page = await getInvoice(supabase, 'invoice-1', USER_ID);

		expect(page?.invoice.delegationName).toBe('Delft University Team');
		expect(page?.seat).toBeNull();
	});

	it('answers nothing to a member of the delegation who is not its head', async () => {
		const { supabase } = createStandInSupabase({
			invoices: {
				row: { ...PAGE_ROW, payer_user_id: 'somebody-else', delegation_id: 'delegation-1' }
			},
			delegation_members: { rows: [] }
		});

		expect(await getInvoice(supabase, 'invoice-1', USER_ID)).toBeNull();
	});

	it('does not ask the database a second time when the reader is the payer', async () => {
		const { supabase, queries } = createStandInSupabase({
			invoices: { row: { ...PAGE_ROW, delegation_id: 'delegation-1' } }
		});

		await getInvoice(supabase, 'invoice-1', USER_ID);

		expect(queries.map((query) => query.table)).toEqual(['invoices']);
	});

	it('leaves the seat out when its committee did not come back', async () => {
		// Row Level Security can hide the committee while leaving the seat
		// readable, and a half-named seat would read worse than none at all.
		const { supabase } = createStandInSupabase({
			invoices: { row: { ...PAGE_ROW, seats: { name: 'France', committees: null } } }
		});

		expect((await getInvoice(supabase, 'invoice-1', USER_ID))?.seat).toBeNull();
	});

	it('says what went wrong when the database refuses the query', async () => {
		const { supabase } = createStandInSupabase({
			invoices: { message: 'permission denied for table invoices' }
		});

		await expect(getInvoice(supabase, 'invoice-1', USER_ID)).rejects.toThrow(
			'Could not read the invoice: permission denied for table invoices'
		);
	});
});

/** One invoice as the organiser's query gets it back, under the database's own names. */
function organiserQueryRow(changes: Record<string, unknown> = {}) {
	return {
		id: 'invoice-1',
		number: 'ROTTERDAMMUN-2026-0001',
		payer_user_id: USER_ID,
		description: 'Delegate fee · Rotterdam Spring MUN 2026',
		quantity: 1,
		unit_amount_cents: 6500,
		amount_cents: 6500,
		currency: 'EUR',
		platform_fee_cents: 200,
		status: 'unpaid',
		paid_at: null,
		paid_method: null,
		created_at: '2026-09-01T09:00:00Z',
		invoice_internal_notes: null,
		delegations: null,
		seats: { name: 'France', committees: { abbreviation: 'UNSC' } },
		...changes
	};
}

describe('listConferenceInvoices', () => {
	it('asks for this conference only, and names each payer from their profile', async () => {
		const { supabase, queries } = createStandInSupabase({
			invoices: { rows: [organiserQueryRow()] },
			profiles: { rows: [{ id: USER_ID, full_name: 'Maria Kowalska' }] }
		});

		const invoices = await listConferenceInvoices(supabase, 'conference-1');

		const invoiceQuery = queries.find((query) => query.table === 'invoices');
		const profileQuery = queries.find((query) => query.table === 'profiles');

		expect(invoiceQuery?.eq).toEqual([['conference_id', 'conference-1']]);
		expect(profileQuery?.in).toEqual([['id', [USER_ID]]]);
		expect(invoices).toEqual([
			{
				id: 'invoice-1',
				number: 'ROTTERDAMMUN-2026-0001',
				payerName: 'Maria Kowalska',
				payerUserId: USER_ID,
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
				note: null
			}
		]);
	});

	it('reads window after window until one comes back empty', async () => {
		// Six hundred rows is more than one window of five hundred.
		const rows = Array.from({ length: 600 }, (_, index) =>
			organiserQueryRow({ id: `invoice-${index}` })
		);
		const { supabase, queries } = createStandInSupabase({
			invoices: { rows },
			profiles: { rows: [] }
		});

		const invoices = await listConferenceInvoices(supabase, 'conference-1');

		const windows = queries
			.filter((query) => query.table === 'invoices')
			.map((query) => query.range);

		expect(invoices).toHaveLength(600);
		expect(windows).toEqual([
			[0, 499],
			[500, 999],
			[600, 1099]
		]);
	});

	// The note comes from its own table, which the payer can never read, as one
	// object per invoice rather than a list.
	it('reads the organisers’ note off the row it was kept on', async () => {
		const { supabase } = createStandInSupabase({
			invoices: {
				rows: [organiserQueryRow({ invoice_internal_notes: { note: 'Paid by bank transfer' } })]
			},
			profiles: { rows: [] }
		});

		const [invoice] = await listConferenceInvoices(supabase, 'conference-1');

		expect(invoice.note).toBe('Paid by bank transfer');
	});

	it('calls a payer whose account is gone a deleted account, and asks nobody about them', async () => {
		const { supabase, queries } = createStandInSupabase({
			invoices: {
				rows: [
					organiserQueryRow({
						payer_user_id: null,
						seats: null,
						delegations: { name: 'Lycée Voltaire' }
					})
				]
			}
		});

		const [invoice] = await listConferenceInvoices(supabase, 'conference-1');

		expect(invoice.payerName).toBe('Deleted account');
		expect(invoice.delegationName).toBe('Lycée Voltaire');
		expect(invoice.seatLabel).toBeNull();
		expect(queries.some((query) => query.table === 'profiles')).toBe(false);
	});

	it('says what went wrong when the database refuses the list', async () => {
		const { supabase } = createStandInSupabase({
			invoices: { message: 'permission denied for table invoices' }
		});

		await expect(listConferenceInvoices(supabase, 'conference-1')).rejects.toThrow(
			'Could not read the invoices: permission denied for table invoices'
		);
	});
});

describe('withPayerEmails', () => {
	it('adds each payer email it may read, and leaves the others empty', async () => {
		const { supabase: listClient } = createStandInSupabase({
			invoices: {
				rows: [
					organiserQueryRow(),
					organiserQueryRow({ id: 'invoice-2', payer_user_id: 'user-2' }),
					organiserQueryRow({ id: 'invoice-3', payer_user_id: null })
				]
			},
			profiles: { rows: [] }
		});
		const invoices = await listConferenceInvoices(listClient, 'conference-1');

		// Only `user-1`'s details come back, the way Row Level Security would hide
		// somebody the organiser may not read.
		const { supabase, queries } = createStandInSupabase({
			staff_contact_details: { rows: [{ user_id: USER_ID, email: 'maria@example.com' }] },
			staff_welfare_details: { rows: [] }
		});

		const exported = await withPayerEmails(supabase, invoices);

		expect(exported.map((invoice) => invoice.payerEmail)).toEqual([
			'maria@example.com',
			null,
			null
		]);
		expect(queries[0].in).toEqual([['user_id', [USER_ID, 'user-2']]]);
	});
});

describe('getConferenceInvoice', () => {
	it('asks inside the conference', async () => {
		const invoice = { id: 'invoice-1', number: 'ROTTERDAMMUN-2026-0001', status: 'unpaid' };
		const { supabase, queries } = createStandInSupabase({ invoices: { row: invoice } });

		expect(await getConferenceInvoice(supabase, 'conference-1', 'invoice-1')).toEqual(invoice);
		expect(queries[0].eq).toEqual([
			['conference_id', 'conference-1'],
			['id', 'invoice-1']
		]);
	});

	it('answers nothing for an id that is not a uuid, rather than failing', async () => {
		const { supabase } = createStandInSupabase({
			invoices: { message: 'invalid input syntax for type uuid', code: '22P02' }
		});

		expect(await getConferenceInvoice(supabase, 'conference-1', 'nonsense')).toBeNull();
	});
});

describe('settleInvoice', () => {
	const INVOICE = { id: 'invoice-1', number: 'ROTTERDAMMUN-2026-0001', status: 'unpaid' as const };
	const NOW = new Date('2026-09-22T10:00:00Z');

	it('marks an invoice paid by hand, with the moment, and keeps the note in its own table', async () => {
		const { supabase, queries } = createStandInSupabase({
			invoices: { rows: [{ id: 'invoice-1' }] }
		});

		const hasMoved = await settleInvoice(supabase, INVOICE, 'markPaid', 'Cash at desk', NOW);

		expect(hasMoved).toBe(true);
		// The moment is sent, and the database's trigger overwrites it with its
		// own clock; the note is not on the invoice at all any more.
		expect(queries[0].update).toEqual({
			status: 'paid',
			paid_at: '2026-09-22T10:00:00.000Z',
			paid_method: 'manual'
		});
		// Only while it is still the status it was read with.
		expect(queries[0].eq).toEqual([
			['id', 'invoice-1'],
			['status', 'unpaid']
		]);
		expect(queries[1].table).toBe('invoice_internal_notes');
		expect(queries[1].upsert).toEqual({ invoice_id: 'invoice-1', note: 'Cash at desk' });
	});

	it('waives or voids with nothing but the status, and writes no note when none was typed', async () => {
		const { supabase, queries } = createStandInSupabase({
			invoices: { rows: [{ id: 'invoice-1' }] }
		});

		await settleInvoice(supabase, INVOICE, 'void', null, NOW);

		expect(queries[0].update).toEqual({ status: 'void' });
		expect(queries).toHaveLength(1);
	});

	it('says so when somebody else changed the invoice first, and keeps no note about it', async () => {
		const { supabase, queries } = createStandInSupabase({ invoices: { rows: [] } });

		expect(await settleInvoice(supabase, INVOICE, 'waive', 'Agreed by email', NOW)).toBe(false);
		// A note about a change that did not happen would mislead the next reader.
		expect(queries.some((query) => query.table === 'invoice_internal_notes')).toBe(false);
	});

	it('says what went wrong when the note cannot be kept', async () => {
		const { supabase } = createStandInSupabase({
			invoices: { rows: [{ id: 'invoice-1' }] },
			invoice_internal_notes: { message: 'permission denied for table invoice_internal_notes' }
		});

		await expect(settleInvoice(supabase, INVOICE, 'markPaid', 'Cash at desk', NOW)).rejects.toThrow(
			'Could not keep the note on the invoice: permission denied for table invoice_internal_notes'
		);
	});

	it('says what went wrong when the database refuses the change', async () => {
		const { supabase } = createStandInSupabase({
			invoices: { message: 'An invoice cannot go from paid to void' }
		});

		await expect(settleInvoice(supabase, INVOICE, 'void', null, NOW)).rejects.toThrow(
			'Could not change the invoice: An invoice cannot go from paid to void'
		);
	});
});

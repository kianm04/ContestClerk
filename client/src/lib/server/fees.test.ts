import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	createFee,
	deleteFee,
	getFee,
	listFees,
	listPublicFees,
	moveFee,
	readPaymentSettings,
	updateConferenceSettings,
	updateFee,
	type FeeInput
} from './fees';

// These tests are about the decisions this module makes: which columns it asks
// for, which conference it asks inside, where a new fee lands in the list, and
// what a refused delete answers. Nothing here talks to a database; the stand-in
// client below writes down what it was asked for and answers with fixed rows.
// Whether the database really lets an organiser read and write those rows is
// Row Level Security's decision, and that is tested in `tests/db/fees.test.ts`.

/** An error in the shape the real client reports one. */
type QueryError = { message: string };

/** What one query this module sent was asking for. */
type RecordedQuery = {
	/** The relation `.from(...)` named. */
	table: string;
	/** The columns `.select(...)` was given, or `''` for a query that read nothing back. */
	columns: string;
	/** The rows `.insert(...)` was given, or `null` when the query added none. */
	inserted: Record<string, unknown>[] | null;
	/** The columns `.update(...)` was given, or `null` when the query changed nothing. */
	updated: Record<string, unknown> | null;
	/** `true` when the query removed rows rather than reading or changing them. */
	isDelete: boolean;
	eq: [string, unknown][];
	/** `[column, value]` for every `.lt(...)` and `.gt(...)`, which look for a neighbour. */
	lt: [string, unknown][];
	gt: [string, unknown][];
	/** `[column, ascending]` for every `.order(...)`. */
	order: [string, boolean][];
	limit: number[];
};

/** What the stand-in should answer with. Everything here has a harmless default. */
type StandInAnswers = {
	/**
	 * The rows each relation answers with, as a list of answers rather than as
	 * one: adding a fee asks the `fees` table twice, once for the position the new
	 * fee goes after and once to insert it, and those two differ. Every query takes
	 * the next answer along, and the last one is repeated once the list runs out,
	 * so a relation that always answers the same thing is a list of one.
	 */
	rows?: Record<string, unknown[][]>;
	/**
	 * The message each query to a relation fails with, as a list for the same
	 * reason, where `null` is a query that works. `{ fees: [null, 'refused'] }`
	 * is a relation whose first query is fine and whose second is turned away.
	 */
	errors?: Record<string, (string | null)[]>;
};

/** The rows the nth query to a relation answers with. */
function rowsForQuery(answers: unknown[][], index: number): unknown[] {
	if (answers.length === 0) {
		return [];
	}

	return answers[Math.min(index, answers.length - 1)];
}

/** The message the nth query to a relation fails with, or `null` when it works. */
function messageForQuery(answers: (string | null)[], index: number): string | null {
	if (answers.length === 0) {
		return null;
	}

	return answers[Math.min(index, answers.length - 1)];
}

/** What an awaited query answers with: a list of rows, or nothing and a message. */
type ListAnswer = {
	data: unknown[] | null;
	error: QueryError | null;
};

/** What a chain ending in `maybeSingle` answers with: one row rather than a list. */
type SingleRowAnswer = {
	data: unknown;
	error: QueryError | null;
};

/** The end of a chain that asked for one row rather than a list. */
type SingleRowBuilder = {
	overrideTypes: () => Promise<SingleRowAnswer>;
};

/** One step of a query. Every step hands the builder back, which is what chains them. */
type QueryBuilder = {
	select: (columns: string) => QueryBuilder;
	insert: (rows: Record<string, unknown>) => QueryBuilder;
	update: (columns: Record<string, unknown>) => QueryBuilder;
	delete: () => QueryBuilder;
	eq: (column: string, value: unknown) => QueryBuilder;
	lt: (column: string, value: unknown) => QueryBuilder;
	gt: (column: string, value: unknown) => QueryBuilder;
	order: (column: string, options: { ascending: boolean }) => QueryBuilder;
	limit: (count: number) => QueryBuilder;
	maybeSingle: () => SingleRowBuilder;
	overrideTypes: () => Promise<ListAnswer>;
	/** What makes a chain that is awaited without `overrideTypes` on the end work. */
	then: (resolve: (answer: ListAnswer) => void) => void;
};

/**
 * A stand-in Supabase client that writes down every query and can be written to.
 *
 * The real client is a builder: `.from(...)` gives back an object with
 * `.select(...)` on it, `.select(...)` one with `.eq(...)` on it, and so on.
 * Each step adds one condition to a query that is only sent once the chain is
 * awaited. This copies that shape: every step records its arguments and hands
 * the same builder back, and the awaited answer is whatever `answers` asked for
 * for that relation. A chain ending in `maybeSingle` is answered with the first
 * of those rows, the way the real one answers with the first match.
 */
function createStandInSupabase(answers: StandInAnswers = {}): {
	supabase: SupabaseClient;
	queries: RecordedQuery[];
} {
	const queries: RecordedQuery[] = [];
	// How many queries each relation has been sent, so the next answer along can
	// be found for it.
	const answersUsed = new Map<string, number>();

	function builderFor(table: string): QueryBuilder {
		const query: RecordedQuery = {
			table,
			columns: '',
			inserted: null,
			updated: null,
			isDelete: false,
			eq: [],
			lt: [],
			gt: [],
			order: [],
			limit: []
		};
		queries.push(query);

		const used = answersUsed.get(table) ?? 0;
		answersUsed.set(table, used + 1);

		const rows = rowsForQuery(answers.rows?.[table] ?? [], used);
		const message = messageForQuery(answers.errors?.[table] ?? [], used);
		const error = message ? { message } : null;
		const listAnswer: ListAnswer = { data: message ? null : rows, error };
		const singleRowAnswer: SingleRowAnswer = { data: message ? null : (rows[0] ?? null), error };

		const builder: QueryBuilder = {
			select: (columns) => {
				query.columns = columns;
				return builder;
			},
			insert: (rows) => {
				query.inserted = [rows];
				return builder;
			},
			update: (columns) => {
				query.updated = columns;
				return builder;
			},
			delete: () => {
				query.isDelete = true;
				return builder;
			},
			eq: (column, value) => {
				query.eq.push([column, value]);
				return builder;
			},
			lt: (column, value) => {
				query.lt.push([column, value]);
				return builder;
			},
			gt: (column, value) => {
				query.gt.push([column, value]);
				return builder;
			},
			order: (column, options) => {
				query.order.push([column, options.ascending]);
				return builder;
			},
			limit: (count) => {
				query.limit.push(count);
				return builder;
			},
			maybeSingle: () => ({ overrideTypes: async () => singleRowAnswer }),
			// In the real client `overrideTypes` changes the type of the answer and
			// not the answer itself, so here it is simply where the chain ends.
			overrideTypes: async () => listAnswer,
			then: (resolve) => resolve(listAnswer)
		};

		return builder;
	}

	// A function call is recorded like a relation named after it, `rpc:<name>`,
	// with its arguments where an insert's rows would be.
	function rpcFor(name: string, args: Record<string, unknown>): QueryBuilder {
		const builder = builderFor(`rpc:${name}`);
		queries[queries.length - 1].inserted = [args];

		return builder;
	}

	const supabase = { from: builderFor, rpc: rpcFor };

	return { supabase: supabase as unknown as SupabaseClient, queries };
}

/** The first query the module sent to one relation, so a test can read its conditions back. */
function queryOn(queries: RecordedQuery[], table: string): RecordedQuery {
	const query = queries.find((sent) => sent.table === table);

	if (!query) {
		throw new Error(`Nothing was ever sent to "${table}"`);
	}

	return query;
}

/** One `fees` row, which carries no invoice count: that comes from `fee_invoice_counts`. */
function publicFeeRow(changes: Record<string, unknown> = {}) {
	return {
		id: 'fee-1',
		name: 'Early bird delegate fee',
		amount_cents: 5500,
		applies_to: 'individual',
		valid_from: null,
		valid_until: '2027-11-01T00:00:00Z',
		position: 0,
		...changes
	};
}

/** What `fee_invoice_counts` answers: twelve invoices point at the first fee. */
const INVOICE_COUNTS = [[{ fee_id: 'fee-1', invoice_count: 12 }]];

/** What the fee form hands over, already checked and already turned into cents. */
function feeInput(changes: Partial<FeeInput> = {}): FeeInput {
	return {
		name: 'Delegate fee',
		amountCents: 6500,
		appliesTo: 'individual',
		validFrom: null,
		validUntil: null,
		...changes
	};
}

describe('readPaymentSettings', () => {
	it('reads the three columns the page needs in one query', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: {
				conferences: [
					[
						{
							currency: 'EUR',
							collects_payments_manually: true,
							payment_instructions: 'Pay by bank transfer.'
						}
					]
				]
			}
		});

		const settings = await readPaymentSettings(supabase, 'conference-1');

		// Three columns the `Conference` type does not carry, asked for together
		// rather than one query each.
		expect(queryOn(queries, 'conferences').columns).toBe(
			'currency, collects_payments_manually, payment_instructions'
		);
		expect(queryOn(queries, 'conferences').eq).toEqual([['id', 'conference-1']]);
		expect(settings).toEqual({
			currency: 'EUR',
			collectsPaymentsManually: true,
			paymentInstructions: 'Pay by bank transfer.'
		});
	});

	it('raises when the query fails', async () => {
		const { supabase } = createStandInSupabase({
			errors: { conferences: ['permission denied for table conferences'] }
		});

		await expect(readPaymentSettings(supabase, 'conference-1')).rejects.toThrow(
			'permission denied'
		);
	});

	it('raises rather than filling in defaults when there is no such conference', async () => {
		const { supabase } = createStandInSupabase();

		// The layout above the page has already read this conference, so a missing
		// row is a fault rather than something to show the organiser a default for.
		await expect(readPaymentSettings(supabase, 'conference-1')).rejects.toThrow('conference-1');
	});
});

describe('updateConferenceSettings', () => {
	it('writes the two payment columns and nothing else', async () => {
		const { supabase, queries } = createStandInSupabase();

		await updateConferenceSettings(supabase, 'conference-1', {
			collectsPaymentsManually: true,
			paymentInstructions: 'Pay by bank transfer.'
		});

		// The currency is read by this module but never written by it: the details
		// editor owns it.
		expect(queryOn(queries, 'conferences').updated).toEqual({
			collects_payments_manually: true,
			payment_instructions: 'Pay by bank transfer.'
		});
		expect(queryOn(queries, 'conferences').eq).toEqual([['id', 'conference-1']]);
	});

	it('raises when the update is refused', async () => {
		const { supabase } = createStandInSupabase({
			errors: { conferences: ['new row violates row-level security policy'] }
		});

		await expect(
			updateConferenceSettings(supabase, 'conference-1', {
				collectsPaymentsManually: false,
				paymentInstructions: null
			})
		).rejects.toThrow('row-level security');
	});
});

describe('listFees', () => {
	it("asks for one conference's fees in the organiser's own order, with the invoice count", async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: {
				fees: [[publicFeeRow(), publicFeeRow({ id: 'fee-2', position: 1 })]],
				'rpc:fee_invoice_counts': INVOICE_COUNTS
			}
		});

		const fees = await listFees(supabase, 'conference-1');

		// The counts come from one call for the whole conference, past the invoice
		// policies, because an editor of the fees may not read the invoices.
		expect(queryOn(queries, 'rpc:fee_invoice_counts').inserted).toEqual([
			{ conference_id: 'conference-1' }
		]);
		expect(queryOn(queries, 'fees').columns).not.toContain('invoices');
		expect(queryOn(queries, 'fees').eq).toEqual([['conference_id', 'conference-1']]);
		// `id` is the tie-break, because two fees may share a position.
		expect(queryOn(queries, 'fees').order).toEqual([
			['position', true],
			['id', true]
		]);
		expect(fees[0].amountCents).toBe(5500);
		expect(fees[0].invoiceCount).toBe(12);
		// A fee nobody has been charged has no entry at all rather than a zero in one.
		expect(fees[1].invoiceCount).toBe(0);
	});

	it('answers with an empty list when the conference has no fees yet', async () => {
		const { supabase } = createStandInSupabase();

		expect(await listFees(supabase, 'conference-1')).toEqual([]);
	});

	it('raises when the query fails', async () => {
		const { supabase } = createStandInSupabase({ errors: { fees: ['no such column'] } });

		await expect(listFees(supabase, 'conference-1')).rejects.toThrow('Could not list the fees');
	});

	it('raises when the invoices cannot be counted', async () => {
		const { supabase } = createStandInSupabase({
			errors: { 'rpc:fee_invoice_counts': ['permission denied'] }
		});

		await expect(listFees(supabase, 'conference-1')).rejects.toThrow(
			'Could not count the invoices of the fees'
		);
	});
});

describe('listPublicFees', () => {
	it('asks for the same fees in the same order, without the invoice count', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { fees: [[publicFeeRow(), publicFeeRow({ id: 'fee-2', position: 1 })]] }
		});

		const fees = await listPublicFees(supabase, 'conference-1');

		// `permissions.md` gives `invoices` to the payer, the delegation head and
		// the organisers, so an applicant asking how many point at a fee would be
		// asking for something they may not read.
		expect(queryOn(queries, 'fees').columns).not.toContain('invoices');
		expect(queryOn(queries, 'fees').eq).toEqual([['conference_id', 'conference-1']]);
		expect(queryOn(queries, 'fees').order).toEqual([
			['position', true],
			['id', true]
		]);
		expect(fees).toHaveLength(2);
		expect(fees[0].amountCents).toBe(5500);
		// A `Fee` and not a `ManagedFee`: there is no count on it to show.
		expect(Object.keys(fees[0])).not.toContain('invoiceCount');
	});

	it('answers with an empty list when the conference charges nothing', async () => {
		const { supabase } = createStandInSupabase();

		expect(await listPublicFees(supabase, 'conference-1')).toEqual([]);
	});

	it('raises when the query fails', async () => {
		const { supabase } = createStandInSupabase({ errors: { fees: ['no such column'] } });

		await expect(listPublicFees(supabase, 'conference-1')).rejects.toThrow(
			'Could not list the fees'
		);
	});
});

describe('getFee', () => {
	it('asks for the fee inside this conference, so an id from another cannot be reached', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { fees: [[publicFeeRow()]], 'rpc:fee_invoice_counts': INVOICE_COUNTS }
		});

		const fee = await getFee(supabase, 'conference-1', 'fee-1');

		expect(queryOn(queries, 'fees').eq).toEqual([
			['conference_id', 'conference-1'],
			['id', 'fee-1']
		]);
		expect(fee?.name).toBe('Early bird delegate fee');
		expect(fee?.validUntil).toBe('2027-11-01T00:00:00Z');
		expect(fee?.invoiceCount).toBe(12);
	});

	it('answers with nothing when this conference has no fee with that id', async () => {
		const { supabase } = createStandInSupabase();

		expect(await getFee(supabase, 'conference-1', 'fee-9')).toBeNull();
	});

	it('raises when the query fails', async () => {
		const { supabase } = createStandInSupabase({ errors: { fees: ['no such column'] } });

		await expect(getFee(supabase, 'conference-1', 'fee-1')).rejects.toThrow(
			'Could not load the fee'
		);
	});
});

describe('createFee', () => {
	it('puts a new fee one place past the one furthest down the list', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { fees: [[{ position: 2 }], []] }
		});

		await createFee(supabase, 'conference-1', feeInput({ validUntil: '2027-11-01T00:00:00Z' }));

		// Where the fee goes is read fresh, highest position first, because the list
		// the organiser was looking at may be an hour old by the time they save.
		expect(queries[0].order).toEqual([['position', false]]);
		expect(queries[0].limit).toEqual([1]);
		expect(queries[1].inserted).toEqual([
			{
				conference_id: 'conference-1',
				name: 'Delegate fee',
				amount_cents: 6500,
				applies_to: 'individual',
				valid_from: null,
				valid_until: '2027-11-01T00:00:00Z',
				position: 3
			}
		]);
	});

	it('puts the first fee of a conference at the top of the list', async () => {
		const { supabase, queries } = createStandInSupabase();

		await createFee(supabase, 'conference-1', feeInput());

		expect(queries[1].inserted?.[0].position).toBe(0);
	});

	it('raises when the insert is refused', async () => {
		const { supabase } = createStandInSupabase({
			errors: { fees: [null, 'new row violates row-level security policy'] }
		});

		await expect(createFee(supabase, 'conference-1', feeInput())).rejects.toThrow(
			'row-level security'
		);
	});
});

describe('fee descriptions', () => {
	it('writes a description only when the caller gives one', async () => {
		const withDescription = createStandInSupabase();
		await createFee(
			withDescription.supabase,
			'conference-1',
			feeInput({ description: 'Covers lunch on both days.' })
		);
		expect(withDescription.queries[1].inserted?.[0].description).toBe('Covers lunch on both days.');

		const without = createStandInSupabase();
		await updateFee(without.supabase, 'fee-1', feeInput());
		expect(queryOn(without.queries, 'fees').updated).not.toHaveProperty('description');
	});
});

describe('updateFee', () => {
	it('never sends the conference or the position', async () => {
		const { supabase, queries } = createStandInSupabase();

		await updateFee(
			supabase,
			'fee-1',
			feeInput({ name: 'Standard delegate fee', amountCents: 7500 })
		);

		const changed = queryOn(queries, 'fees').updated ?? {};

		// Migration 0011's trigger refuses a change to `conference_id`, and `moveFee`
		// owns `position`, so neither is ever sent from here.
		expect(Object.keys(changed)).not.toContain('conference_id');
		expect(Object.keys(changed)).not.toContain('position');
		expect(changed.name).toBe('Standard delegate fee');
		// The price may change even while invoices point at the fee; each of those
		// keeps the amount it was written with.
		expect(changed.amount_cents).toBe(7500);
		expect(queryOn(queries, 'fees').eq).toEqual([['id', 'fee-1']]);
	});

	it('raises when the update is refused', async () => {
		const { supabase } = createStandInSupabase({
			errors: { fees: ['new row violates row-level security policy'] }
		});

		await expect(updateFee(supabase, 'fee-1', feeInput())).rejects.toThrow('row-level security');
	});
});

describe('moveFee', () => {
	it('swaps places with the fee above', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { fees: [[{ id: 'fee-2', position: 1 }], [{ id: 'fee-1', position: 0 }]] }
		});

		await moveFee(supabase, 'conference-1', 'fee-2', 'up');

		// Up the list is towards the lower positions, so the neighbour is the
		// highest position below this one.
		expect(queries[1].lt).toEqual([['position', 1]]);
		expect(queries[1].order).toEqual([
			['position', false],
			['id', false]
		]);
		expect(queries[1].limit).toEqual([1]);
		// The two trade positions, and no other fee is touched.
		expect(queries[2].updated).toEqual({ position: 0 });
		expect(queries[2].eq).toEqual([['id', 'fee-2']]);
		expect(queries[3].updated).toEqual({ position: 1 });
		expect(queries[3].eq).toEqual([['id', 'fee-1']]);
	});

	it('does nothing at all at the top of the list', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { fees: [[{ id: 'fee-1', position: 0 }], []] }
		});

		await moveFee(supabase, 'conference-1', 'fee-1', 'up');

		// The fee at the top has nothing above it, and the arrow there does nothing
		// rather than failing.
		const changes = queries.filter((query) => query.updated !== null);

		expect(changes).toEqual([]);
	});

	it('does nothing at all at the bottom of the list', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { fees: [[{ id: 'fee-3', position: 2 }], []] }
		});

		await moveFee(supabase, 'conference-1', 'fee-3', 'down');

		// Down the list is towards the higher positions, so the neighbour is looked
		// for above this one, and there is none.
		expect(queries[1].gt).toEqual([['position', 2]]);

		const changes = queries.filter((query) => query.updated !== null);

		expect(changes).toEqual([]);
	});

	it('moves nothing when this conference has no fee with that id', async () => {
		const { supabase, queries } = createStandInSupabase();

		await moveFee(supabase, 'conference-1', 'fee-9', 'up');

		// The conference is part of the question, so a fee id from somebody else's
		// conference moves nothing, and no neighbour is even looked for.
		expect(queries).toHaveLength(1);
		expect(queries[0].eq).toEqual([
			['conference_id', 'conference-1'],
			['id', 'fee-9']
		]);
	});

	it("raises when the fee's place in the list could not be read", async () => {
		const { supabase } = createStandInSupabase({
			errors: { fees: ['permission denied for table fees'] }
		});

		await expect(moveFee(supabase, 'conference-1', 'fee-1', 'up')).rejects.toThrow(
			'permission denied'
		);
	});
});

describe('deleteFee', () => {
	it('answers yes when the fee was really deleted', async () => {
		const { supabase, queries } = createStandInSupabase({ rows: { fees: [[{ id: 'fee-1' }]] } });

		expect(await deleteFee(supabase, 'fee-1')).toBe(true);
		expect(queryOn(queries, 'fees').isDelete).toBe(true);
		expect(queryOn(queries, 'fees').eq).toEqual([['id', 'fee-1']]);
	});

	it('answers no when Row Level Security refused, which is not an error', async () => {
		const { supabase } = createStandInSupabase({ rows: { fees: [[]] } });

		// The delete policy hides a fee an invoice points at, so nothing matches,
		// nothing is deleted and no message comes back. Asking which ids were
		// deleted is what tells that apart from a delete that worked.
		expect(await deleteFee(supabase, 'fee-1')).toBe(false);
	});

	it('raises when the delete itself fails', async () => {
		const { supabase } = createStandInSupabase({ errors: { fees: ['connection closed'] } });

		await expect(deleteFee(supabase, 'fee-1')).rejects.toThrow('Could not delete the fee');
	});
});

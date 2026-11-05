import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readApplicationCardFacts } from './application-card-facts';

// These tests are about the questions `readApplicationCardFacts` asks: which
// relations, which filters, how many ids at a time, and how it turns the rows
// into the cards' facts. Nothing here talks to a database; the stand-in client
// below writes down what it was asked for and answers from fixed rows. What
// each query may read is Row Level Security's decision, tested in `tests/db/`.

/** What one query the module sent was asking for. */
type RecordedQuery = {
	/** The relation `.from(...)` named. */
	table: string;
	/** The columns `.select(...)` asked for. */
	columns: string;
	/** `[column, value]` for every `.eq(...)`. */
	eq: [string, unknown][];
	/** `[column, value]` for every `.neq(...)`. */
	neq: [string, unknown][];
	/** `[column, values]` for every `.in(...)`. */
	in: [string, unknown[]][];
};

/** A row as the stand-in holds it: whatever columns the test gives it. */
type StandInRow = Record<string, unknown>;

/** What the stand-in answers for one relation: its rows, or an error. */
type StandInAnswer = { rows?: StandInRow[]; error?: string };

/**
 * A client that answers every query on a relation with the rows given for it,
 * and writes down what each query asked for in `queries`.
 *
 * `.in(column, values)` keeps only the rows whose column is one of the values,
 * the way the database would, so a test can see each batch get its own rows.
 * The module's queries end in `.overrideTypes()`, and awaiting that is what
 * sends them, so it hands back the answer.
 */
function standInClient(answers: Record<string, StandInAnswer>): {
	supabase: SupabaseClient;
	queries: RecordedQuery[];
} {
	const queries: RecordedQuery[] = [];

	const supabase = {
		from(table: string) {
			const query: RecordedQuery = { table, columns: '', eq: [], neq: [], in: [] };
			queries.push(query);
			const answer = answers[table] ?? {};

			const builder = {
				select(columns: string) {
					query.columns = columns;
					return builder;
				},
				eq(column: string, value: unknown) {
					query.eq.push([column, value]);
					return builder;
				},
				neq(column: string, value: unknown) {
					query.neq.push([column, value]);
					return builder;
				},
				in(column: string, values: unknown[]) {
					query.in.push([column, values]);
					return builder;
				},
				overrideTypes() {
					if (answer.error) {
						return Promise.resolve({ data: null, error: { message: answer.error } });
					}

					const matching = (answer.rows ?? []).filter((row) =>
						query.in.every(([column, values]) => values.includes(row[column]))
					);

					return Promise.resolve({ data: matching, error: null });
				}
			};

			return builder;
		}
	};

	return { supabase: supabase as unknown as SupabaseClient, queries };
}

/** The queries the module sent to one relation, in the order it sent them. */
function queriesTo(queries: RecordedQuery[], table: string): RecordedQuery[] {
	return queries.filter((query) => query.table === table);
}

/** `count` made-up conference ids, `conference-0` onwards. */
function conferenceIds(count: number): string[] {
	return Array.from({ length: count }, (_, index) => `conference-${index}`);
}

describe('readApplicationCardFacts', () => {
	it("reads each conference's place and what it asks of a position paper", async () => {
		const { supabase } = standInClient({
			conferences: {
				rows: [
					{
						id: 'conference-1',
						city: 'The Hague',
						country_code: 'NL',
						position_paper_required: true,
						position_paper_deadline: '2026-11-01T23:00:00Z'
					}
				]
			}
		});

		const facts = await readApplicationCardFacts(supabase, 'user-1', ['conference-1'], []);

		expect(facts.conferences).toEqual([
			{
				conferenceId: 'conference-1',
				city: 'The Hague',
				countryCode: 'NL',
				isPositionPaperRequired: true,
				positionPaperDeadline: '2026-11-01T23:00:00Z'
			}
		]);
	});

	it('asks about at most 100 conferences in one query', async () => {
		const { supabase, queries } = standInClient({});

		await readApplicationCardFacts(supabase, 'user-1', conferenceIds(150), []);

		const batchSizes = queriesTo(queries, 'conferences').map((query) => query.in[0][1].length);
		expect(batchSizes).toEqual([100, 50]);
	});

	it('asks nothing about conferences or delegations when there are none', async () => {
		const { supabase, queries } = standInClient({});

		const facts = await readApplicationCardFacts(supabase, 'user-1', [], []);

		expect(queriesTo(queries, 'conferences')).toEqual([]);
		expect(queriesTo(queries, 'delegations')).toEqual([]);
		expect(facts).toEqual({ conferences: [], seats: [], invoices: [], delegations: [] });
	});

	it("reads only this reader's seats, and which of them have a position paper in", async () => {
		const { supabase, queries } = standInClient({
			seats: {
				rows: [
					{ id: 'seat-1', committees: { slug: 'unsc', conference_id: 'conference-1' } },
					{ id: 'seat-2', committees: { slug: 'unhrc', conference_id: 'conference-2' } }
				]
			},
			documents: { rows: [{ seat_id: 'seat-2' }] }
		});

		const facts = await readApplicationCardFacts(supabase, 'user-1', [], []);

		// Row Level Security would let an organiser read every seat at their
		// conference, so the module names the reader itself.
		expect(queriesTo(queries, 'seats')[0].eq).toEqual([['user_id', 'user-1']]);

		const papers = queriesTo(queries, 'documents')[0];
		expect(papers.eq).toEqual([['kind', 'position_paper']]);
		expect(papers.in).toEqual([['seat_id', ['seat-1', 'seat-2']]]);

		expect(facts.seats).toEqual([
			{ conferenceId: 'conference-1', committeeSlug: 'unsc', hasPositionPaper: false },
			{ conferenceId: 'conference-2', committeeSlug: 'unhrc', hasPositionPaper: true }
		]);
	});

	it('reads the invoices this reader pays, leaving out the void ones', async () => {
		const { supabase, queries } = standInClient({
			invoices: {
				rows: [
					{
						id: 'invoice-1',
						conference_id: 'conference-1',
						status: 'unpaid',
						created_at: '2026-09-01T10:00:00Z'
					}
				]
			}
		});

		const facts = await readApplicationCardFacts(supabase, 'user-1', [], []);

		const invoices = queriesTo(queries, 'invoices')[0];
		expect(invoices.eq).toEqual([['payer_user_id', 'user-1']]);
		expect(invoices.neq).toEqual([['status', 'void']]);
		expect(facts.invoices).toEqual([
			{
				id: 'invoice-1',
				conferenceId: 'conference-1',
				status: 'unpaid',
				createdAt: '2026-09-01T10:00:00Z'
			}
		]);
	});

	it('reads when each delegation was sent and last changed', async () => {
		const { supabase } = standInClient({
			delegations: {
				rows: [
					{
						id: 'delegation-1',
						submitted_at: '2026-09-06T12:00:00Z',
						updated_at: '2026-09-07T08:00:00Z'
					},
					{ id: 'delegation-2', submitted_at: null, updated_at: '2026-09-02T08:00:00Z' }
				]
			}
		});

		const facts = await readApplicationCardFacts(supabase, 'user-1', [], ['delegation-1']);

		// Only the delegation asked about comes back, as `.in` would have it.
		expect(facts.delegations).toEqual([
			{
				delegationId: 'delegation-1',
				submittedAt: '2026-09-06T12:00:00Z',
				updatedAt: '2026-09-07T08:00:00Z'
			}
		]);
	});

	it('throws, naming what it could not read, when a lookup fails', async () => {
		const { supabase } = standInClient({ invoices: { error: 'permission denied' } });

		await expect(readApplicationCardFacts(supabase, 'user-1', [], [])).rejects.toThrow(
			'Could not list your invoices: permission denied'
		);
	});
});

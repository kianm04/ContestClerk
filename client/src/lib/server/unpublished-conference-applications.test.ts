import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { countMyApplicationsAtUnpublishedConferences } from './unpublished-conference-applications';

// These tests are about the questions `countMyApplicationsAtUnpublishedConferences`
// asks: which relations, which join, which filters, and what it does with the
// two answers. Nothing here talks to a database; the stand-in client below
// writes down what it was asked for and answers with fixed counts. That the
// database really leaves an unpublished conference out of the embed is Row
// Level Security's decision, and the browser test in
// `tests/e2e/applications.spec.ts` unpublishes a real conference to show it.

/** What one query the module sent was asking for. */
type RecordedQuery = {
	/** The relation `.from(...)` named. */
	table: string;
	/** The columns `.select(...)` asked for. */
	columns: string;
	/** The options `.select(...)` was given, which is where a count is asked for. */
	selectOptions: unknown;
	eq: [string, unknown][];
	/** `[column, value]` for every `.is(...)`. */
	is: [string, unknown][];
};

/** What the stand-in should answer for one relation. */
type StandInAnswer = { count: number | null; error?: string };

/**
 * A client that answers every query on a relation with the count given for it,
 * and writes down what each query asked for in `queries`.
 *
 * The module's queries end in `.is(...)`, and awaiting that is what sends them,
 * so `is` hands back the answer as well as being a step of the chain.
 */
function standInClient(answers: Record<string, StandInAnswer>): {
	supabase: SupabaseClient;
	queries: RecordedQuery[];
} {
	const queries: RecordedQuery[] = [];

	const supabase = {
		from(table: string) {
			const query: RecordedQuery = { table, columns: '', selectOptions: null, eq: [], is: [] };
			queries.push(query);
			const answer = answers[table] ?? { count: 0 };

			const builder = {
				select(columns: string, options: unknown) {
					query.columns = columns;
					query.selectOptions = options;
					return builder;
				},
				eq(column: string, value: unknown) {
					query.eq.push([column, value]);
					return builder;
				},
				is(column: string, value: unknown) {
					query.is.push([column, value]);
					return Promise.resolve({
						count: answer.count,
						error: answer.error ? { message: answer.error } : null
					});
				}
			};

			return builder;
		}
	};

	return { supabase: supabase as unknown as SupabaseClient, queries };
}

describe('countMyApplicationsAtUnpublishedConferences', () => {
	it("counts this reader's applications whose conference did not come back", async () => {
		const { supabase, queries } = standInClient({});

		await countMyApplicationsAtUnpublishedConferences(supabase, 'user-1');

		const applications = queries.find((query) => query.table === 'applications');
		// A left join, with no `!inner`, so the row still comes back without it.
		expect(applications?.columns).toBe('id, conferences(id)');
		expect(applications?.selectOptions).toEqual({ count: 'exact', head: true });
		expect(applications?.eq).toEqual([['user_id', 'user-1']]);
		expect(applications?.is).toEqual([['conferences', null]]);
	});

	it("counts this reader's delegation memberships whose conference did not come back", async () => {
		const { supabase, queries } = standInClient({});

		await countMyApplicationsAtUnpublishedConferences(supabase, 'user-1');

		const memberships = queries.find((query) => query.table === 'delegation_members');
		expect(memberships?.columns).toBe('delegation_id, delegations!inner(id, conferences(id))');
		expect(memberships?.selectOptions).toEqual({ count: 'exact', head: true });
		expect(memberships?.eq).toEqual([['user_id', 'user-1']]);
		expect(memberships?.is).toEqual([['delegations.conferences', null]]);
	});

	it('adds the two counts together, because the list shows both as one', async () => {
		const { supabase } = standInClient({
			applications: { count: 2 },
			delegation_members: { count: 1 }
		});

		expect(await countMyApplicationsAtUnpublishedConferences(supabase, 'user-1')).toBe(3);
	});

	it('reads a missing count as nought', async () => {
		const { supabase } = standInClient({
			applications: { count: null },
			delegation_members: { count: null }
		});

		expect(await countMyApplicationsAtUnpublishedConferences(supabase, 'user-1')).toBe(0);
	});

	it('raises when the application count fails', async () => {
		const { supabase } = standInClient({ applications: { count: null, error: 'boom' } });

		await expect(countMyApplicationsAtUnpublishedConferences(supabase, 'user-1')).rejects.toThrow(
			'Could not count your hidden applications: boom'
		);
	});

	it('raises when the membership count fails', async () => {
		const { supabase } = standInClient({ delegation_members: { count: null, error: 'boom' } });

		await expect(countMyApplicationsAtUnpublishedConferences(supabase, 'user-1')).rejects.toThrow(
			'Could not count your hidden delegations: boom'
		);
	});
});

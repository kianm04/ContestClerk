import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	addConfirmedAward,
	deleteAward,
	publishAwards,
	renameAward,
	setAwardStatus,
	unpublishAwards,
	updateAwardProposal,
	proposeAward
} from './award-changes';

// What this module decides on its own: which columns each write sends (and
// which it deliberately leaves out, such as `status` and `created_by` on a
// proposal), which filters keep a write to the right row, and how a unique
// violation, an invalid id, or a write that changed no row each turn into the
// module's own answer rather than an exception. Nothing here talks to a
// database; the stand-in client below writes down what it was asked for and
// answers with fixed rows, the way `chair-notes.test.ts` does. Whether the
// database's policies and triggers really allow or refuse a write is tested
// in `tests/db/awards.test.ts`.

/** An answer to one query, in the shape the real client gives one. */
type Answer = { data: unknown; error: { message: string; code?: string } | null };

/** What one query this module sent was asking for. */
type RecordedQuery = {
	/** The relation `.from(...)` named. */
	table: string;
	/** `insert`, `update`, `delete`, or `select` for a read. */
	kind: string;
	/** What `insert` or `update` was given. */
	written: unknown;
	/** Every `.eq` and `.in` filter, in the order they were added. */
	filters: [string, unknown][];
};

/**
 * A stand-in Supabase client that writes down what each query asked for and
 * answers from `answers`, keyed by table name. Every step of a query hands the
 * builder back, and awaiting it gives the answer, as the real builder does.
 *
 * `answers[table]` is a queue: the first query to a table takes the first
 * entry, the second query to the same table takes the second, and once the
 * queue runs out every further query repeats the last entry. This is how
 * `addConfirmedAward` (insert, then update) and `renameAward` (update, then
 * update again) get their two different answers in the right order.
 */
function createStandIn(answers: Partial<Record<string, Answer[]>>) {
	const calls: RecordedQuery[] = [];
	const timesAsked: Record<string, number> = {};

	function builderFor(table: string) {
		const record: RecordedQuery = { table, kind: 'select', written: null, filters: [] };
		calls.push(record);

		const queue = answers[table] ?? [];
		const askedBefore = timesAsked[table] ?? 0;
		timesAsked[table] = askedBefore + 1;
		const answer = queue[askedBefore] ?? queue[queue.length - 1] ?? { data: null, error: null };

		const builder = {
			then: (resolve: (value: Answer) => void) => resolve(answer),
			select: () => builder,
			order: () => builder,
			overrideTypes: () => builder,
			single: () => builder,
			eq: (column: string, value: unknown) => {
				record.filters.push([column, value]);
				return builder;
			},
			in: (column: string, values: unknown) => {
				record.filters.push([column, values]);
				return builder;
			},
			insert: (row: unknown) => {
				record.kind = 'insert';
				record.written = row;
				return builder;
			},
			update: (row: unknown) => {
				record.kind = 'update';
				record.written = row;
				return builder;
			},
			delete: () => {
				record.kind = 'delete';
				return builder;
			}
		};

		return builder;
	}

	return { supabase: { from: builderFor } as unknown as SupabaseClient, calls };
}

const WORDING = { seatId: 'seat-1', kind: 'best_delegate' as const, title: 'Best Delegate' };

describe('proposeAward', () => {
	it('inserts the seat, kind and title, and nothing else', async () => {
		const { supabase, calls } = createStandIn({
			awards: [{ data: { id: 'award-1' }, error: null }]
		});

		const result = await proposeAward(supabase, 'committee-1', WORDING);

		expect(calls[0]).toMatchObject({ table: 'awards', kind: 'insert' });
		// The status and who proposed it are left to `guard_award_insert`, not
		// written here, so a chair cannot post an already-confirmed award.
		expect(calls[0].written).toEqual({
			committee_id: 'committee-1',
			seat_id: 'seat-1',
			kind: 'best_delegate',
			title: 'Best Delegate'
		});
		expect(result).toEqual({ result: 'saved', awardId: 'award-1' });
	});

	it('answers duplicate when the seat already has an award of that kind', async () => {
		const { supabase } = createStandIn({
			awards: [
				{
					data: null,
					error: { message: 'duplicate key value violates unique constraint', code: '23505' }
				}
			]
		});

		const result = await proposeAward(supabase, 'committee-1', WORDING);

		expect(result).toEqual({ result: 'duplicate', awardId: null });
	});

	it('raises on any other failure', async () => {
		const { supabase } = createStandIn({
			awards: [{ data: null, error: { message: 'row-level security' } }]
		});

		await expect(proposeAward(supabase, 'committee-1', WORDING)).rejects.toThrow(
			'row-level security'
		);
	});

	it('saves under the id the browser chose, when one was given', async () => {
		const { supabase, calls } = createStandIn({
			awards: [{ data: { id: 'award-1' }, error: null }]
		});

		const result = await proposeAward(supabase, 'committee-1', WORDING, 'award-1');

		expect(calls[0].written).toEqual({
			id: 'award-1',
			committee_id: 'committee-1',
			seat_id: 'seat-1',
			kind: 'best_delegate',
			title: 'Best Delegate'
		});
		expect(result).toEqual({ result: 'saved', awardId: 'award-1' });
	});

	it('leaves the id out, letting the database choose one, when none was given', async () => {
		const { supabase, calls } = createStandIn({
			awards: [{ data: { id: 'award-1' }, error: null }]
		});

		await proposeAward(supabase, 'committee-1', WORDING);

		expect(calls[0].written).not.toHaveProperty('id');
	});
});

describe('addConfirmedAward', () => {
	it('proposes the award and then confirms the one it just made', async () => {
		const { supabase, calls } = createStandIn({
			awards: [
				{ data: { id: 'award-1' }, error: null },
				{ data: [{ id: 'award-1' }], error: null }
			]
		});

		const result = await addConfirmedAward(supabase, 'committee-1', WORDING);

		expect(calls[0]).toMatchObject({ kind: 'insert' });
		expect(calls[1]).toMatchObject({
			kind: 'update',
			written: { status: 'confirmed' },
			filters: [['id', 'award-1']]
		});
		expect(result).toBe('saved');
	});

	it('answers duplicate without confirming anything, when the seat already has that kind', async () => {
		const { supabase, calls } = createStandIn({
			awards: [
				{
					data: null,
					error: { message: 'duplicate key value violates unique constraint', code: '23505' }
				}
			]
		});

		const result = await addConfirmedAward(supabase, 'committee-1', WORDING);

		expect(result).toBe('duplicate');
		// Only the proposal was sent; nothing was left to confirm.
		expect(calls).toHaveLength(1);
	});

	it('raises when the award it just added could not be confirmed', async () => {
		const { supabase } = createStandIn({
			awards: [
				{ data: { id: 'award-1' }, error: null },
				// The confirming update changed no row.
				{ data: [], error: null }
			]
		});

		await expect(addConfirmedAward(supabase, 'committee-1', WORDING)).rejects.toThrow(
			'Could not confirm the award that was just added.'
		);
	});
});

describe('updateAwardProposal', () => {
	it('updates the seat, kind and title of the award by id', async () => {
		const { supabase, calls } = createStandIn({ awards: [{ data: null, error: null }] });

		const result = await updateAwardProposal(supabase, 'award-1', WORDING);

		expect(calls[0]).toMatchObject({
			kind: 'update',
			written: { seat_id: 'seat-1', kind: 'best_delegate', title: 'Best Delegate' },
			filters: [['id', 'award-1']]
		});
		expect(result).toBe('saved');
	});

	it('answers duplicate when the seat already has an award of that kind', async () => {
		const { supabase } = createStandIn({
			awards: [
				{
					data: null,
					error: { message: 'duplicate key value violates unique constraint', code: '23505' }
				}
			]
		});

		expect(await updateAwardProposal(supabase, 'award-1', WORDING)).toBe('duplicate');
	});

	it('raises on any other failure', async () => {
		const { supabase } = createStandIn({
			awards: [{ data: null, error: { message: 'row-level security' } }]
		});

		await expect(updateAwardProposal(supabase, 'award-1', WORDING)).rejects.toThrow(
			'row-level security'
		);
	});
});

describe('setAwardStatus', () => {
	it('answers true when a row was changed', async () => {
		const { supabase, calls } = createStandIn({
			awards: [{ data: [{ id: 'award-1' }], error: null }]
		});

		expect(await setAwardStatus(supabase, 'award-1', 'confirmed')).toBe(true);
		expect(calls[0]).toMatchObject({
			kind: 'update',
			written: { status: 'confirmed' },
			filters: [['id', 'award-1']]
		});
	});

	it('answers false when the policy left every row alone', async () => {
		const { supabase } = createStandIn({ awards: [{ data: [], error: null }] });

		expect(await setAwardStatus(supabase, 'award-1', 'confirmed')).toBe(false);
	});

	it('answers false for an id that is not a uuid', async () => {
		const { supabase } = createStandIn({
			awards: [{ data: null, error: { message: 'invalid input', code: '22P02' } }]
		});

		expect(await setAwardStatus(supabase, 'nonsense', 'confirmed')).toBe(false);
	});

	it('raises on any other failure', async () => {
		const { supabase } = createStandIn({
			awards: [{ data: null, error: { message: 'no connection' } }]
		});

		await expect(setAwardStatus(supabase, 'award-1', 'confirmed')).rejects.toThrow('no connection');
	});
});

describe('renameAward', () => {
	it('sets a confirmed award back to proposed first, then renames it and confirms it again', async () => {
		const { supabase, calls } = createStandIn({
			awards: [
				// The unconfirming update, from `setAwardStatus`.
				{ data: [{ id: 'award-1' }], error: null },
				// The renaming update.
				{ data: null, error: null }
			]
		});

		await renameAward(supabase, { id: 'award-1', status: 'confirmed' }, 'New Title');

		expect(calls[0]).toMatchObject({
			kind: 'update',
			written: { status: 'proposed' },
			filters: [['id', 'award-1']]
		});
		expect(calls[1]).toMatchObject({
			kind: 'update',
			written: { title: 'New Title', status: 'confirmed' },
			filters: [['id', 'award-1']]
		});
	});

	it('renames a still-proposed award in one update, leaving it proposed', async () => {
		const { supabase, calls } = createStandIn({ awards: [{ data: null, error: null }] });

		await renameAward(supabase, { id: 'award-2', status: 'proposed' }, 'New Title');

		expect(calls).toHaveLength(1);
		expect(calls[0]).toMatchObject({
			kind: 'update',
			written: { title: 'New Title', status: 'proposed' },
			filters: [['id', 'award-2']]
		});
	});

	it('raises when the rename itself fails', async () => {
		const { supabase } = createStandIn({
			awards: [{ data: null, error: { message: 'row-level security' } }]
		});

		await expect(
			renameAward(supabase, { id: 'award-2', status: 'proposed' }, 'New Title')
		).rejects.toThrow('row-level security');
	});
});

describe('deleteAward', () => {
	it('deletes the award inside this committee and says it went', async () => {
		const { supabase, calls } = createStandIn({
			awards: [{ data: [{ id: 'award-1' }], error: null }]
		});

		expect(await deleteAward(supabase, 'committee-1', 'award-1')).toBe(true);
		expect(calls[0]).toMatchObject({
			kind: 'delete',
			filters: [
				['id', 'award-1'],
				['committee_id', 'committee-1']
			]
		});
	});

	it('answers false when the delete policy hid the award', async () => {
		const { supabase } = createStandIn({ awards: [{ data: [], error: null }] });

		expect(await deleteAward(supabase, 'committee-1', 'award-1')).toBe(false);
	});

	it('answers false for an id that is not a uuid', async () => {
		const { supabase } = createStandIn({
			awards: [{ data: null, error: { message: 'invalid input', code: '22P02' } }]
		});

		expect(await deleteAward(supabase, 'committee-1', 'nonsense')).toBe(false);
	});

	it('raises on any other failure', async () => {
		const { supabase } = createStandIn({
			awards: [{ data: null, error: { message: 'no connection' } }]
		});

		await expect(deleteAward(supabase, 'committee-1', 'award-1')).rejects.toThrow('no connection');
	});
});

describe('publishAwards and unpublishAwards', () => {
	/** A client whose only question is `rpc`, which records what it was asked and answers `error`. */
	function createRpcStandIn(error: { message: string } | null = null) {
		const calls: [string, Record<string, unknown>][] = [];
		const supabase = {
			rpc: async (name: string, functionArguments: Record<string, unknown>) => {
				calls.push([name, functionArguments]);
				return { data: null, error };
			}
		};

		return { supabase: supabase as unknown as SupabaseClient, calls };
	}

	it("sets the conference's publish moment through set_awards_published_at", async () => {
		const { supabase, calls } = createRpcStandIn();

		await publishAwards(supabase, 'conference-1', '2027-02-15T12:00:00Z');

		expect(calls).toEqual([
			[
				'set_awards_published_at',
				{ conference_id: 'conference-1', published_at: '2027-02-15T12:00:00Z' }
			]
		]);
	});

	it('clears the publish moment back to null', async () => {
		const { supabase, calls } = createRpcStandIn();

		await unpublishAwards(supabase, 'conference-1');

		expect(calls).toEqual([
			['set_awards_published_at', { conference_id: 'conference-1', published_at: null }]
		]);
	});

	it('raises when the database refuses, as it does somebody who may not confirm awards', async () => {
		const { supabase } = createRpcStandIn({
			message: 'Only the people who confirm awards can publish them'
		});

		await expect(publishAwards(supabase, 'conference-1', '2027-02-15T12:00:00Z')).rejects.toThrow(
			'Could not change when the awards are published: Only the people who confirm awards can publish them'
		);
	});
});

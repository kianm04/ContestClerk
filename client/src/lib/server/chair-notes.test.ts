import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addChairNote, deleteChairNote, listChairNotes, listSeatAllocations } from './chair-notes';

// What this module decides on its own: which rows it writes, which filters it
// sends, and how it turns the rows it reads into the page's shapes. The
// stand-in client below writes down what it was asked for and answers with
// fixed rows, the way `roll-calls.test.ts` does. What the rows themselves
// allow is tested in `tests/db/committee-room.test.ts`, and the whole page
// against a real database in `tests/e2e/chair-notes.spec.ts`.

/** An answer to one query, in the shape the real client gives one. */
type Answer = { data: unknown; error: { message: string; code?: string } | null };

/** What one query this module sent was asking for. */
type RecordedQuery = {
	/** The relation `.from(...)` named. */
	table: string;
	/** `insert`, `delete`, or `select` for a read. */
	kind: string;
	/** What `insert` was given. */
	written: unknown;
	/** Every `.eq` and `.in` filter, in the order they were added. */
	filters: [string, unknown][];
};

/**
 * A stand-in Supabase client that writes down what each query asked for and
 * answers from `answers`, keyed by table name. Every step of a query hands the
 * builder back, and awaiting it gives the answer, as the real builder does.
 */
function createStandIn(answers: Partial<Record<string, Answer>>) {
	const calls: RecordedQuery[] = [];

	function builderFor(table: string) {
		const record: RecordedQuery = { table, kind: 'select', written: null, filters: [] };
		calls.push(record);

		const answer = answers[table] ?? { data: null, error: null };

		const builder = {
			then: (resolve: (value: Answer) => void) => resolve(answer),
			select: () => builder,
			order: () => builder,
			overrideTypes: () => builder,
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
			delete: () => {
				record.kind = 'delete';
				return builder;
			}
		};

		return builder;
	}

	return { supabase: { from: builderFor } as unknown as SupabaseClient, calls };
}

const NOTE_ROWS = [
	{
		id: 'note-2',
		seat_id: 'seat-de',
		author_id: 'chair-1',
		body: 'Strong **speech**.',
		created_at: '2026-01-01T10:00:00Z'
	},
	{
		id: 'note-1',
		seat_id: 'seat-de',
		author_id: 'organiser-1',
		body: 'Late.',
		created_at: '2026-01-01T09:00:00Z'
	}
];

describe('listChairNotes', () => {
	it('reads the committee notes with each author name, chair title and HTML', async () => {
		const { supabase, calls } = createStandIn({
			chair_notes: { data: NOTE_ROWS, error: null },
			profiles: {
				data: [
					{ id: 'chair-1', full_name: 'Ada' },
					{ id: 'organiser-1', full_name: null }
				],
				error: null
			},
			committee_chairs: { data: [{ user_id: 'chair-1', title: 'Chair' }], error: null }
		});

		const notes = await listChairNotes(supabase, 'committee-1');

		expect(calls[0].filters).toEqual([['committee_id', 'committee-1']]);
		// Each author is asked for once, however many notes they wrote.
		expect(calls[1].filters).toEqual([['id', ['chair-1', 'organiser-1']]]);
		expect(notes).toEqual([
			{
				id: 'note-2',
				seatId: 'seat-de',
				authorId: 'chair-1',
				authorName: 'Ada',
				authorTitle: 'Chair',
				body: 'Strong **speech**.',
				bodyHtml: '<p>Strong <strong>speech</strong>.</p>\n',
				createdAt: '2026-01-01T10:00:00Z'
			},
			{
				id: 'note-1',
				seatId: 'seat-de',
				authorId: 'organiser-1',
				authorName: null,
				authorTitle: null,
				body: 'Late.',
				bodyHtml: '<p>Late.</p>\n',
				createdAt: '2026-01-01T09:00:00Z'
			}
		]);
	});

	it('asks for no names when there are no notes', async () => {
		const { supabase, calls } = createStandIn({ chair_notes: { data: [], error: null } });

		expect(await listChairNotes(supabase, 'committee-1')).toEqual([]);
		expect(calls.some((call) => call.table === 'profiles')).toBe(false);
	});

	it('raises when the notes cannot be read', async () => {
		const { supabase } = createStandIn({
			chair_notes: { data: null, error: { message: 'no connection' } }
		});

		await expect(listChairNotes(supabase, 'committee-1')).rejects.toThrow('no connection');
	});
});

describe('listSeatAllocations', () => {
	it('reads who sits in each available seat and since when', async () => {
		const { supabase, calls } = createStandIn({
			seats: {
				data: [
					{ id: 'seat-fr', user_id: null, allocated_at: null },
					{ id: 'seat-de', user_id: 'delegate-1', allocated_at: '2026-01-01T08:00:00Z' }
				],
				error: null
			}
		});

		const allocations = await listSeatAllocations(supabase, 'committee-1');

		expect(calls[0].filters).toEqual([
			['committee_id', 'committee-1'],
			['is_available', true]
		]);
		expect(allocations).toEqual([
			{ seatId: 'seat-fr', isFilled: false, allocatedAt: null },
			{ seatId: 'seat-de', isFilled: true, allocatedAt: '2026-01-01T08:00:00Z' }
		]);
	});
});

describe('addChairNote', () => {
	it('writes the note against the seat in the author name', async () => {
		const { supabase, calls } = createStandIn({});

		await addChairNote(supabase, {
			committeeId: 'committee-1',
			seatId: 'seat-de',
			authorId: 'chair-1',
			body: 'Good point.'
		});

		expect(calls[0]).toMatchObject({
			table: 'chair_notes',
			kind: 'insert',
			written: {
				committee_id: 'committee-1',
				seat_id: 'seat-de',
				author_id: 'chair-1',
				body: 'Good point.'
			}
		});
	});

	it('raises when the insert policy refuses', async () => {
		const { supabase } = createStandIn({
			chair_notes: { data: null, error: { message: 'row-level security' } }
		});
		const note = { committeeId: 'c', seatId: 's', authorId: 'a', body: 'b' };

		await expect(addChairNote(supabase, note)).rejects.toThrow('row-level security');
	});

	it('saves under the id the browser chose, when one was given', async () => {
		const { supabase, calls } = createStandIn({});

		await addChairNote(
			supabase,
			{ committeeId: 'committee-1', seatId: 'seat-de', authorId: 'chair-1', body: 'Good point.' },
			'note-1'
		);

		expect(calls[0].written).toMatchObject({ id: 'note-1' });
	});

	it('leaves the id out, letting the database choose one, when none was given', async () => {
		const { supabase, calls } = createStandIn({});

		await addChairNote(supabase, {
			committeeId: 'committee-1',
			seatId: 'seat-de',
			authorId: 'chair-1',
			body: 'Good point.'
		});

		expect(calls[0].written).not.toHaveProperty('id');
	});
});

describe('deleteChairNote', () => {
	it('deletes the note inside this committee and says it went', async () => {
		const { supabase, calls } = createStandIn({
			chair_notes: { data: [{ id: 'note-1' }], error: null }
		});

		expect(await deleteChairNote(supabase, 'committee-1', 'note-1')).toBe(true);
		expect(calls[0]).toMatchObject({
			kind: 'delete',
			filters: [
				['id', 'note-1'],
				['committee_id', 'committee-1']
			]
		});
	});

	it('answers false when the delete policy hid the note', async () => {
		const { supabase } = createStandIn({ chair_notes: { data: [], error: null } });

		expect(await deleteChairNote(supabase, 'committee-1', 'note-1')).toBe(false);
	});

	it('answers false for an id that is not a uuid', async () => {
		const { supabase } = createStandIn({
			chair_notes: { data: null, error: { message: 'invalid input', code: '22P02' } }
		});

		expect(await deleteChairNote(supabase, 'committee-1', 'nonsense')).toBe(false);
	});

	it('raises on any other failure', async () => {
		const { supabase } = createStandIn({
			chair_notes: { data: null, error: { message: 'no connection' } }
		});

		await expect(deleteChairNote(supabase, 'committee-1', 'note-1')).rejects.toThrow(
			'no connection'
		);
	});
});

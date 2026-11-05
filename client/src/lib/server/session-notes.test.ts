import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readSessionNotes, saveSessionNotes } from './session-notes';

// What this module decides on its own: that the Markdown is stored as sent and
// drawn as safe HTML on its way out, which revision a save is bound to, and when a save found another
// chair's notes. The stand-in client below writes down what it was asked for
// and answers in turn, the way `chair-notes.test.ts` does. What the rows allow
// is tested in `tests/db/committee-session-notes.test.ts`.

/** An answer to one query, in the shape the real client gives one. */
type Answer = { data: unknown; error: { message: string; code?: string } | null };

/** What one query asked for. */
type RecordedQuery = {
	table: string;
	/** `insert`, `update`, or `select` for a read. */
	kind: string;
	written: unknown;
	filters: [string, unknown][];
};

/**
 * A stand-in Supabase client. Each table has a queue of answers, used one per
 * query in order. Every step of a query hands the builder back, and awaiting
 * it gives the answer, as the real builder does.
 */
function createStandIn(answers: Partial<Record<string, Answer[]>>) {
	const calls: RecordedQuery[] = [];

	function builderFor(table: string) {
		const record: RecordedQuery = { table, kind: 'select', written: null, filters: [] };
		calls.push(record);

		const answer = answers[table]?.shift() ?? { data: null, error: null };

		const builder = {
			then: (resolve: (value: Answer) => void) => resolve(answer),
			select: () => builder,
			single: () => builder,
			maybeSingle: () => builder,
			overrideTypes: () => builder,
			eq: (column: string, value: unknown) => {
				record.filters.push([column, value]);
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
			}
		};

		return builder;
	}

	return { supabase: { from: builderFor } as unknown as SupabaseClient, calls };
}

/** Sara's notes as stored, with a script somebody typed as Markdown. */
const STORED_ROW = {
	body: '**Hers**<script>alert(1)</script>',
	revision: 4,
	updated_by: 'sara-id',
	updated_at: '2026-09-26T09:30:00.000Z'
};

const SARA = { data: { full_name: 'Sara Okafor' }, error: null };

describe('readSessionNotes', () => {
	it('keeps the Markdown, draws it as safe HTML and names who saved last', async () => {
		const { supabase, calls } = createStandIn({
			committee_session_notes: [{ data: STORED_ROW, error: null }],
			profiles: [SARA]
		});

		expect(await readSessionNotes(supabase, 'session-1')).toEqual({
			body: '**Hers**<script>alert(1)</script>',
			// The script is shown as the characters typed, never run.
			bodyHtml: '<p><strong>Hers</strong>&lt;script&gt;alert(1)&lt;/script&gt;</p>\n',
			revision: 4,
			updatedById: 'sara-id',
			updatedByName: 'Sara Okafor',
			updatedAt: STORED_ROW.updated_at
		});
		expect(calls[0].filters).toEqual([['session_id', 'session-1']]);
	});

	it('gives null for a session nobody has written notes on', async () => {
		const { supabase } = createStandIn({});

		expect(await readSessionNotes(supabase, 'session-1')).toBeNull();
	});
});

const SAVE = {
	sessionId: 'session-1',
	committeeId: 'committee-1',
	body: '**Mine**, with <b>typed</b> tags',
	baseRevision: 4
};

describe('saveSessionNotes', () => {
	it('starts notes never saved with an insert of the Markdown as sent', async () => {
		const { supabase, calls } = createStandIn({
			committee_session_notes: [{ data: { revision: 1 }, error: null }]
		});

		const result = await saveSessionNotes(supabase, { ...SAVE, baseRevision: 0 });

		expect(result).toEqual({ kind: 'saved', revision: 1 });
		expect(calls[0].kind).toBe('insert');
		expect(calls[0].written).toEqual({
			session_id: 'session-1',
			committee_id: 'committee-1',
			body: '**Mine**, with <b>typed</b> tags'
		});
	});

	it("reads the other chair's notes when they started them a moment earlier", async () => {
		const { supabase } = createStandIn({
			committee_session_notes: [
				{ data: null, error: { message: 'duplicate key', code: '23505' } },
				{ data: STORED_ROW, error: null }
			],
			profiles: [SARA]
		});

		const result = await saveSessionNotes(supabase, { ...SAVE, baseRevision: 0 });

		expect(result).toMatchObject({ kind: 'conflict', current: { updatedByName: 'Sara Okafor' } });
	});

	it('saves over the revision the chair started from, and only that one', async () => {
		const { supabase, calls } = createStandIn({
			committee_session_notes: [{ data: [{ revision: 5 }], error: null }]
		});

		const result = await saveSessionNotes(supabase, SAVE);

		expect(result).toEqual({ kind: 'saved', revision: 5 });
		expect(calls[0].kind).toBe('update');
		expect(calls[0].written).toEqual({ body: '**Mine**, with <b>typed</b> tags' });
		expect(calls[0].filters).toEqual([
			['session_id', 'session-1'],
			['revision', 4]
		]);
	});

	it('writes nothing over newer notes and hands them back instead', async () => {
		const { supabase } = createStandIn({
			committee_session_notes: [
				{ data: [], error: null },
				{ data: { ...STORED_ROW, revision: 5 }, error: null }
			],
			profiles: [SARA]
		});

		const result = await saveSessionNotes(supabase, SAVE);

		expect(result).toMatchObject({
			kind: 'conflict',
			current: { revision: 5, body: STORED_ROW.body }
		});
	});

	it('throws on any other database error', async () => {
		const { supabase } = createStandIn({
			committee_session_notes: [{ data: null, error: { message: 'boom' } }]
		});

		await expect(saveSessionNotes(supabase, SAVE)).rejects.toThrow(/boom/);
	});
});

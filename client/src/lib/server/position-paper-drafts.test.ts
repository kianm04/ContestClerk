import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	deletePaperDraft,
	readEditorName,
	readPaperDraft,
	savePaperDraft
} from './position-paper-drafts';

// These tests are about the decisions this module makes about a draft's
// revision: when it inserts, when it updates, and when a save is a clash with
// another window. Who may reach a draft at all is Row Level Security's
// decision, and that is tested in `tests/db/position-paper-drafts.test.ts`.

/** What one query the module sent was asking for. */
type RecordedQuery = {
	inserted: Record<string, unknown> | null;
	updated: Record<string, unknown> | null;
	isDelete: boolean;
	eq: [string, unknown][];
};

/** What the stand-in answers with. */
type StandInAnswers = {
	/** The draft a read finds, or nothing. */
	stored?: {
		body_markdown: string;
		revision: number;
		updated_at: string;
		updated_by: string | null;
		document_state: string | null;
	} | null;
	/** The name on the profile of whoever saved it last (T147), or nothing. */
	editorName?: string;
	/** The rows an update says it changed. */
	updatedRows?: { revision: number }[];
	/** The error an insert fails with, such as a unique violation. */
	insertError?: { message: string; code: string };
};

/** A stand-in Supabase client for `position_paper_drafts`, which writes down what it was asked. */
function createStandIn(answers: StandInAnswers = {}) {
	const queries: RecordedQuery[] = [];

	function from(table: string) {
		const query: RecordedQuery = { inserted: null, updated: null, isDelete: false, eq: [] };
		queries.push(query);

		function answer() {
			if (table === 'profiles') {
				const profile = answers.editorName ? { full_name: answers.editorName } : null;
				return Promise.resolve({ data: profile, error: null });
			}

			if (query.inserted) {
				const error = answers.insertError ?? null;
				return Promise.resolve({ data: error ? null : { revision: 1 }, error });
			}

			if (query.updated) return Promise.resolve({ data: answers.updatedRows ?? [], error: null });

			return Promise.resolve({ data: answers.stored ?? null, error: null });
		}

		// Every step hands the builder back, which is what lets the module chain them.
		const builder = {
			select: () => builder,
			insert: (row: Record<string, unknown>) => {
				query.inserted = row;
				return builder;
			},
			update: (row: Record<string, unknown>) => {
				query.updated = row;
				return builder;
			},
			delete: () => {
				query.isDelete = true;
				return builder;
			},
			eq: (column: string, value: unknown) => {
				query.eq.push([column, value]);
				return builder;
			},
			single: () => builder,
			maybeSingle: () => builder,
			overrideTypes: answer,
			then: (resolve: (value: { error: null }) => void) => resolve({ error: null })
		};

		return builder;
	}

	return { supabase: { from } as unknown as SupabaseClient, queries };
}

const STORED = {
	body_markdown: 'Draft',
	revision: 7,
	updated_at: '2026-09-27T10:00:00Z',
	updated_by: 'member-2',
	// Saved only as Markdown so far: no live document beside it (T148).
	document_state: null
};

/** `STORED` as the module hands it back. */
const STORED_DRAFT = {
	body: 'Draft',
	revision: 7,
	updatedAt: '2026-09-27T10:00:00Z',
	updatedById: 'member-2',
	updatedByName: 'Rachel Morgan'
};

describe('readPaperDraft', () => {
	it("reads the seat's draft and who saved it last", async () => {
		const { supabase, queries } = createStandIn({ stored: STORED, editorName: 'Rachel Morgan' });

		expect(await readPaperDraft(supabase, 'seat-1')).toEqual(STORED_DRAFT);
		expect(queries[0].eq).toEqual([['seat_id', 'seat-1']]);
		expect(queries[1].eq).toEqual([['id', 'member-2']]);
	});

	it('leaves the name out when the profile cannot be read', async () => {
		const { supabase } = createStandIn({ stored: STORED });

		expect(await readPaperDraft(supabase, 'seat-1')).toMatchObject({ updatedByName: null });
	});

	it('is null when nobody has saved a draft', async () => {
		const { supabase } = createStandIn();

		expect(await readPaperDraft(supabase, 'seat-1')).toBeNull();
	});
});

describe('readEditorName', () => {
	it('names whoever saved the paper last', async () => {
		const { supabase } = createStandIn({ editorName: 'Rachel Morgan' });

		expect(await readEditorName(supabase, 'member-2')).toBe('Rachel Morgan');
	});

	it('is null when nobody has saved, without asking', async () => {
		const { supabase, queries } = createStandIn({ editorName: 'Rachel Morgan' });

		expect(await readEditorName(supabase, null)).toBeNull();
		expect(queries).toEqual([]);
	});

	it('is null when the account is gone', async () => {
		const { supabase } = createStandIn();

		expect(await readEditorName(supabase, 'member-2')).toBeNull();
	});
});

describe('savePaperDraft', () => {
	it('inserts the first draft when the delegate started from none', async () => {
		const { supabase, queries } = createStandIn();

		const result = await savePaperDraft(supabase, { seatId: 'seat-1', body: 'A', baseRevision: 0 });

		expect(result).toEqual({ kind: 'saved', revision: 1 });
		expect(queries[0].inserted).toEqual({
			seat_id: 'seat-1',
			body_markdown: 'A',
			// The seeded document, as PostgREST writes a `bytea`: `\x` and hex digits.
			document_state: expect.stringMatching(/^\\x[0-9a-f]+$/)
		});
	});

	it('reads a first draft another window started as a clash', async () => {
		const { supabase } = createStandIn({
			insertError: { message: 'duplicate key', code: '23505' },
			stored: STORED,
			editorName: 'Rachel Morgan'
		});

		const result = await savePaperDraft(supabase, { seatId: 'seat-1', body: 'A', baseRevision: 0 });

		expect(result).toEqual({ kind: 'conflict', revision: 7, theirs: STORED_DRAFT });
	});

	it('updates only the revision the delegate started from', async () => {
		const { supabase, queries } = createStandIn({ updatedRows: [{ revision: 8 }] });

		const result = await savePaperDraft(supabase, { seatId: 'seat-1', body: 'B', baseRevision: 7 });

		expect(result).toEqual({ kind: 'saved', revision: 8 });
		// The first query looks for a live document to write the text into (T148); there is none.
		expect(queries[1].updated).toEqual({ body_markdown: 'B' });
		expect(queries[1].eq).toEqual([
			['seat_id', 'seat-1'],
			['revision', 7]
		]);
	});

	it('answers with the stored revision when another window saved in between', async () => {
		const { supabase } = createStandIn({
			updatedRows: [],
			stored: STORED,
			editorName: 'Rachel Morgan'
		});

		const result = await savePaperDraft(supabase, { seatId: 'seat-1', body: 'B', baseRevision: 5 });

		expect(result).toEqual({ kind: 'conflict', revision: 7, theirs: STORED_DRAFT });
	});

	it('answers with revision 0 when the draft is gone, as after a submit', async () => {
		const { supabase } = createStandIn({ updatedRows: [], stored: null });

		const result = await savePaperDraft(supabase, { seatId: 'seat-1', body: 'B', baseRevision: 5 });

		expect(result).toEqual({ kind: 'conflict', revision: 0, theirs: null });
	});
});

describe('deletePaperDraft', () => {
	it("deletes the seat's draft", async () => {
		const { supabase, queries } = createStandIn();

		await deletePaperDraft(supabase, 'seat-1');

		expect(queries[0].isDelete).toBe(true);
		expect(queries[0].eq).toEqual([['seat_id', 'seat-1']]);
	});
});

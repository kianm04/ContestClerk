import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	listIntroducedWorkingPapers,
	readPaperSources,
	readSourcePaper
} from './committee-paper-sources';

// These tests are about how this module reads its rows into what the pages
// use. Which papers a reader may read at all, and which a draft may be based
// on, is the database's decision, tested in `tests/db/committee-papers.test.ts`.

/** One query the module sent: its table and the filters it asked for. */
type RecordedQuery = {
	table: string;
	eq: [string, unknown][];
	in: [string, unknown][];
	not: [string, string, unknown][];
	order: string[];
};

/** A database answer: rows, or an error with a Postgres code. */
type Answer = { data: unknown; error: { code: string; message: string } | null };

/**
 * A stand-in Supabase client that answers each table with what it is handed
 * (nothing, by default), recording every query.
 */
function createStandIn(answers: Record<string, Answer> = {}) {
	const queries: RecordedQuery[] = [];

	function from(table: string) {
		const query: RecordedQuery = { table, eq: [], in: [], not: [], order: [] };
		queries.push(query);

		// Every step hands the builder back, which is what lets the module chain them.
		const builder = {
			select: () => builder,
			eq: (column: string, value: unknown) => {
				query.eq.push([column, value]);
				return builder;
			},
			in: (column: string, values: unknown) => {
				query.in.push([column, values]);
				return builder;
			},
			not: (column: string, operator: string, value: unknown) => {
				query.not.push([column, operator, value]);
				return builder;
			},
			order: (column: string) => {
				query.order.push(column);
				return builder;
			},
			maybeSingle: () => builder,
			overrideTypes: () => Promise.resolve(answers[table] ?? { data: null, error: null })
		};

		return builder;
	}

	return { supabase: { from } as unknown as SupabaseClient, queries };
}

const FAILURE = { data: null, error: { code: 'XX000', message: 'down' } };
const NOT_AN_ID = {
	data: null,
	error: { code: '22P02', message: 'invalid input syntax for uuid' }
};

/** Working paper 1.1 as `committee_papers` stores it. */
const CONTROL_ROW = {
	id: 'working-paper-1',
	kind: 'working_paper',
	topic_number: 1,
	sequence: 1,
	title: 'Meaningful human control'
};

/** Working paper 1.1 as the pages use it. */
const CONTROL = {
	id: 'working-paper-1',
	kind: 'working_paper',
	topicNumber: 1,
	sequence: 1,
	title: 'Meaningful human control'
};

describe('listIntroducedWorkingPapers', () => {
	it("reads the committee's introduced working papers by number", async () => {
		const { supabase, queries } = createStandIn({
			committee_papers: { data: [CONTROL_ROW], error: null }
		});

		expect(await listIntroducedWorkingPapers(supabase, 'disec')).toEqual([CONTROL]);
		expect(queries).toEqual([
			{
				table: 'committee_papers',
				eq: [
					['committee_id', 'disec'],
					['kind', 'working_paper']
				],
				in: [],
				not: [['introduced_at', 'is', null]],
				order: ['topic_number', 'sequence']
			}
		]);
	});

	it('answers an empty list for a committee with none', async () => {
		const { supabase } = createStandIn();

		expect(await listIntroducedWorkingPapers(supabase, 'disec')).toEqual([]);
	});

	it('throws when the papers cannot be read', async () => {
		const { supabase } = createStandIn({ committee_papers: FAILURE });

		await expect(listIntroducedWorkingPapers(supabase, 'disec')).rejects.toThrow(
			"Could not read the committee's working papers"
		);
	});
});

describe('readPaperSources', () => {
	it('reads the working papers the draft is based on, by number', async () => {
		const { supabase, queries } = createStandIn({
			committee_paper_sources: { data: [{ source_paper_id: 'working-paper-1' }], error: null },
			committee_papers: { data: [CONTROL_ROW], error: null }
		});

		expect(await readPaperSources(supabase, 'draft-1')).toEqual([CONTROL]);
		expect(queries[0]).toMatchObject({
			table: 'committee_paper_sources',
			eq: [['paper_id', 'draft-1']]
		});
		expect(queries[1]).toMatchObject({
			table: 'committee_papers',
			in: [['id', ['working-paper-1']]],
			order: ['topic_number', 'sequence']
		});
	});

	it('asks for no papers when the draft is based on none', async () => {
		const { supabase, queries } = createStandIn({
			committee_paper_sources: { data: [], error: null }
		});

		expect(await readPaperSources(supabase, 'draft-1')).toEqual([]);
		expect(queries).toHaveLength(1);
	});

	it('throws when either read fails', async () => {
		const linksDown = createStandIn({ committee_paper_sources: FAILURE });
		await expect(readPaperSources(linksDown.supabase, 'draft-1')).rejects.toThrow(
			'Could not read what the paper is based on'
		);

		const papersDown = createStandIn({
			committee_paper_sources: { data: [{ source_paper_id: 'working-paper-1' }], error: null },
			committee_papers: FAILURE
		});
		await expect(readPaperSources(papersDown.supabase, 'draft-1')).rejects.toThrow(
			'Could not read the working papers'
		);
	});
});

describe('readSourcePaper', () => {
	/** A working paper of Costa Rica and Austria, which Austria leads, introduced on 14 March. */
	const STORED = {
		committee_paper_sources: { data: { source_paper_id: 'working-paper-1' }, error: null },
		committee_papers: {
			data: {
				...CONTROL_ROW,
				body_markdown: 'Recalling **the Convention**,',
				introduced_at: '2027-03-14T09:30:00Z',
				lead_seat_id: 'seat-at'
			},
			error: null
		},
		committee_paper_seats: {
			data: [
				{ seat_id: 'seat-cr', seat: { name: 'Costa Rica' } },
				{ seat_id: 'seat-at', seat: { name: 'Austria' } }
			],
			error: null
		}
	};

	it('reads the working paper with its authors, the lead first, and its text as HTML', async () => {
		const { supabase, queries } = createStandIn(STORED);

		expect(await readSourcePaper(supabase, 'draft-1', 'working-paper-1', 'Europe/Vienna')).toEqual({
			id: 'working-paper-1',
			title: 'Meaningful human control',
			kindAndNumber: 'Working paper 1.1',
			metaLine: 'Austria, Costa Rica · Introduced 14 March',
			bodyHtml: '<p>Recalling <strong>the Convention</strong>,</p>\n'
		});
		expect(queries.map((query) => [query.table, query.eq])).toEqual([
			[
				'committee_paper_sources',
				[
					['paper_id', 'draft-1'],
					['source_paper_id', 'working-paper-1']
				]
			],
			['committee_papers', [['id', 'working-paper-1']]],
			[
				'committee_paper_seats',
				[
					['paper_id', 'working-paper-1'],
					['role', 'author']
				]
			]
		]);
	});

	it('names the day it was introduced where the conference is', async () => {
		const lateAtNight = {
			...STORED,
			committee_papers: {
				data: { ...STORED.committee_papers.data, introduced_at: '2027-03-14T23:30:00Z' },
				error: null
			}
		};
		const { supabase } = createStandIn(lateAtNight);

		const source = await readSourcePaper(supabase, 'draft-1', 'working-paper-1', 'Europe/Vienna');

		expect(source?.metaLine).toBe('Austria, Costa Rica · Introduced 15 March');
	});

	it('answers null for a paper the draft is not based on', async () => {
		const { supabase } = createStandIn({
			...STORED,
			committee_paper_sources: { data: null, error: null }
		});

		expect(await readSourcePaper(supabase, 'draft-1', 'working-paper-1', 'UTC')).toBeNull();
	});

	it('answers null for a working paper the reader may not read', async () => {
		const { supabase } = createStandIn({
			...STORED,
			committee_papers: { data: null, error: null }
		});

		expect(await readSourcePaper(supabase, 'draft-1', 'working-paper-1', 'UTC')).toBeNull();
	});

	it('answers null for an id that is no id at all, as from an old or mistyped link', async () => {
		const { supabase } = createStandIn({
			committee_paper_sources: NOT_AN_ID,
			committee_papers: NOT_AN_ID,
			committee_paper_seats: NOT_AN_ID
		});

		expect(await readSourcePaper(supabase, 'draft-1', 'not-an-id', 'UTC')).toBeNull();
	});

	it('throws on a fault', async () => {
		const { supabase } = createStandIn({ ...STORED, committee_paper_seats: FAILURE });

		await expect(readSourcePaper(supabase, 'draft-1', 'working-paper-1', 'UTC')).rejects.toThrow(
			'Could not read the working paper: down'
		);
	});
});

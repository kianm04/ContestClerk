import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClauseContent } from '$lib/paper-clauses';

// The versions have their own tests next to their read; here a paper has
// only the version it was submitted as, unless a test says otherwise.
vi.mock('./paper-amendments', () => ({ readPaperVersions: vi.fn(async () => []) }));

import { readPaperVersions } from './paper-amendments';
import {
	listApprovedPapers,
	mayRunRoom,
	readDisplayedPaper,
	readPaperForScreen,
	readPaperOnFloor,
	showPaperOnScreen,
	stepDisplayedClause,
	takePaperOffScreen
} from './papers-on-floor';

type Answer = { data: unknown; error: { code?: string; message: string } | null };

/** One query as the stand-in saw it: its table and what was asked of it. */
type RecordedQuery = {
	table: string;
	selected: string | null;
	updated: unknown;
	eq: [string, unknown][];
	orders: [string, unknown][];
};

/**
 * A stand-in Supabase client answering each table with its own answer, and
 * `rpc` with another, which records every query so a test can see what was
 * asked. A table given a list of answers answers its first query with the
 * first, its second with the second, for a read followed by an update. A
 * query is awaited, so each builder is a "thenable": `await` calls its `then`.
 */
function createStandIn(answers: Record<string, Answer | Answer[]>, rpcAnswer?: Answer) {
	const queries: RecordedQuery[] = [];

	const answerFor = (table: string, index: number): Answer => {
		const answer = answers[table];
		return Array.isArray(answer) ? answer[index] : answer;
	};

	const supabase = {
		from: (table: string) => {
			const query: RecordedQuery = { table, selected: null, updated: null, eq: [], orders: [] };
			const index = queries.filter((earlier) => earlier.table === table).length;
			queries.push(query);

			const builder = {
				then: (resolve: (answer: Answer) => unknown) => resolve(answerFor(table, index)),
				select: (columns: string) => {
					query.selected = columns;
					return builder;
				},
				update: (columns: unknown) => {
					query.updated = columns;
					return builder;
				},
				eq: (column: string, value: unknown) => {
					query.eq.push([column, value]);
					return builder;
				},
				order: (column: string, options: unknown) => {
					query.orders.push([column, options]);
					return builder;
				},
				maybeSingle: () => builder,
				overrideTypes: () => builder
			};

			return builder;
		},
		rpc: vi.fn(async () => rpcAnswer)
	} as unknown as SupabaseClient;

	return { supabase, queries };
}

const WORKING_PAPER_ROW = {
	id: 'paper-1',
	kind: 'working_paper',
	title: 'Meaningful human control',
	topic_number: 1,
	sequence: 2
};

const DISPLAYED = { data: { displayed_paper_id: 'paper-1', displayed_clause: null }, error: null };

/** The committee the projector names its resolutions after. */
const COMMITTEE = {
	id: 'committee-1',
	name: 'General Assembly First Committee',
	abbreviation: 'DISEC'
};

/** A draft resolution with two preambulatory clauses and two operative ones, the first with sub-clauses. */
const DRAFT_RESOLUTION_ROW = {
	...WORKING_PAPER_ROW,
	kind: 'draft_resolution',
	body_markdown: null,
	preamble_markdown: 'Recalling the Convention,\n\nNoting with concern the reports,',
	operative_markdown: [
		'1. Calls upon all States:',
		'   1. to negotiate;',
		'      1. within a year;',
		'   2. to report;',
		'2. Decides to remain seized.'
	].join('\n'),
	introduced_at: '2026-10-09T14:12:00Z'
};

/** The room's state with the draft resolution on screen at this stop. */
function displayedAt(clause: number | null): Answer {
	return { data: { displayed_paper_id: 'paper-1', displayed_clause: clause }, error: null };
}

describe('listApprovedPapers', () => {
	it("reads the committee's approved papers by name, in their numbers' order", async () => {
		const { supabase, queries } = createStandIn({
			committee_papers: { data: [WORKING_PAPER_ROW], error: null }
		});

		const papers = await listApprovedPapers(supabase, 'committee-1');

		expect(papers).toEqual([
			{ id: 'paper-1', name: 'Working paper 1.2', title: 'Meaningful human control' }
		]);
		expect(queries[0].eq).toEqual([
			['committee_id', 'committee-1'],
			['status', 'approved']
		]);
		expect(queries[0].orders.map(([column]) => column)).toEqual([
			'topic_number',
			'kind',
			'sequence'
		]);
	});

	it('throws when the database fails', async () => {
		const { supabase } = createStandIn({
			committee_papers: { data: null, error: { message: 'boom' } }
		});

		await expect(listApprovedPapers(supabase, 'committee-1')).rejects.toThrow('boom');
	});
});

describe('readDisplayedPaper', () => {
	it('names the paper on the projector', async () => {
		const { supabase, queries } = createStandIn({
			committee_state: DISPLAYED,
			committee_papers: { data: WORKING_PAPER_ROW, error: null }
		});

		expect(await readDisplayedPaper(supabase, 'committee-1')).toEqual({
			id: 'paper-1',
			name: 'Working paper 1.2',
			title: 'Meaningful human control'
		});
		expect(queries[1].eq).toEqual([['id', 'paper-1']]);
	});

	it('is null with no paper on the projector, asking for no paper', async () => {
		const { supabase, queries } = createStandIn({
			committee_state: { data: { displayed_paper_id: null }, error: null }
		});

		expect(await readDisplayedPaper(supabase, 'committee-1')).toBeNull();
		expect(queries).toHaveLength(1);
	});

	it('is null for a paper the reader may not read', async () => {
		const { supabase } = createStandIn({
			committee_state: DISPLAYED,
			committee_papers: { data: null, error: null }
		});

		expect(await readDisplayedPaper(supabase, 'committee-1')).toBeNull();
	});
});

describe('readPaperForScreen', () => {
	it('draws a working paper whole, with its opening phrases marked', async () => {
		const { supabase } = createStandIn({
			committee_state: DISPLAYED,
			committee_papers: {
				data: {
					...WORKING_PAPER_ROW,
					body_markdown: 'Recalling the Convention',
					preamble_markdown: null,
					operative_markdown: null
				},
				error: null
			}
		});

		const paper = await readPaperForScreen(supabase, COMMITTEE);

		expect(paper).toMatchObject({ name: 'Working paper 1.2', position: null });
		expect(paper?.page).toMatchObject({ shows: 'text' });
		expect(paper?.page.shows === 'text' && paper.page.html).toContain('Recalling');
	});

	it('starts a draft resolution at its preambulatory clauses, under the line they hang from', async () => {
		const { supabase } = createStandIn({
			committee_state: DISPLAYED,
			committee_papers: { data: DRAFT_RESOLUTION_ROW, error: null }
		});

		const paper = await readPaperForScreen(supabase, COMMITTEE);

		expect(paper).toMatchObject({
			name: 'Draft resolution 1.2',
			position: 'Preambulatory clauses',
			page: { shows: 'preamble', opening: 'The General Assembly,' }
		});
		expect(paper?.page.shows === 'preamble' && paper.page.clauses).toEqual([
			'<p><em>Recalling</em> the Convention,</p>\n',
			'<p><em>Noting with concern</em> the reports,</p>\n'
		]);
	});

	it('draws the clause the dais stepped to, its phrase underlined and its sub-clauses lettered', async () => {
		const { supabase } = createStandIn({
			committee_state: displayedAt(1),
			committee_papers: { data: DRAFT_RESOLUTION_ROW, error: null }
		});

		const paper = await readPaperForScreen(supabase, COMMITTEE);

		expect(paper?.position).toBe('Operative clause 1 of 2');
		expect(paper?.page).toMatchObject({
			shows: 'clause',
			number: 1,
			subClauses: [
				{ label: '(a)', subClauses: [{ label: '(i)', subClauses: [] }] },
				{ label: '(b)', subClauses: [] }
			]
		});
		expect(paper?.page.shows === 'clause' && paper.page.html).toContain('<u>Calls upon</u>');
	});

	it('draws a clause past the last, after an amendment struck it, as the last', async () => {
		const { supabase } = createStandIn({
			committee_state: displayedAt(5),
			committee_papers: { data: DRAFT_RESOLUTION_ROW, error: null }
		});

		expect(await readPaperForScreen(supabase, COMMITTEE)).toMatchObject({
			position: 'Operative clause 2 of 2',
			page: { shows: 'clause', number: 2 }
		});
	});

	it('draws an amended draft from its latest version, as its Markdown is as submitted', async () => {
		const amended: ClauseContent = {
			preamble: [],
			operative: [{ id: 'a3', markdown: 'Affirms its resolve;', children: [] }]
		};
		vi.mocked(readPaperVersions).mockResolvedValueOnce([
			{ id: 'version-1', versionNumber: 1, content: { preamble: [], operative: [] } },
			{ id: 'version-2', versionNumber: 2, content: amended }
		]);
		const { supabase } = createStandIn({
			committee_state: displayedAt(1),
			committee_papers: { data: DRAFT_RESOLUTION_ROW, error: null }
		});

		const paper = await readPaperForScreen(supabase, COMMITTEE);

		expect(readPaperVersions).toHaveBeenCalledWith(supabase, DRAFT_RESOLUTION_ROW.id);
		expect(paper?.position).toBe('Operative clause 1 of 1');
		expect(paper?.page.shows === 'clause' && paper.page.html).toContain('<u>Affirms</u>');
	});

	it('draws a draft resolution with no clauses yet whole', async () => {
		const { supabase } = createStandIn({
			committee_state: DISPLAYED,
			committee_papers: {
				data: { ...DRAFT_RESOLUTION_ROW, preamble_markdown: '', operative_markdown: '' },
				error: null
			}
		});

		expect(await readPaperForScreen(supabase, COMMITTEE)).toMatchObject({
			position: null,
			page: { shows: 'text' }
		});
	});

	it('is null with nothing on the projector', async () => {
		const { supabase } = createStandIn({
			committee_state: { data: null, error: null }
		});

		expect(await readPaperForScreen(supabase, COMMITTEE)).toBeNull();
	});
});

describe('mayRunRoom', () => {
	it('asks the database whether the reader runs the room, and takes only a plain yes for one', async () => {
		const yes = createStandIn({}, { data: true, error: null });
		const no = createStandIn({}, { data: null, error: null });

		expect(await mayRunRoom(yes.supabase, 'committee-1')).toBe(true);
		expect(await mayRunRoom(no.supabase, 'committee-1')).toBe(false);
		expect(yes.supabase.rpc).toHaveBeenCalledWith('has_committee_permission', {
			committee_id: 'committee-1',
			permission: 'run_room'
		});
	});

	it('throws when the question cannot be asked', async () => {
		const { supabase } = createStandIn({}, { data: null, error: { message: 'no connection' } });

		await expect(mayRunRoom(supabase, 'committee-1')).rejects.toThrow(
			'Could not check who runs the room'
		);
	});
});

describe('readPaperOnFloor', () => {
	it('lets the dais show an introduced paper, and says where the screen stands in it', async () => {
		const { supabase } = createStandIn(
			{
				committee_papers: { data: DRAFT_RESOLUTION_ROW, error: null },
				committee_state: displayedAt(2)
			},
			{ data: true, error: null }
		);

		expect(await readPaperOnFloor(supabase, 'committee-1', 'paper-1')).toEqual({
			introducedAt: '2026-10-09T14:12:00Z',
			isOnScreen: true,
			mayShowOnScreen: true,
			screenStep: { position: 'Operative clause 2 of 2', hasPrevious: true, hasNext: false }
		});
		expect(supabase.rpc).toHaveBeenCalledWith('has_committee_permission', {
			committee_id: 'committee-1',
			permission: 'run_room'
		});
	});

	it('has no step for a paper shown whole, or one not on the screen', async () => {
		const working = createStandIn(
			{
				committee_papers: {
					data: {
						...WORKING_PAPER_ROW,
						body_markdown: 'Text',
						introduced_at: '2026-10-09T14:12:00Z'
					},
					error: null
				},
				committee_state: DISPLAYED
			},
			{ data: true, error: null }
		);
		const elsewhere = createStandIn(
			{
				committee_papers: { data: DRAFT_RESOLUTION_ROW, error: null },
				committee_state: {
					data: { displayed_paper_id: 'paper-2', displayed_clause: 1 },
					error: null
				}
			},
			{ data: true, error: null }
		);

		expect(await readPaperOnFloor(working.supabase, 'committee-1', 'paper-1')).toMatchObject({
			isOnScreen: true,
			screenStep: null
		});
		expect(await readPaperOnFloor(elsewhere.supabase, 'committee-1', 'paper-1')).toMatchObject({
			isOnScreen: false,
			screenStep: null
		});
	});

	it('offers nothing for a paper not yet introduced, or to a reader not on the dais', async () => {
		const waiting = createStandIn(
			{
				committee_papers: { data: { ...DRAFT_RESOLUTION_ROW, introduced_at: null }, error: null },
				committee_state: { data: { displayed_paper_id: null, displayed_clause: null }, error: null }
			},
			{ data: true, error: null }
		);
		const delegate = createStandIn(
			{
				committee_papers: { data: DRAFT_RESOLUTION_ROW, error: null },
				committee_state: DISPLAYED
			},
			{ data: false, error: null }
		);

		expect(await readPaperOnFloor(waiting.supabase, 'committee-1', 'paper-1')).toEqual({
			introducedAt: null,
			isOnScreen: false,
			mayShowOnScreen: false,
			screenStep: null
		});
		expect(await readPaperOnFloor(delegate.supabase, 'committee-1', 'paper-1')).toMatchObject({
			mayShowOnScreen: false
		});
	});

	it('takes an id that is no uuid at all for a paper not introduced', async () => {
		const { supabase } = createStandIn(
			{
				committee_papers: { data: null, error: { code: '22P02', message: 'invalid uuid' } },
				committee_state: { data: null, error: null }
			},
			{ data: true, error: null }
		);

		expect(await readPaperOnFloor(supabase, 'committee-1', 'nonsense')).toMatchObject({
			introducedAt: null,
			screenStep: null
		});
	});
});

describe('stepDisplayedClause', () => {
	it('moves the screen one clause on, only while it still shows this paper', async () => {
		const { supabase, queries } = createStandIn({
			committee_state: [
				displayedAt(null),
				{ data: [{ committee_id: 'committee-1' }], error: null }
			],
			committee_papers: { data: DRAFT_RESOLUTION_ROW, error: null }
		});

		expect(await stepDisplayedClause(supabase, 'committee-1', 'paper-1', 'next')).toBeNull();

		const update = queries.find((query) => query.updated !== null);
		expect(update?.updated).toEqual({ displayed_clause: 1 });
		expect(update?.eq).toEqual([
			['committee_id', 'committee-1'],
			['displayed_paper_id', 'paper-1']
		]);
	});

	it('refuses, changing nothing, when another paper is on the screen', async () => {
		const { supabase, queries } = createStandIn({
			committee_state: {
				data: { displayed_paper_id: 'paper-2', displayed_clause: null },
				error: null
			},
			committee_papers: { data: DRAFT_RESOLUTION_ROW, error: null }
		});

		expect(await stepDisplayedClause(supabase, 'committee-1', 'paper-1', 'next')).toBe(
			'That paper is no longer on the screen.'
		);
		expect(queries.some((query) => query.updated !== null)).toBe(false);
	});

	it('refuses when Row Level Security changes no row', async () => {
		const { supabase } = createStandIn({
			committee_state: [displayedAt(1), { data: [], error: null }],
			committee_papers: { data: DRAFT_RESOLUTION_ROW, error: null }
		});

		expect(await stepDisplayedClause(supabase, 'committee-1', 'paper-1', 'previous')).toBe(
			'That paper is no longer on the screen.'
		);
	});
});

describe('showPaperOnScreen', () => {
	it("puts the paper on the committee's projector", async () => {
		const { supabase, queries } = createStandIn({
			committee_state: { data: [{ committee_id: 'committee-1' }], error: null }
		});

		expect(await showPaperOnScreen(supabase, 'committee-1', 'paper-1')).toBeNull();
		expect(queries[0].updated).toEqual({ displayed_paper_id: 'paper-1' });
		expect(queries[0].eq).toEqual([['committee_id', 'committee-1']]);
	});

	it('refuses when Row Level Security changes no row', async () => {
		const { supabase } = createStandIn({ committee_state: { data: [], error: null } });

		expect(await showPaperOnScreen(supabase, 'committee-1', 'paper-1')).toBe(
			'Only an introduced paper can go on the screen.'
		);
	});
});

describe('takePaperOffScreen', () => {
	it('clears the projector only while it shows this paper', async () => {
		const { supabase, queries } = createStandIn({ committee_state: { data: null, error: null } });

		await takePaperOffScreen(supabase, 'committee-1', 'paper-1');

		expect(queries[0].updated).toEqual({ displayed_paper_id: null });
		expect(queries[0].eq).toEqual([
			['committee_id', 'committee-1'],
			['displayed_paper_id', 'paper-1']
		]);
	});

	it('throws when the database fails', async () => {
		const { supabase } = createStandIn({
			committee_state: { data: null, error: { message: 'boom' } }
		});

		await expect(takePaperOffScreen(supabase, 'committee-1', 'paper-1')).rejects.toThrow('boom');
	});
});

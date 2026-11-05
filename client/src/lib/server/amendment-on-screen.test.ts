import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaperAmendment } from '$lib/paper-amendments';
import type { ClauseContent, NumberedClause } from '$lib/paper-clauses';

// The amendment and the versions have their own tests next to their reads,
// so they are stood in for here; drawing the words stays real.
vi.mock('./paper-amendments', () => ({ readPaperAmendments: vi.fn(), readPaperVersions: vi.fn() }));

import { amendmentScreenPage, readAmendmentVoteForScreen } from './amendment-on-screen';
import { readPaperAmendments, readPaperVersions } from './paper-amendments';

const CONTENT: ClauseContent = {
	preamble: [],
	operative: [
		{
			id: 'o1',
			markdown: 'Calls upon all States:',
			children: [{ id: 'o1a', markdown: 'to refrain from deploying weapons;', children: [] }]
		},
		{ id: 'o2', markdown: 'Requests a report;', children: [] }
	]
};

const CLAUSE_2: NumberedClause = {
	id: 'o2',
	part: 'operative',
	level: 1,
	markdown: 'Requests a report;',
	marker: '2.',
	reference: '2'
};

/** Amendment 2, striking clause 2, approved and under the vote. */
const STRIKE = {
	id: 'amendment-2',
	sequence: 2,
	proposerName: 'United States',
	action: 'strike',
	targetPart: 'operative',
	targetClauseId: 'o2',
	textMarkdown: null,
	parentAmendmentId: null,
	status: 'approved',
	isFriendly: false,
	basedOnVersionId: 'version-1'
} as PaperAmendment;

type Answer = { data: unknown; error: null };

/** A stand-in client answering each table with its one row, as `maybeSingle` would. */
function createStandIn(answers: Record<string, Answer>) {
	const builder = (table: string) => {
		const query = {
			select: () => query,
			eq: () => query,
			maybeSingle: () => query,
			overrideTypes: () => Promise.resolve(answers[table])
		};
		return query;
	};

	return { from: builder } as unknown as SupabaseClient;
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(readPaperAmendments).mockResolvedValue([STRIKE]);
	vi.mocked(readPaperVersions).mockResolvedValue([
		{ id: 'version-1', versionNumber: 1, content: CONTENT }
	]);
});

describe('amendmentScreenPage', () => {
	it('strikes the clause a strike takes out, and has no new words', () => {
		const page = amendmentScreenPage(STRIKE, { clause: CLAUSE_2, before: null, parent: null });

		expect(page).toMatchObject({ shows: 'amendment', reference: '2', newHtml: null });
		expect(page.struckHtml).toContain('<u>Requests</u> a report;');
	});

	it('shows a change as the words struck and the new words', () => {
		const change = {
			...STRIKE,
			action: 'change',
			textMarkdown: 'Requests a full report;'
		} as const;
		const page = amendmentScreenPage(change, {
			clause: CLAUSE_2,
			before: 'Requests a report;',
			parent: null
		});

		expect(page.struckHtml).toContain('a report;');
		expect(page.newHtml).toContain('a full report;');
	});

	it('gives an addition its new words alone, and no number', () => {
		const addition = { ...STRIKE, action: 'add', textMarkdown: 'Affirms its resolve;' } as const;
		const page = amendmentScreenPage(addition, { clause: CLAUSE_2, before: null, parent: null });

		expect(page).toMatchObject({ reference: null, struckHtml: null });
		expect(page.newHtml).toContain('<u>Affirms</u> its resolve;');
	});
});

describe('readAmendmentVoteForScreen', () => {
	it('reads the amendment tied to the vote and the clause it strikes', async () => {
		const supabase = createStandIn({
			votes: {
				data: { amendment_id: 'amendment-2', amendment: { paper_id: 'paper-1' } },
				error: null
			},
			committee_papers: {
				data: {
					id: 'paper-1',
					kind: 'draft_resolution',
					title: 'Human control',
					topic_number: 1,
					sequence: 1
				},
				error: null
			}
		});

		expect(await readAmendmentVoteForScreen(supabase, 'vote-1')).toMatchObject({
			sequence: 2,
			paperName: 'Draft resolution 1.1',
			headline: 'Strike clause 2',
			proposedLine: 'Proposed by the United States · Unfriendly',
			page: { shows: 'amendment', reference: '2', newHtml: null }
		});
		expect(readPaperAmendments).toHaveBeenCalledWith(supabase, 'paper-1');
	});

	it('is null for a vote on anything but an amendment, or no vote at all', async () => {
		const supabase = createStandIn({
			votes: { data: { amendment_id: null, amendment: null }, error: null }
		});

		expect(await readAmendmentVoteForScreen(supabase, 'vote-1')).toBeNull();
		expect(await readAmendmentVoteForScreen(supabase, null)).toBeNull();
		expect(readPaperAmendments).not.toHaveBeenCalled();
	});
});

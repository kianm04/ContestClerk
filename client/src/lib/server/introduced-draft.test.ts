import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PaperAmendment } from '$lib/paper-amendments';
import type { ClauseContent } from '$lib/paper-clauses';
import { clauseAnchoredHtml, clauseElementId, readIntroducedDraft } from './introduced-draft';

// The readers are stood in for: what they ask the database is tested in
// `paper-amendments.test.ts`. `renderMarkdown` is the real one, so the HTML
// here is what the page draws.
vi.mock('./paper-amendments', () => ({
	readPaperVersions: vi.fn(),
	readPaperAmendments: vi.fn(),
	readAmendmentRules: vi.fn()
}));

import { readAmendmentRules, readPaperAmendments, readPaperVersions } from './paper-amendments';

const CONTENT: ClauseContent = {
	preamble: [{ id: 'p1', markdown: 'Recalling its resolution 78/241,' }],
	operative: [
		{
			id: 'o1',
			markdown: 'Calls upon all States:',
			children: [{ id: 'o1a', markdown: 'to refrain from deploying weapons;', children: [] }]
		},
		{ id: 'bad id"', markdown: 'Requests <b>a report</b>;', children: [] }
	]
};

describe('clauseElementId', () => {
	it('names a clause’s element for a card or a link to point at', () => {
		expect(clauseElementId('o1a')).toBe('clause-o1a');
	});
});

describe('clauseAnchoredHtml', () => {
	it('draws each clause with its id, the opening phrases of the top clauses styled', () => {
		expect(clauseAnchoredHtml(CONTENT)).toBe(
			'<p id="clause-p1"><em>Recalling</em> its resolution 78/241,</p>' +
				'<ol><li id="clause-o1"><u>Calls upon</u> all States:' +
				'<ol><li id="clause-o1a">to refrain from deploying weapons;</li></ol></li>' +
				'<li><u>Requests</u> &lt;b&gt;a report&lt;/b&gt;;</li></ol>'
		);
	});
});

describe('readIntroducedDraft', () => {
	it('draws the latest version and the cards, and counts what the reader has to answer', async () => {
		const waiting = {
			id: 'amendment-2',
			sequence: 2,
			proposedBySeatId: 'germany',
			proposerName: 'Germany',
			action: 'strike',
			targetPart: 'operative',
			targetClauseId: 'o1a',
			textMarkdown: null,
			parentAmendmentId: null,
			status: 'awaiting_sponsors',
			isFriendly: false,
			queuePosition: null,
			ruling: null,
			basedOnVersionId: 'version-1',
			createdAt: '2026-03-15T14:20:00Z',
			decidedAt: null,
			sponsorAnswers: [{ seatId: 'france', seatName: 'France', accepts: null }],
			supporterSeatIds: []
		} satisfies PaperAmendment;
		vi.mocked(readPaperVersions).mockResolvedValue([
			{ id: 'version-1', versionNumber: 1, content: { preamble: [], operative: [] } },
			{ id: 'version-2', versionNumber: 2, content: CONTENT }
		]);
		vi.mocked(readPaperAmendments).mockResolvedValue([waiting]);
		vi.mocked(readAmendmentRules).mockResolvedValue({
			hasFriendlyAmendments: true,
			isPreambleAmendable: true,
			hasSecondDegreeAmendments: false,
			supportNeeded: 3
		});

		const draft = await readIntroducedDraft({} as SupabaseClient, {
			paperId: 'paper-1',
			committeeId: 'committee-1',
			reader: { seatId: 'france', isObserver: false },
			sponsorsWord: 'sponsors',
			timeZone: 'Europe/London'
		});

		expect(draft.versionNumber).toBe(2);
		expect(draft.bodyHtml).toContain('id="clause-o1a"');
		expect(draft.cards.map((card) => card.sentenceHtml)).toEqual(['Strike clause 1(a)']);
		expect(draft.waitingForMe).toEqual([2]);
	});
});

import { describe, expect, it } from 'vitest';
import {
	amendmentCards,
	amendmentLayout,
	amendmentTarget,
	anchorClauseId,
	cardsInReadingOrder,
	type DraftVersion
} from './amendment-cards';
import type { AmendmentRules, PaperAmendment } from './paper-amendments';
import type { ClauseContent } from './paper-clauses';

const SUBMITTED: ClauseContent = {
	preamble: [{ id: 'p1', markdown: 'Recalling its resolution 78/241,' }],
	operative: [
		{
			id: 'o1',
			markdown: 'Calls upon all States:',
			children: [{ id: 'o1a', markdown: 'to refrain from deploying weapons;', children: [] }]
		},
		{ id: 'o2', markdown: 'Requests a report;', children: [] }
	]
};

// The draft once amendment 1 is written in: 1(a) changed, and a clause added after clause 2.
const AMENDED: ClauseContent = {
	preamble: SUBMITTED.preamble,
	operative: [
		{
			id: 'o1',
			markdown: 'Calls upon all States:',
			children: [{ id: 'o1a', markdown: 'to refrain from deploying weapons now;', children: [] }]
		},
		{ id: 'o2', markdown: 'Requests a report;', children: [] },
		{ id: 'a4', markdown: 'Affirms its resolve;', children: [] }
	]
};

const VERSIONS: DraftVersion[] = [
	{ id: 'version-1', versionNumber: 1, content: SUBMITTED },
	{ id: 'version-2', versionNumber: 2, content: AMENDED }
];

const RULES: AmendmentRules = {
	hasFriendlyAmendments: true,
	isPreambleAmendable: true,
	hasSecondDegreeAmendments: true,
	supportNeeded: 5
};

function amendment(overrides: Partial<PaperAmendment> = {}): PaperAmendment {
	return {
		id: 'amendment-1',
		sequence: 1,
		proposedBySeatId: 'germany',
		proposerName: 'Germany',
		action: 'change',
		targetPart: 'operative',
		targetClauseId: 'o1a',
		textMarkdown: 'to refrain from deploying weapons now;',
		parentAmendmentId: null,
		status: 'written_in',
		isFriendly: true,
		queuePosition: null,
		ruling: null,
		basedOnVersionId: 'version-1',
		createdAt: '2026-03-15T14:20:00Z',
		decidedAt: '2026-03-15T14:52:00Z',
		sponsorAnswers: [],
		supporterSeatIds: [],
		...overrides
	};
}

const CONTEXT = {
	versions: VERSIONS,
	rules: RULES,
	reader: { seatId: 'india', isObserver: false },
	sponsorsWord: 'sponsors',
	timeZone: 'Europe/London',
	// Stands in for `renderMarkdown`: a paragraph around the words, as it draws one line.
	render: (markdown: string) => `<p>${markdown}</p>\n`
};

describe('amendmentTarget', () => {
	it('words a written-in change against the clause as it was when it was proposed', () => {
		const target = amendmentTarget(amendment(), [amendment()], VERSIONS);

		expect(target.clause?.reference).toBe('1(a)');
		expect(target.before).toBe('to refrain from deploying weapons;');
		expect(target.parent).toBe(null);
	});

	it('words an amendment to an amendment against that amendment’s words', () => {
		const parent = amendment({ id: 'two', sequence: 2, status: 'approved', isFriendly: false });
		const child = amendment({ id: 'three', sequence: 3, parentAmendmentId: 'two' });

		expect(amendmentTarget(child, [parent, child], VERSIONS)).toMatchObject({
			before: 'to refrain from deploying weapons now;',
			parent: { sequence: 2 }
		});
	});
});

describe('anchorClauseId', () => {
	it('sits a written-in addition beside the clause it added, and a change beside its clause', () => {
		const added = amendment({ sequence: 4, action: 'add', targetClauseId: 'o2' });

		expect(anchorClauseId(added, AMENDED)).toBe('a4');
		expect(anchorClauseId(amendment(), AMENDED)).toBe('o1a');
	});

	it('sits an addition at the start beside the first clause, and a gone clause at the end', () => {
		const atTheStart = amendment({ action: 'add', targetClauseId: null, status: 'with_the_dais' });
		const gone = amendment({ targetClauseId: 'o9' });

		expect(anchorClauseId(atTheStart, AMENDED)).toBe('o1');
		expect(anchorClauseId(gone, AMENDED)).toBe(null);
	});
});

describe('amendmentCards', () => {
	it('draws each amendment by number, its sentence without the paragraph around it', () => {
		const strike = amendment({
			id: 'two',
			sequence: 2,
			action: 'strike',
			targetClauseId: 'o2',
			textMarkdown: null,
			status: 'with_the_dais',
			isFriendly: false,
			decidedAt: null,
			proposerName: 'United States',
			supporterSeatIds: ['a', 'b', 'c', 'd']
		});
		const [first, second] = amendmentCards([strike, amendment()], CONTEXT);

		expect(first).toMatchObject({
			name: 'Amendment 1',
			statusWord: 'Written in',
			tone: 'success',
			sentenceHtml: 'Change 1(a): add ‘now’.',
			metaLine: 'Germany · Friendly · 15 March, 14:52',
			anchorClauseId: 'o1a',
			answersLine: null
		});
		expect(second).toMatchObject({
			name: 'Amendment 2',
			statusWord: 'With the dais',
			sentenceHtml: 'Strike clause 2',
			metaLine: 'United States · Unfriendly · Supported by 5 seats, the 5 it needs'
		});
	});

	it('shows the proposer the sponsors who have accepted as the answers arrive', () => {
		const asking = amendment({
			proposedBySeatId: 'india',
			status: 'awaiting_sponsors',
			decidedAt: null,
			sponsorAnswers: [
				{ seatId: 'austria', seatName: 'Austria', accepts: true },
				{ seatId: 'chile', seatName: 'Chile', accepts: null },
				{ seatId: 'mexico', seatName: 'Mexico', accepts: true }
			]
		});

		expect(amendmentCards([asking], CONTEXT)[0].answersLine).toBe('Accepted by Austria and Mexico');
		expect(
			amendmentCards([asking], { ...CONTEXT, reader: { seatId: 'chile', isObserver: false } })[0]
				.answersLine
		).toBe(null);
	});
});

describe('cardsInReadingOrder', () => {
	it('orders the cards by the clauses they sit beside, those with none last', () => {
		const cards = amendmentCards(
			[
				amendment({ id: 'one', sequence: 1, targetClauseId: 'o9' }),
				amendment({ id: 'two', sequence: 2, targetClauseId: 'o2' }),
				amendment({ id: 'three', sequence: 3, targetPart: 'preamble', targetClauseId: 'p1' })
			],
			CONTEXT
		);

		expect(cardsInReadingOrder(cards, AMENDED).map((card) => card.sequence)).toEqual([3, 2, 1]);
	});
});

describe('amendmentLayout', () => {
	const cards = amendmentCards(
		[
			amendment({ id: 'one', sequence: 1, targetClauseId: 'o1a' }),
			amendment({ id: 'two', sequence: 2, targetClauseId: 'o2' }),
			amendment({ id: 'three', sequence: 3, targetClauseId: 'o9' })
		],
		CONTEXT
	);
	const clauseTops: Record<string, number> = { o1a: 300, o2: 320 };

	it('sets each card level with its clause, pushing the next one down past it', () => {
		const layout = amendmentLayout(
			cards,
			(clauseId) => clauseTops[clauseId] ?? null,
			{ one: 100, two: 80, three: 60 },
			12
		);

		// Two would sit at 320, but one runs to 400; three has no clause and follows two.
		expect(layout.tops).toEqual({ one: 300, two: 412, three: 504 });
		expect(layout.height).toBe(564);
	});
});

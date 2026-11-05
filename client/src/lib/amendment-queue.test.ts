import { describe, expect, it } from 'vitest';
import {
	RULING_MAX_LENGTH,
	RULING_REFUSAL,
	addressedAmendment,
	daisAmendmentRows,
	daisChoices,
	movedQueue,
	pendingChildren,
	queuedAmendments,
	queuedAmendmentMetaLine,
	readQueueMove,
	readRuling,
	reviewOrder
} from './amendment-queue';
import type { AmendmentCard } from './amendment-cards';
import type { PaperAmendment } from './paper-amendments';

function amendment(overrides: Partial<PaperAmendment> & { id: string }): PaperAmendment {
	return {
		sequence: 1,
		proposedBySeatId: 'germany',
		proposerName: 'Germany',
		action: 'change',
		targetPart: 'operative',
		targetClauseId: 'o1',
		textMarkdown: 'Words;',
		parentAmendmentId: null,
		status: 'with_the_dais',
		isFriendly: false,
		queuePosition: null,
		ruling: null,
		basedOnVersionId: null,
		createdAt: '2026-03-15T14:20:00Z',
		decidedAt: null,
		sponsorAnswers: [],
		supporterSeatIds: [],
		...overrides
	};
}

function form(fields: Record<string, string>): FormData {
	const data = new FormData();
	for (const [name, value] of Object.entries(fields)) data.set(name, value);

	return data;
}

describe('queuedAmendments', () => {
	it('keeps those with the dais, in queue order', () => {
		const second = amendment({ id: 'b', queuePosition: 2 });
		const first = amendment({ id: 'a', queuePosition: 1 });
		const approved = amendment({ id: 'c', status: 'approved' });

		expect(queuedAmendments([second, approved, first])).toEqual([first, second]);
	});
});

describe('readQueueMove and movedQueue', () => {
	it('reads the direction and swaps the amendment with its neighbour', () => {
		expect(readQueueMove(form({ direction: 'up' }))).toBe('up');
		expect(readQueueMove(form({ direction: 'sideways' }))).toBe(null);
		expect(movedQueue(['a', 'b', 'c'], 'b', 'up')).toEqual(['b', 'a', 'c']);
		expect(movedQueue(['a', 'b', 'c'], 'b', 'down')).toEqual(['a', 'c', 'b']);
	});

	it('cannot move the first up, the last down, or one not in the queue', () => {
		expect(movedQueue(['a', 'b'], 'a', 'up')).toBe(null);
		expect(movedQueue(['a', 'b'], 'b', 'down')).toBe(null);
		expect(movedQueue(['a', 'b'], 'z', 'up')).toBe(null);
	});
});

describe('pendingChildren, reviewOrder and daisChoices', () => {
	const parent = amendment({ id: 'parent', sequence: 1, status: 'approved' });
	const child = amendment({ id: 'child', sequence: 3, parentAmendmentId: 'parent' });
	const other = amendment({ id: 'other', sequence: 2 });
	const ended = amendment({ id: 'ended', sequence: 4, status: 'written_in' });
	const all = [ended, other, child, parent];

	it('puts an amendment to an amendment just before it, and those that ended last', () => {
		expect(pendingChildren(parent, all)).toEqual([child]);
		expect(reviewOrder(all).map((each) => each.id)).toEqual(['child', 'parent', 'other', 'ended']);
	});

	it('lets the dais decide one with it, and put an approved one to the vote once its own are done', () => {
		expect(daisChoices(other, all)).toEqual({ mayDecide: true, mayPutToVote: false });
		expect(daisChoices(parent, all)).toEqual({ mayDecide: false, mayPutToVote: false });
		expect(daisChoices(parent, [parent])).toEqual({ mayDecide: false, mayPutToVote: true });
	});
});

describe('readRuling, RULING_MAX_LENGTH and RULING_REFUSAL', () => {
	it('reads a ruling, and refuses one empty or too long', () => {
		expect(readRuling(form({ ruling: '  Not germane to the topic. ' }))).toBe(
			'Not germane to the topic.'
		);
		expect(readRuling(form({ ruling: ' ' }))).toBe(null);
		expect(readRuling(form({ ruling: 'a'.repeat(RULING_MAX_LENGTH + 1) }))).toBe(null);
		expect(readRuling(form({}))).toBe(null);
		expect(RULING_REFUSAL).toContain('2,000 characters');
	});
});

describe('addressedAmendment', () => {
	it('finds the amendment an address names by its number', () => {
		const third = amendment({ id: 'c', sequence: 3 });

		expect(addressedAmendment(new URLSearchParams('ruleOut=3'), 'ruleOut', [third])).toBe(third);
		expect(addressedAmendment(new URLSearchParams('ruleOut=4'), 'ruleOut', [third])).toBe(null);
		expect(addressedAmendment(new URLSearchParams(''), 'ruleOut', [third])).toBe(null);
	});
});

describe('queuedAmendmentMetaLine', () => {
	it('names the draft, the proposer and whether it is friendly', () => {
		const queued = {
			...amendment({ id: 'one', isFriendly: true }),
			paper: { topicNumber: 1, sequence: 2 }
		};

		expect(queuedAmendmentMetaLine(queued)).toBe('Draft resolution 1.2 · Germany · Friendly');
	});

	it('leaves out a proposer whose seat has gone', () => {
		const queued = {
			...amendment({ id: 'one', proposerName: null }),
			paper: { topicNumber: 1, sequence: 1 }
		};

		expect(queuedAmendmentMetaLine(queued)).toBe('Draft resolution 1.1 · Unfriendly');
	});
});

describe('daisAmendmentRows', () => {
	it('puts the cards in review order, an amendment to an amendment first, with the choices', () => {
		const parent = amendment({ id: 'parent', sequence: 1, status: 'approved' });
		const child = amendment({ id: 'child', sequence: 2, parentAmendmentId: 'parent' });
		const ended = amendment({ id: 'ended', sequence: 3, status: 'out_of_order' });
		const card = (each: PaperAmendment) => ({ id: each.id, amendment: each }) as AmendmentCard;

		const rows = daisAmendmentRows([parent, child, ended].map(card));

		expect(rows.map((row) => row.card.id)).toEqual(['child', 'parent', 'ended']);
		expect(rows.map((row) => row.choices)).toEqual([
			{ mayDecide: true, mayPutToVote: false },
			{ mayDecide: false, mayPutToVote: false },
			{ mayDecide: false, mayPutToVote: false }
		]);
	});
});

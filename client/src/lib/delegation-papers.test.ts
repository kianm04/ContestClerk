import { describe, expect, it } from 'vitest';
import {
	delegationPaperHref,
	delegationPaperPill,
	delegationWriters,
	lastEditedText,
	paperLastEditedText,
	sharedPaperView,
	sharedWithText,
	type DelegationPaper,
	type PaperSharing
} from './delegation-papers';
import { delegationPaperUrl, positionPaperWayUrl } from './urls';

const NOW = Date.parse('2099-01-10T12:00:00.000Z');

/** Rachel's paper for France, with nothing written yet. */
function paper(overrides: Partial<DelegationPaper> = {}): DelegationPaper {
	return {
		seatId: 'seat-france',
		seatName: 'France',
		countryCode: 'FR',
		committeeName: 'Security Council',
		committeeSlug: 'unsc',
		holderId: 'rachel',
		holderName: 'Rachel Morgan',
		paperKind: null,
		reviewStatus: null,
		reviewComment: null,
		lastEditedById: null,
		lastEditedByName: null,
		lastEditedAt: null,
		wordCount: 0,
		...overrides
	};
}

const SHARING: PaperSharing = {
	delegationName: "St Aidan's Academy",
	members: [
		{ id: 'aisha', name: 'Aisha Bello' },
		{ id: 'rachel', name: 'Rachel Morgan' },
		{ id: 'tom', name: 'Tom Price' }
	]
};

const OPEN_DEADLINE = { positionPaperDeadline: '2099-02-01T12:00:00.000Z', timezone: 'UTC' };
const PAST_DEADLINE = { positionPaperDeadline: '2099-01-01T12:00:00.000Z', timezone: 'UTC' };

describe('delegationPaperPill', () => {
	it('says "Not started" without a draft or a paper', () => {
		expect(delegationPaperPill(paper())).toEqual({ label: 'Not started', tone: 'neutral' });
	});

	it('says "Draft" while somebody is writing one', () => {
		const drafted = paper({ lastEditedAt: '2099-01-10T11:55:00.000Z' });

		expect(delegationPaperPill(drafted).label).toBe('Draft');
	});

	it("uses the chair's review words once a paper is handed in", () => {
		const reviewed = paper({ reviewStatus: 'changes_requested', lastEditedAt: '2099-01-10' });

		expect(delegationPaperPill(reviewed).label).toBe('Changes requested');
		expect(delegationPaperPill(paper({ reviewStatus: 'submitted' })).label).toBe('Awaiting review');
	});
});

describe('delegationPaperHref', () => {
	it("opens a fellow member's paper on the delegation's page", () => {
		expect(delegationPaperHref(paper(), 'delegation-1', 'delft', 'tom')).toBe(
			delegationPaperUrl('delegation-1', 'seat-france')
		);
	});

	it("opens the reader's own paper on their own page, where they can submit it", () => {
		expect(delegationPaperHref(paper(), 'delegation-1', 'delft', 'rachel')).toBe(
			positionPaperWayUrl('delft', 'unsc', 'write')
		);
	});
});

describe('sharedWithText', () => {
	it('names everybody else in the delegation', () => {
		expect(sharedWithText(SHARING, 'rachel')).toBe(
			"Shared with St Aidan's Academy: Aisha Bello, Tom Price"
		);
	});

	it('is null for a delegate in no delegation, or alone in one', () => {
		const alone = { delegationName: 'Solo', members: [{ id: 'rachel', name: 'Rachel Morgan' }] };

		expect(sharedWithText(null, 'rachel')).toBeNull();
		expect(sharedWithText(alone, 'rachel')).toBeNull();
	});
});

describe('lastEditedText', () => {
	const FIVE_MINUTES_AGO = NOW - 5 * 60 * 1000;

	it('names the editor, or "you"', () => {
		const rachel = { id: 'rachel', name: 'Rachel Morgan' };

		expect(lastEditedText(rachel, FIVE_MINUTES_AGO, 'tom', NOW)).toBe(
			'Last edited by Rachel Morgan, 5 min ago'
		);
		expect(lastEditedText(rachel, FIVE_MINUTES_AGO, 'rachel', NOW)).toBe(
			'Last edited by you, 5 min ago'
		);
	});

	it('leaves the name out when it is unknown, and says nothing without a draft', () => {
		expect(lastEditedText({ id: 'gone', name: null }, FIVE_MINUTES_AGO, 'tom', NOW)).toBe(
			'Last edited 5 min ago'
		);
		expect(lastEditedText(null, null, 'tom', NOW)).toBeNull();
	});

	it("reads a row's editor and time", () => {
		const edited = paper({
			lastEditedById: 'aisha',
			lastEditedByName: 'Aisha Bello',
			lastEditedAt: new Date(FIVE_MINUTES_AGO).toISOString()
		});

		expect(paperLastEditedText(edited, 'tom', NOW)).toBe('Last edited by Aisha Bello, 5 min ago');
		expect(paperLastEditedText(paper(), 'tom', NOW)).toBeNull();
	});
});

describe('sharedPaperView', () => {
	const now = new Date(NOW);

	it('opens the editor before the deadline', () => {
		expect(sharedPaperView(paper(), false, OPEN_DEADLINE, now)).toEqual({
			view: 'editor',
			closedReason: null
		});
	});

	it('shows a handed-in written paper as handed in until its delegate starts a new draft', () => {
		const written = paper({ paperKind: 'written', reviewStatus: 'submitted' });

		expect(sharedPaperView(written, false, OPEN_DEADLINE, now).view).toBe('submitted');
		expect(sharedPaperView(written, true, OPEN_DEADLINE, now).view).toBe('editor');
	});

	it('closes after the deadline, and names the delegate of an approved paper', () => {
		const uploaded = paper({ paperKind: 'uploaded', reviewStatus: 'approved' });

		expect(sharedPaperView(paper(), false, PAST_DEADLINE, now).view).toBe('closed');
		expect(sharedPaperView(uploaded, false, OPEN_DEADLINE, now)).toEqual({
			view: 'closed',
			closedReason: "Rachel's paper was approved. It can no longer be changed."
		});
	});
});

describe('delegationWriters', () => {
	it('names every member, the reader too, without a seat', () => {
		const sharing: PaperSharing = {
			delegationName: "St Aidan's Academy",
			members: [
				{ id: 'rachel', name: 'Rachel Morgan' },
				{ id: 'aisha', name: 'Aisha Bello' }
			]
		};

		expect(delegationWriters(sharing)).toEqual([
			{ holderId: 'rachel', holderName: 'Rachel Morgan', seatName: null },
			{ holderId: 'aisha', holderName: 'Aisha Bello', seatName: null }
		]);
		expect(delegationWriters(null)).toEqual([]);
	});
});

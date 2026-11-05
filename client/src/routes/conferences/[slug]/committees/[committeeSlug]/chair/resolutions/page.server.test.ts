import { describe, expect, it, vi } from 'vitest';
import { load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in event below is exactly the shape `load` is given.
import type { PageServerLoadEvent } from './$types';
import type { DaisPaper, DaisSection } from '$lib/chair-resolutions';
import type { QueuedAmendment } from '$lib/amendment-queue';
import type { PaperCommittee } from '$lib/committee-papers';

// The reads are stood in for, so these tests are about what the page makes
// of them. The reads have their own tests in `src/lib/server/`, and the page
// runs against a real database in `tests/e2e/chair-resolutions.spec.ts`.
vi.mock('$lib/server/chair-resolutions', () => ({ listDaisPapers: vi.fn() }));
vi.mock('$lib/server/committee-papers', () => ({ readPaperCommittee: vi.fn() }));
vi.mock('$lib/server/paper-amendments', () => ({
	readCommitteeAmendments: vi.fn(async () => []),
	reorderAmendments: vi.fn()
}));

import { listDaisPapers } from '$lib/server/chair-resolutions';
import { readPaperCommittee } from '$lib/server/committee-papers';
import { readCommitteeAmendments } from '$lib/server/paper-amendments';

const COMMITTEE = { id: 'committee-1', slug: 'disec', name: 'DISEC' };

function settings(format: PaperCommittee['format']): PaperCommittee {
	return { format, paperWords: 'sponsors', topics: [] } as unknown as PaperCommittee;
}

function paper(id: string, status: DaisPaper['status']): DaisPaper {
	return {
		id,
		kind: 'draft_resolution',
		topicNumber: status === 'submitted' ? null : 1,
		sequence: status === 'submitted' ? null : 1,
		status,
		title: 'Human control',
		topic: null,
		leadSeatName: 'Austria',
		submittedAt: '2027-03-15T08:12:00Z'
	};
}

/**
 * Run `load`. SvelteKit types it as possibly returning nothing, so this checks
 * that it did return, which lets the tests read the fields.
 */
async function loadPage() {
	const result = await load(makeLoadEvent());

	if (!result) throw new Error('load returned nothing');

	return result;
}

/** The page `load`'s event. `parent()` answers what the chair layout returned. */
function makeLoadEvent(): PageServerLoadEvent {
	return {
		locals: { supabase: {} },
		parent: async () => ({ committee: COMMITTEE })
	} as unknown as PageServerLoadEvent;
}

describe('load', () => {
	it("sorts the committee's papers into the four sections, under the page's title", async () => {
		vi.mocked(readPaperCommittee).mockResolvedValue(settings('standard'));
		vi.mocked(listDaisPapers).mockResolvedValue([
			paper('waiting', 'submitted'),
			paper('on-the-floor', 'introduced')
		]);

		const data = await loadPage();

		expect(data.title).toBe('Resolutions');
		expect(
			data.sections.map((section: DaisSection) => section.papers.map((each) => each.id))
		).toEqual([['waiting'], [], ['on-the-floor'], []]);
		expect(listDaisPapers).toHaveBeenCalledWith({}, 'committee-1');
	});

	it('is called Directives in a crisis committee', async () => {
		vi.mocked(readPaperCommittee).mockResolvedValue(settings('crisis'));
		vi.mocked(listDaisPapers).mockResolvedValue([]);

		const data = await loadPage();

		expect(data.title).toBe('Directives');
	});

	it('lists the amendments waiting for the dais, in the order it takes them', async () => {
		vi.mocked(readPaperCommittee).mockResolvedValue(settings('standard'));
		vi.mocked(listDaisPapers).mockResolvedValue([]);
		vi.mocked(readCommitteeAmendments).mockResolvedValue([
			queued('second', 'with_the_dais', 2),
			queued('approved', 'approved', null),
			queued('first', 'with_the_dais', 1)
		]);

		const data = await loadPage();

		expect(data.amendmentQueue.map((amendment: QueuedAmendment) => amendment.id)).toEqual([
			'first',
			'second'
		]);
		expect(readCommitteeAmendments).toHaveBeenCalledWith({}, 'committee-1');
	});
});

/** An amendment of the committee's, as `readCommitteeAmendments` reads it. */
function queued(
	id: string,
	status: QueuedAmendment['status'],
	queuePosition: number | null
): QueuedAmendment {
	return {
		id,
		sequence: 1,
		proposedBySeatId: 'germany',
		proposerName: 'Germany',
		action: 'change',
		targetPart: 'operative',
		targetClauseId: 'o1',
		textMarkdown: 'Words;',
		parentAmendmentId: null,
		status,
		isFriendly: false,
		queuePosition,
		ruling: null,
		basedOnVersionId: null,
		createdAt: '2027-03-15T14:20:00Z',
		decidedAt: null,
		sponsorAnswers: [],
		supporterSeatIds: [],
		paper: { id: 'paper-1', title: 'Human control', topicNumber: 1, sequence: 1 }
	};
}

import { error } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in event below is exactly the shape `load` is given.
import type { PageServerLoadEvent } from './$types';
import type { ChairCommittee } from '$lib/chair-room';
import type { Conference } from '$lib/conferences';
import type { WatchedRoomPage } from '$lib/server/committee-live';

// The gate and the room's reads are stood in for, so these tests are about what
// `load` itself does: who it lets in, the name it gives realtime and what it
// hands the page. `requireRoomWatcher`, `loadWatchedRoom` and
// `readCommitteeFormat` have their own tests next to their modules.
vi.mock('$lib/server/access', () => ({ requireRoomWatcher: vi.fn() }));
vi.mock('$lib/server/committee-live', () => ({ loadWatchedRoom: vi.fn() }));
vi.mock('$lib/server/crisis-desk', () => ({ readRoomCrisisUpdate: vi.fn() }));
vi.mock('$lib/server/committee-papers', () => ({ readCommitteeFormat: vi.fn() }));
vi.mock('$lib/server/papers-on-floor', () => ({ readDisplayedPaper: vi.fn() }));
vi.mock('$lib/server/paper-amendments', () => ({ readAmendmentsToAnswer: vi.fn() }));
vi.mock('$lib/server/paper-votes', () => ({ readRoomPaperVote: vi.fn() }));

import { requireRoomWatcher } from '$lib/server/access';
import { loadWatchedRoom } from '$lib/server/committee-live';
import { readRoomCrisisUpdate } from '$lib/server/crisis-desk';
import { readCommitteeFormat } from '$lib/server/committee-papers';
import { readDisplayedPaper } from '$lib/server/papers-on-floor';
import { readAmendmentsToAnswer } from '$lib/server/paper-amendments';
import { readRoomPaperVote } from '$lib/server/paper-votes';

/** The paper the dais put on the projector. */
const DISPLAYED_PAPER = { id: 'paper-1', name: 'Working paper 1.1', title: 'Autonomous weapons' };

const SUPABASE = {};

const COMMITTEE = { id: 'committee-1', slug: 'unsc', name: 'Security Council' } as ChairCommittee;

const CONFERENCE = { id: 'conference-1', slug: 'thimun-2027' } as Conference;

const PAGE = { mySeatId: 'seat-fr', presentCount: 2 } as WatchedRoomPage;

const CRISIS_UPDATE = { message: 'The fleet has left port.', sentAt: '2027-03-15T14:07:00Z' };

/** A visit to the live view, with a `depends` that writes down what it was given. */
function makeLoadEvent() {
	const depends = vi.fn();
	const event = {
		params: { slug: 'thimun-2027', committeeSlug: 'unsc' },
		url: new URL('http://localhost/conferences/thimun-2027/committees/unsc/live'),
		locals: { supabase: SUPABASE },
		depends
	} as unknown as PageServerLoadEvent;

	return { event, depends };
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(requireRoomWatcher).mockResolvedValue({
		user: { id: 'user-1' },
		conference: CONFERENCE,
		committee: COMMITTEE
	} as Awaited<ReturnType<typeof requireRoomWatcher>>);
	vi.mocked(loadWatchedRoom).mockResolvedValue(PAGE);
	vi.mocked(readRoomCrisisUpdate).mockResolvedValue(null);
	vi.mocked(readCommitteeFormat).mockResolvedValue('standard');
	vi.mocked(readDisplayedPaper).mockResolvedValue(null);
	vi.mocked(readAmendmentsToAnswer).mockResolvedValue([]);
	vi.mocked(readRoomPaperVote).mockResolvedValue(null);
});

describe('load', () => {
	it("reads the room as the reader, under the room's realtime name", async () => {
		const { event, depends } = makeLoadEvent();

		const result = await load(event);

		expect(requireRoomWatcher).toHaveBeenCalledWith(event.locals, event.url, 'thimun-2027', 'unsc');
		expect(depends).toHaveBeenCalledWith('committee-room:committee-1');
		expect(loadWatchedRoom).toHaveBeenCalledWith(SUPABASE, CONFERENCE, COMMITTEE, 'user-1');
		expect(result).toEqual({
			...PAGE,
			papersTitle: 'Resolutions',
			displayedPaper: null,
			votedPaper: null,
			crisisUpdate: null,
			amendmentsToAnswer: []
		});
	});

	it('names the paper on the projector, which the floor links to', async () => {
		vi.mocked(readDisplayedPaper).mockResolvedValue(DISPLAYED_PAPER);
		const { event } = makeLoadEvent();

		const result = await load(event);

		expect(readDisplayedPaper).toHaveBeenCalledWith(SUPABASE, 'committee-1');
		expect(result).toMatchObject({ displayedPaper: DISPLAYED_PAPER });
	});

	it('names the paper the room votes on, which the same line links', async () => {
		const votedPaper = { paper: DISPLAYED_PAPER, isOpen: true };
		vi.mocked(readRoomPaperVote).mockResolvedValue(votedPaper);
		const { event } = makeLoadEvent();

		const result = await load(event);

		expect(readRoomPaperVote).toHaveBeenCalledWith(SUPABASE, 'committee-1');
		expect(result).toMatchObject({ votedPaper });
	});

	it('names the papers "Directives" in a crisis committee', async () => {
		vi.mocked(readCommitteeFormat).mockResolvedValue('crisis');
		const { event } = makeLoadEvent();

		const result = await load(event);

		expect(readCommitteeFormat).toHaveBeenCalledWith(SUPABASE, 'committee-1');
		expect(result).toMatchObject({ papersTitle: 'Directives' });
	});

	it("shows a crisis committee's latest crisis update", async () => {
		vi.mocked(readRoomCrisisUpdate).mockResolvedValue(CRISIS_UPDATE);
		const { event } = makeLoadEvent();

		const result = await load(event);

		expect(readRoomCrisisUpdate).toHaveBeenCalledWith(SUPABASE, 'committee-1');
		expect(result).toMatchObject({ crisisUpdate: CRISIS_UPDATE });
	});

	it("tells a sponsor's seat what waits for its answer", async () => {
		const waiting = [{ sequence: 3, paper: { id: 'paper-1', topicNumber: 1, sequence: 1 } }];
		vi.mocked(readAmendmentsToAnswer).mockResolvedValue(waiting);
		const { event } = makeLoadEvent();

		const result = await load(event);

		expect(readAmendmentsToAnswer).toHaveBeenCalledWith(SUPABASE, 'committee-1', 'seat-fr');
		expect(result).toMatchObject({ amendmentsToAnswer: waiting });
	});

	it('reads nothing when the gate turns the reader away', async () => {
		vi.mocked(requireRoomWatcher).mockImplementation(() => error(404, 'Not found'));
		const { event } = makeLoadEvent();

		await expect(load(event)).rejects.toMatchObject({ status: 404 });
		expect(loadWatchedRoom).not.toHaveBeenCalled();
		expect(readCommitteeFormat).not.toHaveBeenCalled();
		expect(readRoomCrisisUpdate).not.toHaveBeenCalled();
	});
});

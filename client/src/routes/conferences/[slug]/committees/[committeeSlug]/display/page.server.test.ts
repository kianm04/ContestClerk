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
// hands the page. `requireRoomWatcher` and `loadWatchedRoom` have their own
// tests next to their modules.
vi.mock('$lib/server/access', () => ({ requireRoomWatcher: vi.fn() }));
vi.mock('$lib/server/committee-live', () => ({ loadWatchedRoom: vi.fn() }));
vi.mock('$lib/server/crisis-desk', () => ({ readRoomCrisisUpdate: vi.fn() }));
vi.mock('$lib/server/papers-on-floor', () => ({ readPaperForScreen: vi.fn() }));
vi.mock('$lib/server/amendment-on-screen', () => ({ readAmendmentVoteForScreen: vi.fn() }));

import { requireRoomWatcher } from '$lib/server/access';
import { readAmendmentVoteForScreen } from '$lib/server/amendment-on-screen';
import type { AmendmentOnScreen } from '$lib/amendment-on-screen';
import { loadWatchedRoom } from '$lib/server/committee-live';
import { readRoomCrisisUpdate } from '$lib/server/crisis-desk';
import { readPaperForScreen } from '$lib/server/papers-on-floor';
import type { PaperForScreen } from '$lib/papers-on-floor';

/** The paper the dais put on screen, with its text drawn. */
const PAPER_ON_SCREEN: PaperForScreen = {
	id: 'paper-1',
	name: 'Draft resolution 1.1',
	title: 'Autonomous weapons',
	position: 'Operative clause 1 of 1',
	page: { shows: 'clause', number: 1, html: '<p><u>Calls upon</u> all states</p>', subClauses: [] }
};

const SUPABASE = {};

const COMMITTEE = { id: 'committee-1', slug: 'unsc', name: 'Security Council' } as ChairCommittee;

const CONFERENCE = { id: 'conference-1', slug: 'thimun-2027' } as Conference;

const PAGE = {
	mySeatId: 'seat-fr',
	presentCount: 2,
	committeeState: { currentVoteId: 'vote-1' }
} as WatchedRoomPage;

/** Amendment 2, striking clause 2, which the room votes on. */
const AMENDMENT_VOTE: AmendmentOnScreen = {
	sequence: 2,
	paperName: 'Draft resolution 1.1',
	headline: 'Strike clause 2',
	proposedLine: 'Proposed by the United States · Unfriendly',
	page: {
		shows: 'amendment',
		reference: '2',
		struckHtml: '<p>Requests a report;</p>',
		newHtml: null
	}
};

const CRISIS_UPDATE = { message: 'The fleet has left port.', sentAt: '2027-03-15T14:07:00Z' };

/** A visit to the projector display, with a `depends` that writes down what it was given. */
function makeLoadEvent() {
	const depends = vi.fn();
	const event = {
		params: { slug: 'thimun-2027', committeeSlug: 'unsc' },
		url: new URL('http://localhost/conferences/thimun-2027/committees/unsc/display'),
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
	vi.mocked(readPaperForScreen).mockResolvedValue(null);
	vi.mocked(readRoomCrisisUpdate).mockResolvedValue(null);
	vi.mocked(readAmendmentVoteForScreen).mockResolvedValue(null);
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
			paperOnScreen: null,
			crisisUpdate: null,
			amendmentVote: null
		});
	});

	it('reads the paper the dais put on screen, with its text', async () => {
		vi.mocked(readPaperForScreen).mockResolvedValue(PAPER_ON_SCREEN);
		const { event } = makeLoadEvent();

		const result = await load(event);

		expect(readPaperForScreen).toHaveBeenCalledWith(SUPABASE, COMMITTEE);
		expect(result).toMatchObject({ paperOnScreen: PAPER_ON_SCREEN });
	});

	it('reads the amendment the room votes on, by the vote the room is on', async () => {
		vi.mocked(readAmendmentVoteForScreen).mockResolvedValue(AMENDMENT_VOTE);
		const { event } = makeLoadEvent();

		const result = await load(event);

		expect(readAmendmentVoteForScreen).toHaveBeenCalledWith(SUPABASE, 'vote-1');
		expect(result).toMatchObject({ amendmentVote: AMENDMENT_VOTE });
	});

	it("shows a crisis committee's latest crisis update", async () => {
		vi.mocked(readRoomCrisisUpdate).mockResolvedValue(CRISIS_UPDATE);
		const { event } = makeLoadEvent();

		const result = await load(event);

		expect(readRoomCrisisUpdate).toHaveBeenCalledWith(SUPABASE, 'committee-1');
		expect(result).toMatchObject({ crisisUpdate: CRISIS_UPDATE });
	});

	it('reads nothing when the gate turns the reader away', async () => {
		vi.mocked(requireRoomWatcher).mockImplementation(() => error(404, 'Not found'));
		const { event } = makeLoadEvent();

		await expect(load(event)).rejects.toMatchObject({ status: 404 });
		expect(loadWatchedRoom).not.toHaveBeenCalled();
		expect(readRoomCrisisUpdate).not.toHaveBeenCalled();
		expect(readPaperForScreen).not.toHaveBeenCalled();
	});
});

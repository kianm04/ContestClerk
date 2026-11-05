import { error } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in event below is exactly the shape `load` is given.
import type { PageServerLoadEvent } from './$types';
import type { ChairCommittee } from '$lib/chair-room';
import type { PaperCommittee, PaperListItem } from '$lib/committee-papers';
import type { Conference } from '$lib/conferences';

// The gate and the reads are stood in for, so these tests are about what
// `load` itself decides: who it lets in, whose papers it reads and what it
// offers. Each read has its own tests in `$lib/server/committee-papers.test.ts`,
// and the sorting into sections in `$lib/committee-papers.test.ts`.
vi.mock('$lib/server/access', () => ({ requireRoomWatcher: vi.fn() }));
vi.mock('$lib/server/committee-papers', () => ({
	listCommitteePapers: vi.fn(),
	readMyPaperSeat: vi.fn(),
	readPaperCommittee: vi.fn()
}));

import { requireRoomWatcher } from '$lib/server/access';
import {
	listCommitteePapers,
	readMyPaperSeat,
	readPaperCommittee
} from '$lib/server/committee-papers';

/** The Supabase client. This route only ever hands it on to `$lib/server`. */
const SUPABASE = {};

const CONFERENCE = { id: 'conference-1', slug: 'thimun-2027', name: 'THIMUN 2027' } as Conference;

const COMMITTEE = {
	id: 'committee-1',
	slug: 'disec',
	name: 'Disarmament and International Security',
	abbreviation: 'DISEC'
} as ChairCommittee;

/** A committee that writes working papers. Tests spread it and change what they need. */
const SETTINGS: PaperCommittee = {
	format: 'standard',
	crisisAllowsResolutions: false,
	hasWorkingPapers: true,
	paperWords: 'sponsors_and_signatories',
	topics: ['Lethal autonomous weapons'],
	agendaTopic: 'Lethal autonomous weapons'
};

const FRANCE = { id: 'seat-fr', name: 'France', isObserver: false };

/** A paper France writes. Tests spread it and change what they need. */
const OURS: PaperListItem = {
	id: 'paper-1',
	kind: 'working_paper',
	status: 'writing',
	title: 'Meaningful human control',
	topic: 'Lethal autonomous weapons',
	topicNumber: null,
	sequence: null,
	isOpenForSignatures: false,
	updatedAt: '2026-10-09T09:00:00Z',
	myRole: 'author'
};

/** Another bloc's paper, already on the floor. */
const INTRODUCED: PaperListItem = {
	...OURS,
	id: 'paper-2',
	kind: 'draft_resolution',
	status: 'introduced',
	title: 'A treaty on autonomous weapons',
	topicNumber: 1,
	sequence: 1,
	myRole: null
};

/** A visit to the committee's papers. */
function makeLoadEvent(): PageServerLoadEvent {
	return {
		params: { slug: 'thimun-2027', committeeSlug: 'disec' },
		url: new URL('http://localhost/conferences/thimun-2027/committees/disec/resolutions'),
		locals: { supabase: SUPABASE }
	} as unknown as PageServerLoadEvent;
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(requireRoomWatcher).mockResolvedValue({
		user: { id: 'user-1' },
		conference: CONFERENCE,
		committee: COMMITTEE
	} as Awaited<ReturnType<typeof requireRoomWatcher>>);
	vi.mocked(readPaperCommittee).mockResolvedValue(SETTINGS);
	vi.mocked(readMyPaperSeat).mockResolvedValue(FRANCE);
	vi.mocked(listCommitteePapers).mockResolvedValue([OURS, INTRODUCED]);
});

describe('load', () => {
	it("reads the committee's papers as the reader's seat, sorted into the list's sections", async () => {
		const event = makeLoadEvent();

		const result = await load(event);

		expect(requireRoomWatcher).toHaveBeenCalledWith(
			event.locals,
			event.url,
			'thimun-2027',
			'disec'
		);
		expect(readMyPaperSeat).toHaveBeenCalledWith(SUPABASE, 'committee-1', 'user-1');
		expect(listCommitteePapers).toHaveBeenCalledWith(SUPABASE, 'committee-1', 'seat-fr');
		expect(result).toEqual({
			conference: { slug: 'thimun-2027', name: 'THIMUN 2027' },
			committee: { slug: 'disec', heading: 'DISEC' },
			title: 'Resolutions',
			sections: { yours: [OURS], openForSignatures: [], introduced: [INTRODUCED], passed: [] },
			passedSentence: 'No resolution has passed.',
			pressReleases: null,
			hasSeat: true,
			canStart: true
		});
	});

	it('names a crisis committee\'s papers "Directives"', async () => {
		vi.mocked(readPaperCommittee).mockResolvedValue({ ...SETTINGS, format: 'crisis' });

		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({
			title: 'Directives',
			passedSentence: 'No directive has passed.'
		});
	});

	it("lists a crisis committee's published press releases on their own", async () => {
		const pressRelease: PaperListItem = {
			...OURS,
			id: 'paper-3',
			kind: 'press_release',
			status: 'published',
			title: 'The government stands firm',
			myRole: null
		};
		vi.mocked(readPaperCommittee).mockResolvedValue({ ...SETTINGS, format: 'crisis' });
		vi.mocked(listCommitteePapers).mockResolvedValue([OURS, pressRelease]);

		expect(await load(makeLoadEvent())).toMatchObject({ pressReleases: [pressRelease] });
	});

	it('reads the list for a chair, who holds no seat and so can start no paper', async () => {
		vi.mocked(readMyPaperSeat).mockResolvedValue(null);

		const result = await load(makeLoadEvent());

		expect(listCommitteePapers).toHaveBeenCalledWith(SUPABASE, 'committee-1', null);
		expect(result).toMatchObject({ hasSeat: false, canStart: false });
	});

	it('offers no "Start a paper" to an observer, who may sign but never write', async () => {
		vi.mocked(readMyPaperSeat).mockResolvedValue({ ...FRANCE, isObserver: true });
		expect(await load(makeLoadEvent())).toMatchObject({ hasSeat: true, canStart: false });
	});

	it('offers "Start a paper" whatever the committee writes: draft resolutions, or directives', async () => {
		vi.mocked(readPaperCommittee).mockResolvedValue({ ...SETTINGS, hasWorkingPapers: false });
		expect(await load(makeLoadEvent())).toMatchObject({ canStart: true });

		vi.mocked(readPaperCommittee).mockResolvedValue({ ...SETTINGS, format: 'crisis' });
		expect(await load(makeLoadEvent())).toMatchObject({ canStart: true });
	});

	it('reads nothing when the gate turns the reader away', async () => {
		vi.mocked(requireRoomWatcher).mockImplementation(() => error(404, 'Not found'));

		await expect(load(makeLoadEvent())).rejects.toMatchObject({ status: 404 });
		expect(readPaperCommittee).not.toHaveBeenCalled();
		expect(listCommitteePapers).not.toHaveBeenCalled();
	});
});

import { error } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the action are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
import type { ChairCommittee } from '$lib/chair-room';
import type { PaperCommittee } from '$lib/committee-papers';
import type { Conference } from '$lib/conferences';
import { committeePaperUrl } from '$lib/urls';

// The gate, the reads and `start_paper` are stood in for, so these tests are
// about what the route decides on top of them: who may start a paper, what
// the form starts on, and what it answers when the form or the database
// refuses. Each has its own tests next to its module.
vi.mock('$lib/server/access', () => ({ requireRoomWatcher: vi.fn() }));
vi.mock('$lib/server/committee-papers', () => ({
	readMyPaperSeat: vi.fn(),
	readPaperCommittee: vi.fn()
}));
vi.mock('$lib/server/committee-paper-authors', () => ({ startPaper: vi.fn() }));
vi.mock('$lib/server/committee-paper-sources', () => ({ listIntroducedWorkingPapers: vi.fn() }));

import { requireRoomWatcher } from '$lib/server/access';
import { startPaper } from '$lib/server/committee-paper-authors';
import { listIntroducedWorkingPapers } from '$lib/server/committee-paper-sources';
import { readMyPaperSeat, readPaperCommittee } from '$lib/server/committee-papers';

/** What the form is opened with. `load` is typed as perhaps answering nothing, which it never does here. */
type NewPaperData = Exclude<Awaited<ReturnType<typeof load>>, void>;

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
	topics: ['Lethal autonomous weapons', 'Cyber security'],
	agendaTopic: 'Lethal autonomous weapons'
};

const FRANCE = { id: 'seat-fr', name: 'France', isObserver: false };

/** A visit to the form, or its post when `formData` is given. */
function makeEvent(formData?: FormData): PageServerLoadEvent & RequestEvent {
	return {
		params: { slug: 'thimun-2027', committeeSlug: 'disec' },
		url: new URL('http://localhost/conferences/thimun-2027/committees/disec/resolutions/new'),
		locals: { supabase: SUPABASE },
		request: { formData: async () => formData ?? new FormData() }
	} as unknown as PageServerLoadEvent & RequestEvent;
}

/** Working paper 1.1, introduced, which a draft resolution may be based on. */
const CONTROL = {
	id: '0b9e2c3a-1d4f-4a5b-8c6d-7e8f9a0b1c2d',
	kind: 'working_paper',
	topicNumber: 1,
	sequence: 1,
	title: 'Meaningful human control'
} as const;

/** What "Start writing" posts: a working paper unless another kind is given. */
function newPaperForm(
	title: string,
	topic: string,
	kind = 'working_paper',
	sourcePaperIds: string[] = []
): FormData {
	const formData = new FormData();
	formData.set('kind', kind);
	formData.set('title', title);
	formData.set('topic', topic);
	for (const id of sourcePaperIds) formData.append('sourcePaperIds', id);
	return formData;
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
	vi.mocked(listIntroducedWorkingPapers).mockResolvedValue([CONTROL]);
});

describe('load', () => {
	it('opens the form on the first kind and the topic on the agenda, with the papers named for the breadcrumb', async () => {
		const event = makeEvent();

		const result = await load(event);

		expect(requireRoomWatcher).toHaveBeenCalledWith(
			event.locals,
			event.url,
			'thimun-2027',
			'disec'
		);
		expect(readMyPaperSeat).toHaveBeenCalledWith(SUPABASE, 'committee-1', 'user-1');
		expect(result).toEqual({
			conference: { slug: 'thimun-2027', name: 'THIMUN 2027' },
			committee: { slug: 'disec', heading: 'DISEC' },
			papersTitle: 'Resolutions',
			kindOptions: [
				{ value: 'working_paper', label: 'Working paper' },
				{ value: 'draft_resolution', label: 'Draft resolution' }
			],
			topics: ['Lethal autonomous weapons', 'Cyber security'],
			basedOnChoices: [{ id: CONTROL.id, label: 'Working paper 1.1 · Meaningful human control' }],
			values: {
				kind: 'working_paper',
				title: '',
				topic: 'Lethal autonomous weapons',
				sourcePaperIds: []
			}
		});
		expect(listIntroducedWorkingPapers).toHaveBeenCalledWith(SUPABASE, 'committee-1');
	});

	it('offers only the kinds the committee writes, starting on the first', async () => {
		vi.mocked(readPaperCommittee).mockResolvedValue({ ...SETTINGS, hasWorkingPapers: false });
		const thimun = (await load(makeEvent())) as NewPaperData;

		expect(thimun.kindOptions).toEqual([{ value: 'draft_resolution', label: 'Draft resolution' }]);
		expect(thimun.values.kind).toBe('draft_resolution');

		vi.mocked(readPaperCommittee).mockResolvedValue({ ...SETTINGS, format: 'crisis' });
		const crisis = (await load(makeEvent())) as NewPaperData;

		expect(crisis.kindOptions).toEqual([
			{ value: 'committee_directive', label: 'Committee directive' },
			{ value: 'joint_directive', label: 'Joint directive' },
			{ value: 'personal_directive', label: 'Personal directive' },
			{ value: 'press_release', label: 'Press release' }
		]);
		expect(crisis.values.kind).toBe('committee_directive');
		// A crisis committee that writes no draft resolution has nothing to base one on.
		expect(crisis.basedOnChoices).toEqual([]);
		expect(listIntroducedWorkingPapers).toHaveBeenCalledTimes(1);
	});

	it('tells anybody who may not start a paper here that the page does not exist', async () => {
		const turnedAway: [string, () => void][] = [
			['a chair, who holds no seat', () => vi.mocked(readMyPaperSeat).mockResolvedValue(null)],
			[
				'an observer, who may sign but never write',
				() => vi.mocked(readMyPaperSeat).mockResolvedValue({ ...FRANCE, isObserver: true })
			]
		];

		for (const [reader, standIn] of turnedAway) {
			vi.mocked(readMyPaperSeat).mockResolvedValue(FRANCE);
			vi.mocked(readPaperCommittee).mockResolvedValue(SETTINGS);
			standIn();

			await expect(load(makeEvent()), reader).rejects.toMatchObject({ status: 404 });
		}
	});

	it('reads nothing more when the gate turns the reader away', async () => {
		vi.mocked(requireRoomWatcher).mockImplementation(() => error(404, 'Not found'));

		await expect(load(makeEvent())).rejects.toMatchObject({ status: 404 });
		expect(readPaperCommittee).not.toHaveBeenCalled();
	});
});

describe('actions.start', () => {
	it("starts the paper with the reader's seat as its lead, and opens it", async () => {
		vi.mocked(startPaper).mockResolvedValue({ paperId: 'paper-1', refusal: null });

		const form = newPaperForm('  Meaningful human control ', 'Lethal autonomous weapons');

		await expect(actions.start(makeEvent(form))).rejects.toMatchObject({
			status: 303,
			location: committeePaperUrl('thimun-2027', 'disec', 'paper-1')
		});
		expect(startPaper).toHaveBeenCalledWith(SUPABASE, {
			committeeId: 'committee-1',
			kind: 'working_paper',
			title: 'Meaningful human control',
			topic: 'Lethal autonomous weapons',
			sourcePaperIds: []
		});
	});

	it('starts a draft resolution based on the working papers ticked', async () => {
		vi.mocked(startPaper).mockResolvedValue({ paperId: 'paper-2', refusal: null });

		const form = newPaperForm(
			'Meaningful human control',
			'Lethal autonomous weapons',
			'draft_resolution',
			[CONTROL.id]
		);

		await expect(actions.start(makeEvent(form))).rejects.toMatchObject({ status: 303 });
		expect(startPaper).toHaveBeenCalledWith(SUPABASE, {
			committeeId: 'committee-1',
			kind: 'draft_resolution',
			title: 'Meaningful human control',
			topic: 'Lethal autonomous weapons',
			sourcePaperIds: [CONTROL.id]
		});
	});

	it('ignores the ticked working papers for any other kind, as the form sends them without JavaScript', async () => {
		vi.mocked(startPaper).mockResolvedValue({ paperId: 'paper-1', refusal: null });

		const form = newPaperForm(
			'Meaningful human control',
			'Lethal autonomous weapons',
			'working_paper',
			[CONTROL.id]
		);

		await expect(actions.start(makeEvent(form))).rejects.toMatchObject({ status: 303 });
		expect(startPaper).toHaveBeenCalledWith(
			SUPABASE,
			expect.objectContaining({ kind: 'working_paper', sourcePaperIds: [] })
		);
	});

	it('refuses a kind the committee does not write, without asking the database', async () => {
		vi.mocked(readPaperCommittee).mockResolvedValue({ ...SETTINGS, hasWorkingPapers: false });

		const result = await actions.start(
			makeEvent(newPaperForm('Meaningful human control', 'Cyber security', 'working_paper'))
		);

		expect(result).toMatchObject({
			status: 400,
			data: {
				values: { kind: 'draft_resolution' },
				errors: { kind: 'Choose the kind of paper.' }
			}
		});
		expect(startPaper).not.toHaveBeenCalled();
	});

	it('keeps what was typed and says beside each field what is wrong, without asking the database', async () => {
		const result = await actions.start(makeEvent(newPaperForm('', 'Climate finance')));

		expect(result).toEqual({
			status: 400,
			data: {
				values: { kind: 'working_paper', title: '', topic: 'Climate finance', sourcePaperIds: [] },
				errors: {
					title: 'Give the paper a title.',
					topic: 'Choose the topic the paper is on.'
				}
			}
		});
		expect(startPaper).not.toHaveBeenCalled();
	});

	it("hands the database's refusal on as a toast, keeping what was typed", async () => {
		const message = 'Only a delegate of this committee may start a paper in it.';
		vi.mocked(startPaper).mockResolvedValue({ paperId: null, refusal: message });

		const form = newPaperForm('Meaningful human control', 'Cyber security');
		const result = await actions.start(makeEvent(form));

		expect(result).toEqual({
			status: 400,
			data: {
				values: {
					kind: 'working_paper',
					title: 'Meaningful human control',
					topic: 'Cyber security',
					sourcePaperIds: []
				},
				errors: {},
				flash: { tone: 'error', message }
			}
		});
	});

	it('asks again who may start a paper, since the form is its own request', async () => {
		vi.mocked(readMyPaperSeat).mockResolvedValue({ ...FRANCE, isObserver: true });

		const form = newPaperForm('Meaningful human control', 'Cyber security');

		await expect(actions.start(makeEvent(form))).rejects.toMatchObject({ status: 404 });
		expect(startPaper).not.toHaveBeenCalled();
	});
});

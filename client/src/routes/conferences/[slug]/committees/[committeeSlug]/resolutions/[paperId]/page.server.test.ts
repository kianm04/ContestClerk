import { error } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the actions are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
import type { ChairCommittee } from '$lib/chair-room';
import {
	COMMITTEE_PAPER_MESSAGES,
	authorWords,
	type CommitteePaper,
	type PaperCommittee,
	paperLiveWriters,
	type PaperPerson
} from '$lib/committee-papers';
import type { Conference } from '$lib/conferences';
import type { PaperThread } from '$lib/paper-comments';
import { PAPER_SCREEN_MESSAGES } from '$lib/papers-on-floor';
import type { LivePaperSetup } from '$lib/paper-live.svelte';
import type { PaperDraft } from '$lib/paper-writing';
import { committeePaperUrl, committeePapersUrl } from '$lib/urls';
import { refuseWriting } from '$lib/server/paper-draft-form';

// The gate, the reads and the database's changes are stood in for, so these
// tests are about what the route decides on top of them: who writes and who
// reads, which dialog is open, and what each action answers. Each stand-in has
// its own tests next to its module, and the database's rules have theirs in
// `tests/db`. Reading the posted form and drawing the text stay real.
vi.mock('$lib/server/access', () => ({ requireRoomWatcher: vi.fn() }));
vi.mock('$lib/server/committee-papers', () => ({
	mayWritePaper: vi.fn(),
	readCommitteePaper: vi.fn(),
	readMyPaperSeat: vi.fn(),
	readPaperCommittee: vi.fn(),
	readPaperPeople: vi.fn()
}));
vi.mock('$lib/server/committee-paper-authors', () => ({
	addPaperAuthor: vi.fn(),
	deletePaper: vi.fn(),
	handPaperLead: vi.fn(),
	leavePaper: vi.fn(),
	listSeatsToAdd: vi.fn()
}));
// The form is read for real, so the tests see what a posted form becomes.
vi.mock('$lib/server/committee-paper-writing', async (importOriginal) => ({
	readCommitteePaperForm: ((await importOriginal<object>()) as { readCommitteePaperForm: unknown })
		.readCommitteePaperForm,
	readCommitteePaperDraft: vi.fn(),
	readCommitteePaperSetup: vi.fn(),
	saveCommitteePaperFromForm: vi.fn()
}));
vi.mock('$lib/server/committee-paper-submitting', () => ({
	readPaperChair: vi.fn(),
	readPaperDecision: vi.fn(),
	submitCommitteePaper: vi.fn(),
	withdrawCommitteePaper: vi.fn()
}));
vi.mock('$lib/server/crisis-desk', () => ({ readCrisisAnswer: vi.fn() }));
vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));
vi.mock('$lib/server/paper-votes', () => ({ readPaperVote: vi.fn() }));
vi.mock('$lib/server/papers-on-floor', () => ({
	mayRunRoom: vi.fn(),
	readPaperOnFloor: vi.fn(),
	showPaperOnScreen: vi.fn(),
	stepDisplayedClause: vi.fn(),
	takePaperOffScreen: vi.fn()
}));
vi.mock('$lib/server/paper-comments', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/paper-comments')>()),
	readPaperThreads: vi.fn(),
	markThreadNotificationsRead: vi.fn(),
	startPaperThread: vi.fn()
}));

import { requireRoomWatcher } from '$lib/server/access';
import {
	addPaperAuthor,
	deletePaper,
	handPaperLead,
	leavePaper,
	listSeatsToAdd
} from '$lib/server/committee-paper-authors';
import {
	readPaperChair,
	readPaperDecision,
	submitCommitteePaper,
	withdrawCommitteePaper
} from '$lib/server/committee-paper-submitting';
import {
	readCommitteePaperDraft,
	readCommitteePaperSetup,
	saveCommitteePaperFromForm
} from '$lib/server/committee-paper-writing';
import {
	mayWritePaper,
	readCommitteePaper,
	readMyPaperSeat,
	readPaperCommittee,
	readPaperPeople
} from '$lib/server/committee-papers';
import { readCrisisAnswer } from '$lib/server/crisis-desk';
import { setFlash } from '$lib/server/flash';
import { readPaperVote } from '$lib/server/paper-votes';
import {
	mayRunRoom,
	readPaperOnFloor,
	showPaperOnScreen,
	stepDisplayedClause,
	takePaperOffScreen
} from '$lib/server/papers-on-floor';
import {
	markThreadNotificationsRead,
	readPaperThreads,
	startPaperThread
} from '$lib/server/paper-comments';

/** A paper still waiting to be introduced, as most of these tests' paper is. */
const NOT_INTRODUCED = {
	introducedAt: null,
	isOnScreen: false,
	mayShowOnScreen: false,
	screenStep: null
};

/** The Supabase client. This route only ever hands it on to `$lib/server`. */
const SUPABASE = {};

/** The cookies, which only the stood-in `setFlash` is handed. */
const COOKIES = {};

const CONFERENCE = {
	id: 'conference-1',
	slug: 'thimun-2027',
	name: 'THIMUN 2027',
	timezone: 'Europe/Amsterdam'
} as Conference;

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

/** Seat ids are `uuid`s, as the forms below post them and `readChosenSeat` checks. */
const FRANCE_SEAT_ID = '0b9d6f3e-2a47-4c1e-9f5a-1d2c3b4a5e6f';
const MEXICO_SEAT_ID = '7c1e2d3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f';

/** France's working paper, being written. Tests spread it and change what they need. */
const PAPER: CommitteePaper = {
	id: 'paper-1',
	kind: 'working_paper',
	status: 'writing',
	title: 'Meaningful human control',
	topic: 'Lethal autonomous weapons',
	topicNumber: null,
	sequence: null,
	isOpenForSignatures: false,
	signaturesOpenedAt: null,
	submittedAt: null,
	leadSeatId: FRANCE_SEAT_ID,
	body: '*Recalling* the Convention on Certain Conventional Weapons,',
	revision: 4,
	updatedAt: '2026-10-09T09:00:00Z',
	updatedById: 'user-1'
};

/** The reader's own seat, which leads the paper. */
const FRANCE: PaperPerson = {
	seatId: FRANCE_SEAT_ID,
	seatName: 'France',
	countryCode: 'FR',
	holderId: 'user-1',
	holderName: 'Clara Whitfield',
	role: 'author',
	isLead: true,
	isMine: true
};

/** Another author of the paper. */
const MEXICO: PaperPerson = {
	seatId: MEXICO_SEAT_ID,
	seatName: 'Mexico',
	countryCode: 'MX',
	holderId: 'user-2',
	holderName: 'Daniel Osei',
	role: 'author',
	isLead: false,
	isMine: false
};

const DRAFT: PaperDraft = {
	body: PAPER.body,
	revision: 4,
	updatedAt: '2026-10-09T09:00:00Z',
	updatedById: 'user-1',
	updatedByName: 'Clara Whitfield'
};

const LIVE: LivePaperSetup = {
	topic: 'committee-paper:paper-1:1',
	epoch: { paperId: 'paper-1', epoch: 1 },
	documentState: null,
	openSuggestions: 0,
	writer: { id: 'user-1', name: 'Clara Whitfield', seatName: 'France' },
	writers: [{ id: 'user-1', name: 'Clara Whitfield', seatName: 'France' }]
};

const SEATS_TO_ADD = [{ value: 'seat-br', label: 'Brazil' }];

/** A thread on the paper, opened by the reader's own comment. */
const THREAD: PaperThread = {
	id: 'thread-1',
	fragment: 'body',
	anchorStart: 'AQ==',
	anchorEnd: 'Ag==',
	quotedText: 'meaningful human control',
	suggestionId: null,
	isResolved: false,
	resolvedByName: null,
	comments: [
		{
			id: 'comment-1',
			writerName: 'Tomás Fernández',
			seatName: 'France',
			body: 'Whose control?',
			isDeleted: false,
			writtenAt: '10:31',
			isMine: true
		}
	]
};

/** A visit to the paper, or a post to one of its actions when `formData` is given. */
function makeEvent(formData?: FormData, search = ''): PageServerLoadEvent & RequestEvent {
	return {
		params: { slug: 'thimun-2027', committeeSlug: 'disec', paperId: 'paper-1' },
		url: new URL(
			`http://localhost/conferences/thimun-2027/committees/disec/resolutions/paper-1${search}`
		),
		locals: { supabase: SUPABASE },
		depends: vi.fn(),
		cookies: COOKIES,
		request: { formData: async () => formData ?? new FormData() }
	} as unknown as PageServerLoadEvent & RequestEvent;
}

/** A form with these fields, as the writer or one of the people's buttons posts it. */
function postedForm(fields: Record<string, string>): FormData {
	const formData = new FormData();
	for (const [name, value] of Object.entries(fields)) formData.set(name, value);
	return formData;
}

/** What an action answers when it refuses with a toast and leaves the page as it was. */
function refusedWith(message: string) {
	return { status: 400, data: { flash: { tone: 'error', message } } };
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(requireRoomWatcher).mockResolvedValue({
		user: { id: 'user-1' },
		conference: CONFERENCE,
		committee: COMMITTEE
	} as Awaited<ReturnType<typeof requireRoomWatcher>>);
	vi.mocked(readCommitteePaper).mockResolvedValue(PAPER);
	vi.mocked(readPaperCommittee).mockResolvedValue(SETTINGS);
	vi.mocked(readMyPaperSeat).mockResolvedValue({
		id: FRANCE_SEAT_ID,
		name: 'France',
		isObserver: false
	});
	vi.mocked(mayWritePaper).mockResolvedValue(true);
	vi.mocked(readPaperPeople).mockResolvedValue([FRANCE, MEXICO]);
	vi.mocked(readCommitteePaperDraft).mockResolvedValue(DRAFT);
	vi.mocked(readCommitteePaperSetup).mockResolvedValue(LIVE);
	vi.mocked(listSeatsToAdd).mockResolvedValue(SEATS_TO_ADD);
	// `clearAllMocks` keeps what a test told a stand-in to answer, so these start agreeing again.
	vi.mocked(addPaperAuthor).mockResolvedValue({ refusal: null });
	vi.mocked(handPaperLead).mockResolvedValue({ refusal: null });
	vi.mocked(leavePaper).mockResolvedValue({ refusal: null });
	vi.mocked(deletePaper).mockResolvedValue({ refusal: null });
	vi.mocked(readPaperDecision).mockResolvedValue(null);
	vi.mocked(readPaperChair).mockResolvedValue({ name: 'Eleanor Price', title: 'Chair' });
	vi.mocked(submitCommitteePaper).mockResolvedValue({ refusal: null });
	vi.mocked(withdrawCommitteePaper).mockResolvedValue({ refusal: null });
	vi.mocked(readPaperThreads).mockResolvedValue([THREAD]);
	vi.mocked(readPaperOnFloor).mockResolvedValue(NOT_INTRODUCED);
	vi.mocked(showPaperOnScreen).mockResolvedValue(null);
	vi.mocked(takePaperOffScreen).mockResolvedValue();
	// The screen's buttons are the dais's: the reader runs the room unless a test says not.
	vi.mocked(mayRunRoom).mockResolvedValue(true);
	vi.mocked(readCrisisAnswer).mockResolvedValue(null);
	vi.mocked(readPaperVote).mockResolvedValue(null);
});

describe('load', () => {
	it('lets an author write the paper live, with its people and what they may do to them', async () => {
		const event = makeEvent();

		const result = await load(event);

		expect(requireRoomWatcher).toHaveBeenCalledWith(
			event.locals,
			event.url,
			'thimun-2027',
			'disec'
		);
		expect(readCommitteePaper).toHaveBeenCalledWith(SUPABASE, 'committee-1', 'paper-1');
		expect(readPaperPeople).toHaveBeenCalledWith(SUPABASE, PAPER, FRANCE_SEAT_ID);
		// The other authors see the reader by name, with their seat, over their cursor.
		// The other authors, as the server knows them, so the page names a cursor only from that list.
		expect(readCommitteePaperSetup).toHaveBeenCalledWith(
			SUPABASE,
			PAPER,
			LIVE.writer,
			paperLiveWriters([FRANCE, MEXICO])
		);
		expect(result).toEqual({
			conference: { slug: 'thimun-2027', name: 'THIMUN 2027', timezone: 'Europe/Amsterdam' },
			committee: { slug: 'disec', heading: 'DISEC' },
			papersTitle: 'Resolutions',
			paper: {
				id: 'paper-1',
				kind: 'working_paper',
				title: 'Meaningful human control',
				topic: 'Lethal autonomous weapons',
				topicNumber: null,
				sequence: null
			},
			people: [FRANCE, MEXICO],
			words: authorWords('sponsors_and_signatories'),
			// France leads with Mexico beside it, so it may hand the lead on and leave.
			actions: {
				canAdd: true,
				canHandLead: true,
				canLeave: true,
				canDelete: false,
				canSubmit: true,
				canWithdraw: false
			},
			// A working paper: nobody signs it, and it has no resolution's heading or support.
			signing: {
				isOpen: false,
				openedAt: null,
				isAuthor: true,
				mySeatName: 'France',
				hasSigned: false,
				isBeingWritten: true
			},
			mayComment: true,
			userId: 'user-1',
			resolution: null,
			progress: {
				status: 'writing',
				submittedAt: null,
				decision: null,
				chair: null,
				answer: null,
				crisisPanel: null,
				vote: null,
				recordHref: null
			},
			dialog: null,
			seatsToAdd: [],
			writing: { draft: DRAFT, live: LIVE },
			threads: [THREAD],
			floor: NOT_INTRODUCED,
			areThreadsClosed: false,
			commentAddress: null,
			bodyHtml: null,
			introduced: null,
			proposeHref: null,
			withdrawingAmendment: null
		});
		expect(listSeatsToAdd).not.toHaveBeenCalled();
	});

	it('gives anybody else who may read the paper its text, made safe to draw, and no editor', async () => {
		// The chair: no seat in the committee, so not one of the paper's authors.
		vi.mocked(readMyPaperSeat).mockResolvedValue(null);
		vi.mocked(mayWritePaper).mockResolvedValue(false);
		vi.mocked(readPaperPeople).mockResolvedValue([{ ...FRANCE, isMine: false }, MEXICO]);

		const result = await load(makeEvent());

		expect(readPaperPeople).toHaveBeenCalledWith(SUPABASE, PAPER, null);
		expect(result).toMatchObject({
			actions: {
				canAdd: false,
				canHandLead: false,
				canLeave: false,
				canDelete: false,
				canSubmit: false,
				canWithdraw: false
			},
			writing: null,
			bodyHtml: expect.stringContaining('<p><em>Recalling</em> the Convention'),
			threads: []
		});
		expect(readCommitteePaperDraft).not.toHaveBeenCalled();
		expect(readCommitteePaperSetup).not.toHaveBeenCalled();
		expect(readPaperThreads).not.toHaveBeenCalled();
	});

	it('reads the threads in the conference’s time, and marks their notifications read', async () => {
		const event = makeEvent();

		await load(event);

		expect(event.depends).toHaveBeenCalledWith('paper-threads:paper-1');
		expect(readPaperThreads).toHaveBeenCalledWith(
			SUPABASE,
			{ kind: 'committee', paperId: 'paper-1' },
			{ id: 'user-1', committeeId: 'committee-1', timeZone: 'Europe/Amsterdam' }
		);
		expect(markThreadNotificationsRead).toHaveBeenCalledWith(SUPABASE, 'user-1', ['thread-1']);
	});

	it('opens the reader’s own comment that the address names, to change or delete', async () => {
		const editing = await load(makeEvent(undefined, '?editComment=comment-1'));
		const deleting = await load(makeEvent(undefined, '?deleteComment=comment-1'));

		expect(editing).toMatchObject({
			commentAddress: { action: 'edit', threadId: 'thread-1', comment: THREAD.comments[0] }
		});
		expect(deleting).toMatchObject({ commentAddress: { action: 'delete' } });
	});

	it('opens the dialog the address names, and reads the seats to add only for "Add an author"', async () => {
		const adding = await load(makeEvent(undefined, '?add=1'));
		expect(adding).toMatchObject({ dialog: 'add', seatsToAdd: SEATS_TO_ADD });
		expect(listSeatsToAdd).toHaveBeenCalledWith(SUPABASE, 'committee-1', [FRANCE, MEXICO]);

		vi.mocked(listSeatsToAdd).mockClear();
		const leaving = await load(makeEvent(undefined, '?leave=1'));
		expect(leaving).toMatchObject({ dialog: 'leave', seatsToAdd: [] });
		expect(listSeatsToAdd).not.toHaveBeenCalled();
	});

	it('opens no dialog for a reader who may not use it, as from an old link', async () => {
		vi.mocked(mayWritePaper).mockResolvedValue(false);

		const result = await load(makeEvent(undefined, '?add=1'));

		expect(result).toMatchObject({ dialog: null, seatsToAdd: [] });
		expect(listSeatsToAdd).not.toHaveBeenCalled();
	});

	it('tells a reader the paper is not shown to that it does not exist', async () => {
		vi.mocked(readCommitteePaper).mockResolvedValue(null);

		await expect(load(makeEvent())).rejects.toMatchObject({ status: 404 });
		expect(readPaperPeople).not.toHaveBeenCalled();
	});

	it('reads nothing when the gate turns the reader away', async () => {
		vi.mocked(requireRoomWatcher).mockImplementation(() => error(404, 'Not found'));

		await expect(load(makeEvent())).rejects.toMatchObject({ status: 404 });
		expect(readCommitteePaper).not.toHaveBeenCalled();
	});
});

describe('actions.saveDraft', () => {
	it("answers the live editor's save with the revision and the other authors' changes, without a redirect", async () => {
		vi.mocked(saveCommitteePaperFromForm).mockResolvedValue({
			refusal: null,
			revision: 5,
			missing: 'AAI='
		});
		const form = postedForm({ body: 'Text', revision: '4', background: '1', document: 'AAE=' });

		const result = await actions.saveDraft(makeEvent(form));

		expect(result).toEqual({ draftSaved: { revision: 5, missing: 'AAI=' } });
		expect(saveCommitteePaperFromForm).toHaveBeenCalledWith(SUPABASE, PAPER, {
			body: 'Text',
			baseRevision: 4,
			isBackground: true,
			document: 'AAE='
		});
		expect(setFlash).not.toHaveBeenCalled();
	});

	it('sends "Save changes" without JavaScript back to the paper, saying it was saved', async () => {
		vi.mocked(saveCommitteePaperFromForm).mockResolvedValue({
			refusal: null,
			revision: 5,
			missing: null
		});
		const form = postedForm({ body: 'Line\r\nTwo', revision: '4' });

		await expect(actions.saveDraft(makeEvent(form))).rejects.toMatchObject({
			status: 303,
			location: committeePaperUrl('thimun-2027', 'disec', 'paper-1')
		});
		// Windows line ends are saved as plain ones.
		expect(saveCommitteePaperFromForm).toHaveBeenCalledWith(SUPABASE, PAPER, {
			body: 'Line\nTwo',
			baseRevision: 4,
			isBackground: false,
			document: null
		});
		expect(setFlash).toHaveBeenCalledWith(COOKIES, { tone: 'success', message: 'Changes saved.' });
	});

	it('hands a refused save back as it is, with the text still in it', async () => {
		const conflict = { revision: 6, theirs: null };
		const refusal = refuseWriting(409, COMMITTEE_PAPER_MESSAGES.conflict, 'Text', conflict);
		vi.mocked(saveCommitteePaperFromForm).mockResolvedValue({ refusal });

		const result = await actions.saveDraft(makeEvent(postedForm({ body: 'Text', revision: '4' })));

		expect(result).toBe(refusal);
		expect(setFlash).not.toHaveBeenCalled();
	});
});

describe('actions.addAuthor', () => {
	it('adds the chosen seat and, back on the paper, says it is now an author', async () => {
		const form = postedForm({ seatId: MEXICO_SEAT_ID });

		await expect(actions.addAuthor(makeEvent(form))).rejects.toMatchObject({
			status: 303,
			location: committeePaperUrl('thimun-2027', 'disec', 'paper-1')
		});
		expect(addPaperAuthor).toHaveBeenCalledWith(SUPABASE, 'paper-1', MEXICO_SEAT_ID);
		// The seat is named as the paper's people are read once it is on them.
		expect(readPaperPeople).toHaveBeenCalledWith(SUPABASE, PAPER, null);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Mexico is now an author.'
		});
	});

	it('refuses a form that chose no seat, without asking the database', async () => {
		const result = await actions.addAuthor(makeEvent(postedForm({ seatId: '' })));

		expect(result).toEqual(refusedWith('Choose the seat to add.'));
		expect(addPaperAuthor).not.toHaveBeenCalled();
	});

	it("hands the database's refusal on as a toast, staying on the paper", async () => {
		vi.mocked(addPaperAuthor).mockResolvedValue({ refusal: 'Nobody holds that seat yet.' });

		const result = await actions.addAuthor(makeEvent(postedForm({ seatId: MEXICO_SEAT_ID })));

		expect(result).toEqual(refusedWith('Nobody holds that seat yet.'));
		expect(setFlash).not.toHaveBeenCalled();
	});

	it('names nobody when the seat is no longer on the paper by the time it is read', async () => {
		vi.mocked(readPaperPeople).mockResolvedValue([FRANCE]);
		const form = postedForm({ seatId: MEXICO_SEAT_ID });

		await expect(actions.addAuthor(makeEvent(form))).rejects.toMatchObject({ status: 303 });
		expect(setFlash).not.toHaveBeenCalled();
	});
});

describe('actions.makeLead', () => {
	it("hands the lead to the chosen author and says so in the committee's words", async () => {
		vi.mocked(readPaperCommittee).mockResolvedValue({ ...SETTINGS, paperWords: 'submitters' });
		const form = postedForm({ seatId: MEXICO_SEAT_ID });

		await expect(actions.makeLead(makeEvent(form))).rejects.toMatchObject({
			status: 303,
			location: committeePaperUrl('thimun-2027', 'disec', 'paper-1')
		});
		expect(handPaperLead).toHaveBeenCalledWith(SUPABASE, 'paper-1', MEXICO_SEAT_ID);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Mexico is now the main submitter.'
		});
	});

	it("refuses a form that chose no author, and hands the database's refusal on", async () => {
		const unchosen = await actions.makeLead(makeEvent(postedForm({ seatId: '' })));
		expect(unchosen).toEqual(refusedWith('Choose the author to hand the lead to.'));
		expect(handPaperLead).not.toHaveBeenCalled();

		const message = 'Only the lead author can hand the lead on.';
		vi.mocked(handPaperLead).mockResolvedValue({ refusal: message });
		const refused = await actions.makeLead(makeEvent(postedForm({ seatId: MEXICO_SEAT_ID })));
		expect(refused).toEqual(refusedWith(message));
		expect(setFlash).not.toHaveBeenCalled();
	});
});

describe('actions.leave', () => {
	it("takes the reader's seat off the paper and goes back to the committee's papers", async () => {
		await expect(actions.leave(makeEvent())).rejects.toMatchObject({
			status: 303,
			location: committeePapersUrl('thimun-2027', 'disec')
		});
		expect(leavePaper).toHaveBeenCalledWith(SUPABASE, 'paper-1');
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'You left “Meaningful human control”.'
		});
	});

	it("hands the database's refusal on, staying on the paper", async () => {
		const message = 'Another author has to remain. Withdraw the paper instead.';
		vi.mocked(leavePaper).mockResolvedValue({ refusal: message });

		expect(await actions.leave(makeEvent())).toEqual(refusedWith(message));
		expect(setFlash).not.toHaveBeenCalled();
	});
});

describe('actions.delete', () => {
	it('deletes the paper and goes back to the list, naming the paper by its kind', async () => {
		await expect(actions.delete(makeEvent())).rejects.toMatchObject({
			status: 303,
			location: committeePapersUrl('thimun-2027', 'disec')
		});
		expect(deletePaper).toHaveBeenCalledWith(SUPABASE, 'paper-1');
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Working paper deleted.'
		});
	});

	it("hands the database's refusal on, staying on the paper", async () => {
		const message = 'Only the lead author can delete a paper that has never been submitted.';
		vi.mocked(deletePaper).mockResolvedValue({ refusal: message });

		expect(await actions.delete(makeEvent())).toEqual(refusedWith(message));
		expect(setFlash).not.toHaveBeenCalled();
	});
});

describe('actions.submit and actions.withdraw', () => {
	it('submit the paper and come back to it, saying it is with the dais', async () => {
		await expect(actions.submit(makeEvent())).rejects.toMatchObject({
			status: 303,
			location: committeePaperUrl('thimun-2027', 'disec', 'paper-1')
		});
		expect(submitCommitteePaper).toHaveBeenCalledWith(SUPABASE, PAPER);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: '“Meaningful human control” is with the dais.'
		});
	});

	it('send a directive to the crisis staff, saying so', async () => {
		vi.mocked(readPaperCommittee).mockResolvedValue({ ...SETTINGS, format: 'crisis' });
		vi.mocked(readCommitteePaper).mockResolvedValue({ ...PAPER, kind: 'personal_directive' });

		await expect(actions.submit(makeEvent())).rejects.toMatchObject({ status: 303 });
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: '“Meaningful human control” is with the crisis staff.'
		});
	});

	it('withdraw it, and hand on what the database refuses', async () => {
		await expect(actions.withdraw(makeEvent())).rejects.toMatchObject({ status: 303 });
		expect(withdrawCommitteePaper).toHaveBeenCalledWith(SUPABASE, 'paper-1');

		const message = 'Close the open vote first.';
		vi.mocked(withdrawCommitteePaper).mockResolvedValue({ refusal: message });
		vi.mocked(setFlash).mockClear();

		expect(await actions.withdraw(makeEvent())).toEqual(refusedWith(message));
		expect(setFlash).not.toHaveBeenCalled();
	});
});

describe('the paper’s progress', () => {
	it('names the chair to the authors of a submitted paper, with what the dais decided', async () => {
		const submitted = {
			...PAPER,
			status: 'submitted' as const,
			submittedAt: '2099-03-15T09:12:00Z'
		};
		vi.mocked(readCommitteePaper).mockResolvedValue(submitted);
		vi.mocked(mayWritePaper).mockResolvedValue(false);

		expect(await load(makeEvent())).toMatchObject({
			progress: {
				status: 'submitted',
				submittedAt: '2099-03-15T09:12:00Z',
				decision: null,
				chair: { name: 'Eleanor Price', title: 'Chair' }
			}
		});
	});

	it('says how the vote went on a passed paper, and links its record copy', async () => {
		const vote = {
			passed: true,
			counts: { for: 31, against: 6, abstain: 7 },
			closedAt: '2099-03-16T16:40:00Z'
		};
		// The route decides the same for every kind; a working paper keeps the resolution's reads out.
		const passed = { ...PAPER, status: 'passed' as const };
		vi.mocked(readCommitteePaper).mockResolvedValue(passed);
		vi.mocked(mayWritePaper).mockResolvedValue(false);
		vi.mocked(readPaperVote).mockResolvedValue(vote);

		expect(await load(makeEvent())).toMatchObject({
			progress: {
				vote,
				recordHref: '/conferences/thimun-2027/committees/disec/resolutions/paper-1/print'
			}
		});
		expect(readPaperVote).toHaveBeenCalledWith(SUPABASE, 'paper-1');
	});

	it('gives a failed paper its vote and no record copy', async () => {
		const failed = { ...PAPER, status: 'failed' as const };
		vi.mocked(readCommitteePaper).mockResolvedValue(failed);
		vi.mocked(mayWritePaper).mockResolvedValue(false);

		expect(await load(makeEvent())).toMatchObject({ progress: { vote: null, recordHref: null } });
		expect(readPaperVote).toHaveBeenCalled();
	});

	it('reads no chair while the paper is still being written', async () => {
		expect(await load(makeEvent())).toMatchObject({ progress: { chair: null } });
		expect(readPaperChair).not.toHaveBeenCalled();
		expect(readCrisisAnswer).not.toHaveBeenCalled();
		expect(readPaperVote).not.toHaveBeenCalled();
	});

	it("shows the authors of a personal directive the crisis staff's answer", async () => {
		const answered = {
			...PAPER,
			kind: 'personal_directive' as const,
			status: 'carried_out' as const,
			submittedAt: '2099-03-15T09:12:00Z'
		};
		const answer = {
			outcome: 'carried_out' as const,
			text: 'The fleet sails at dawn.',
			answeredAt: '2099-03-15T10:02:00Z'
		};
		vi.mocked(readPaperCommittee).mockResolvedValue({ ...SETTINGS, format: 'crisis' });
		vi.mocked(readCommitteePaper).mockResolvedValue(answered);
		vi.mocked(mayWritePaper).mockResolvedValue(false);
		vi.mocked(readPaperPeople).mockResolvedValue([FRANCE]);
		vi.mocked(readCrisisAnswer).mockResolvedValue(answer);

		expect(await load(makeEvent())).toMatchObject({
			progress: {
				answer,
				crisisPanel: {
					title: 'Carried out',
					sentence: 'The fleet sails at dawn.',
					byline: 'Crisis staff · 15 March, 11:02'
				}
			}
		});
		expect(readCrisisAnswer).toHaveBeenCalledWith(SUPABASE, 'paper-1');
	});
});

describe('an introduced paper', () => {
	const INTRODUCED = {
		introducedAt: '2099-03-15T15:12:00Z',
		isOnScreen: false,
		mayShowOnScreen: true,
		screenStep: null
	};

	it('keeps its threads to read, closed, with no comment the address can open', async () => {
		vi.mocked(readCommitteePaper).mockResolvedValue({ ...PAPER, status: 'introduced' });
		vi.mocked(readMyPaperSeat).mockResolvedValue(null);
		vi.mocked(mayWritePaper).mockResolvedValue(false);
		vi.mocked(readPaperOnFloor).mockResolvedValue(INTRODUCED);

		const result = await load(makeEvent(undefined, '?deleteComment=comment-1'));

		expect(readPaperOnFloor).toHaveBeenCalledWith(SUPABASE, 'committee-1', 'paper-1');
		expect(result).toMatchObject({
			floor: INTRODUCED,
			areThreadsClosed: true,
			mayComment: false,
			threads: [THREAD],
			commentAddress: null
		});
	});

	it('closes the margin even to an author or a seat that could sign it', async () => {
		vi.mocked(readPaperOnFloor).mockResolvedValue(INTRODUCED);

		expect(await load(makeEvent())).toMatchObject({ mayComment: false, areThreadsClosed: true });
	});

	it('goes on the screen, by its name, and comes back to its page', async () => {
		await expect(actions.showOnScreen(makeEvent())).rejects.toMatchObject({
			status: 303,
			location: committeePaperUrl('thimun-2027', 'disec', 'paper-1')
		});
		expect(showPaperOnScreen).toHaveBeenCalledWith(SUPABASE, 'committee-1', 'paper-1');
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Working paper is on the screen.'
		});
	});

	it('hands on why it may not go on the screen, staying on the page', async () => {
		const message = 'Only an introduced paper can go on the screen.';
		vi.mocked(showPaperOnScreen).mockResolvedValue(message);

		expect(await actions.showOnScreen(makeEvent())).toEqual(refusedWith(message));
		expect(setFlash).not.toHaveBeenCalled();
	});

	it('comes off the screen, saying so', async () => {
		await expect(actions.takeOffScreen(makeEvent())).rejects.toMatchObject({ status: 303 });
		expect(takePaperOffScreen).toHaveBeenCalledWith(SUPABASE, 'committee-1', 'paper-1');
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Working paper is off the screen.'
		});
	});

	it('moves the screen a clause on and back, coming back to its page', async () => {
		vi.mocked(stepDisplayedClause).mockResolvedValue(null);

		await expect(actions.nextClause(makeEvent())).rejects.toMatchObject({
			status: 303,
			location: committeePaperUrl('thimun-2027', 'disec', 'paper-1')
		});
		await expect(actions.previousClause(makeEvent())).rejects.toMatchObject({ status: 303 });
		expect(stepDisplayedClause).toHaveBeenCalledWith(SUPABASE, 'committee-1', 'paper-1', 'next');
		expect(stepDisplayedClause).toHaveBeenCalledWith(
			SUPABASE,
			'committee-1',
			'paper-1',
			'previous'
		);
	});

	it('refuses every screen button to a reader who does not run the room, writing nothing', async () => {
		// The page offers the buttons to whoever may read the paper, so the
		// question of who runs the room is asked before anything is written.
		vi.mocked(mayRunRoom).mockResolvedValue(false);
		const refusal = refusedWith(PAPER_SCREEN_MESSAGES.notDais);

		expect(await actions.showOnScreen(makeEvent())).toEqual(refusal);
		expect(await actions.takeOffScreen(makeEvent())).toEqual(refusal);
		expect(await actions.nextClause(makeEvent())).toEqual(refusal);
		expect(await actions.previousClause(makeEvent())).toEqual(refusal);
		expect(mayRunRoom).toHaveBeenCalledWith(SUPABASE, 'committee-1');
		expect(showPaperOnScreen).not.toHaveBeenCalled();
		expect(takePaperOffScreen).not.toHaveBeenCalled();
		expect(stepDisplayedClause).not.toHaveBeenCalled();
		expect(setFlash).not.toHaveBeenCalled();
	});
});

describe('the margin’s actions', () => {
	it('start a thread on this paper and come back to it on its page', async () => {
		vi.mocked(startPaperThread).mockResolvedValue({ refusal: null, threadId: 'thread-9' });

		const event = makeEvent(postedForm({ body: 'Whose control?' }));

		await expect(actions.startThread(event)).rejects.toMatchObject({
			status: 303,
			location: `${committeePaperUrl('thimun-2027', 'disec', 'paper-1')}#thread-thread-9`
		});
		expect(startPaperThread).toHaveBeenCalledWith(
			SUPABASE,
			{ kind: 'committee', paperId: 'paper-1' },
			expect.objectContaining({ body: 'Whose control?', anchorStart: null }),
			'body'
		);
	});
});

describe('every action', () => {
	it('asks again whether the reader may see the paper, since each is its own request', async () => {
		vi.mocked(readCommitteePaper).mockResolvedValue(null);

		for (const [name, action] of Object.entries(actions)) {
			const event = makeEvent(postedForm({ seatId: MEXICO_SEAT_ID }));

			await expect(action(event), name).rejects.toMatchObject({ status: 404 });
		}

		const changes = [saveCommitteePaperFromForm, addPaperAuthor, handPaperLead, leavePaper];
		expect(startPaperThread).not.toHaveBeenCalled();
		for (const change of [...changes, deletePaper, showPaperOnScreen, takePaperOffScreen]) {
			expect(change).not.toHaveBeenCalled();
		}
	});
});

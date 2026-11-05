import { error } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the actions are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
import type { DaisAmendmentRow } from '$lib/amendment-queue';
import { PAPER_NUMBER_REFUSAL, RETURN_COMMENT_REFUSAL } from '$lib/chair-resolutions';
import type { CommitteePaper, PaperCommittee, PaperPerson } from '$lib/committee-papers';
import type { PaperSupport } from '$lib/paper-support';
import { chairResolutionUrl, chairResolutionsUrl } from '$lib/urls';

// The gate, the reads and the writes are stood in for, so these tests are
// about what the page decides: which papers it shows, what it offers, what
// each answer sends to the database and where it goes next. The queries have
// their own tests in `src/lib/server/`, and the page runs against a real
// database in `tests/e2e/chair-resolutions.spec.ts`.
vi.mock('$lib/server/access', () => ({ requireCommitteePermission: vi.fn() }));
vi.mock('$lib/server/chair-resolutions', () => ({
	approvePaper: vi.fn(),
	readDaisReview: vi.fn(),
	readDaisWriter: vi.fn(),
	returnPaper: vi.fn(),
	withdrawPaper: vi.fn()
}));
vi.mock('$lib/server/committee-paper-signatures', () => ({ readPaperSupport: vi.fn() }));
vi.mock('$lib/server/committee-papers', () => ({
	readCommitteePaper: vi.fn(),
	readPaperCommittee: vi.fn(),
	readPaperPeople: vi.fn()
}));
vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));
vi.mock('$lib/server/paper-comments', () => ({
	markThreadNotificationsRead: vi.fn(),
	readPaperThreads: vi.fn()
}));
// The margin's own actions have their tests beside them.
vi.mock('$lib/server/paper-comment-actions', () => ({ paperCommentActions: () => ({}) }));
vi.mock('$lib/server/introduced-draft', () => ({ readIntroducedDraft: vi.fn() }));
vi.mock('$lib/server/papers-on-floor', () => ({
	mayRunRoom: vi.fn(),
	readPaperOnFloor: vi.fn(),
	showPaperOnScreen: vi.fn(),
	stepDisplayedClause: vi.fn(),
	takePaperOffScreen: vi.fn()
}));

import { requireCommitteePermission } from '$lib/server/access';
import {
	approvePaper,
	readDaisReview,
	readDaisWriter,
	returnPaper,
	withdrawPaper
} from '$lib/server/chair-resolutions';
import { readPaperSupport } from '$lib/server/committee-paper-signatures';
import {
	readCommitteePaper,
	readPaperCommittee,
	readPaperPeople
} from '$lib/server/committee-papers';
import { setFlash } from '$lib/server/flash';
import { readIntroducedDraft } from '$lib/server/introduced-draft';
import { markThreadNotificationsRead, readPaperThreads } from '$lib/server/paper-comments';
import { mayRunRoom, readPaperOnFloor, stepDisplayedClause } from '$lib/server/papers-on-floor';

/** The Supabase client. The page only hands it on to the server modules above. */
const SUPABASE = {};

/** The cookie jar. Only `setFlash`, which is stood in for, ever touches it. */
const COOKIES = {};

const CONFERENCE_SLUG = 'thimun-2027';
const COMMITTEE_SLUG = 'disec';

const CONFERENCE = {
	id: 'conference-1',
	slug: CONFERENCE_SLUG,
	name: 'THIMUN 2027',
	timezone: 'Europe/London'
};

const COMMITTEE = {
	id: 'committee-1',
	slug: COMMITTEE_SLUG,
	name: 'Disarmament and International Security',
	abbreviation: 'DISEC',
	topics: ['Autonomous weapons']
};

const AUSTRIA: PaperPerson = {
	seatId: 'seat-at',
	seatName: 'Austria',
	countryCode: 'AT',
	holderId: 'user-at',
	holderName: 'Lena',
	role: 'author',
	isLead: true,
	isMine: false
};

/** A draft resolution Austria sent to the dais, as `readCommitteePaper` reads it. */
function makePaper(changes: Partial<CommitteePaper> = {}): CommitteePaper {
	return {
		id: 'paper-1',
		kind: 'draft_resolution',
		topicNumber: null,
		sequence: null,
		status: 'submitted',
		title: 'Human control',
		topic: 'Autonomous weapons',
		isOpenForSignatures: false,
		signaturesOpenedAt: null,
		submittedAt: '2027-03-15T09:12:00Z',
		leadSeatId: 'seat-at',
		body: '*Recalling* the treaty,\n\n1. *Calls upon* every state;',
		revision: 3,
		updatedAt: '2027-03-15T09:12:00Z',
		updatedById: 'user-at',
		...changes
	};
}

/** The page `load`'s event. `parent()` answers what the chair layout returned. */
function makeLoadEvent(search = ''): PageServerLoadEvent {
	return {
		params: { slug: CONFERENCE_SLUG, committeeSlug: COMMITTEE_SLUG, paperId: 'paper-1' },
		url: new URL(`http://localhost/review${search}`),
		locals: { supabase: SUPABASE },
		depends: vi.fn(),
		parent: async () => ({ conference: CONFERENCE, committee: COMMITTEE, readerId: 'chair-1' })
	} as unknown as PageServerLoadEvent;
}

/** A post to one of the page's actions. */
function makeActionEvent(actionName: string, fields: Record<string, string> = {}): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	return {
		params: { slug: CONFERENCE_SLUG, committeeSlug: COMMITTEE_SLUG, paperId: 'paper-1' },
		url: new URL(`http://localhost/review?/${actionName}`),
		locals: { supabase: SUPABASE },
		cookies: COOKIES,
		request: { formData: async () => formData }
	} as unknown as RequestEvent;
}

/** Run something expected to throw, and give back what SvelteKit threw. */
async function catchThrown(run: () => unknown): Promise<{ status: number; location?: string }> {
	try {
		await run();
	} catch (thrown) {
		return thrown as { status: number; location?: string };
	}

	throw new Error('Nothing was thrown.');
}

/** What `fail(...)` gives back: a value the action returns, not throws. */
type FailResult = { status: number; data: { flash: { tone: string; message: string } } };

/**
 * Run `load`. SvelteKit types it as possibly returning nothing, so this checks
 * that it did return, which lets the tests read the fields.
 */
async function loadPage(search = '') {
	const result = await load(makeLoadEvent(search));

	if (!result) throw new Error('load returned nothing');

	return result;
}

const SUPPORT = { rules: { checksFormat: true } } as unknown as PaperSupport;

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(readIntroducedDraft).mockResolvedValue({ cards: [] } as unknown as Awaited<
		ReturnType<typeof readIntroducedDraft>
	>);

	vi.mocked(requireCommitteePermission).mockResolvedValue({
		user: { id: 'chair-1', email: 'chair@example.com' },
		conference: CONFERENCE,
		committee: COMMITTEE
	} as unknown as Awaited<ReturnType<typeof requireCommitteePermission>>);
	vi.mocked(readCommitteePaper).mockResolvedValue(makePaper());
	vi.mocked(readPaperCommittee).mockResolvedValue({
		format: 'standard',
		paperWords: 'sponsors',
		topics: COMMITTEE.topics
	} as unknown as PaperCommittee);
	vi.mocked(readPaperPeople).mockResolvedValue([AUSTRIA]);
	vi.mocked(readDaisReview).mockResolvedValue({
		documentState: null,
		version: 1,
		numbered: []
	});
	vi.mocked(readDaisWriter).mockResolvedValue({ name: 'Eleanor Price', title: 'Chair' });
	vi.mocked(readPaperThreads).mockResolvedValue([]);
	vi.mocked(readPaperSupport).mockResolvedValue(SUPPORT);
	vi.mocked(approvePaper).mockResolvedValue({ refusal: null });
	vi.mocked(returnPaper).mockResolvedValue({ refusal: null });
	vi.mocked(withdrawPaper).mockResolvedValue({ refusal: null });
	vi.mocked(readPaperOnFloor).mockResolvedValue({
		introducedAt: null,
		isOnScreen: false,
		mayShowOnScreen: false,
		screenStep: null
	});
	// The dais reviewing the paper runs the room; the screen's buttons ask again.
	vi.mocked(mayRunRoom).mockResolvedValue(true);
});

describe('load', () => {
	it('shows a submitted draft resolution with the number "Approve" offers', async () => {
		const result = await loadPage();

		expect(readCommitteePaper).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id, 'paper-1');
		expect(result.papersTitle).toBe('Resolutions');
		// The line keeps each "·" on the line before it with a no-break space.
		expect(result.metaLine.replaceAll('\u00a0', ' ')).toBe(
			'Draft resolution · Submitted 15 March, 09:12 by Austria · Version 1'
		);
		expect(result.proposedNumber).toEqual({ topicNumber: 1, sequence: 1 });
		expect(result.support).toBe(SUPPORT);
		expect(result.heading?.lines).toContainEqual({ label: 'Sponsors', value: 'Austria' });
		expect(result.bodyHtml).toContain('Recalling');
		expect(result.writer).toEqual({ name: 'Eleanor Price', title: 'Chair' });
		expect(result.mayComment).toBe(true);
		expect(result.dialog).toBeNull();
		expect(markThreadNotificationsRead).toHaveBeenCalledWith(SUPABASE, 'chair-1', []);
		expect(result.screen).toBeNull();
	});

	it('offers the projector once the paper is introduced, with where it stands', async () => {
		const step = { position: 'Operative clause 2 of 6', hasPrevious: true, hasNext: true };
		vi.mocked(readPaperOnFloor).mockResolvedValue({
			introducedAt: '2027-03-15T10:00:00Z',
			isOnScreen: true,
			mayShowOnScreen: true,
			screenStep: step
		});

		const result = await loadPage();

		expect(readPaperOnFloor).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id, 'paper-1');
		expect(result.screen).toEqual({ isOnScreen: true, step });
	});

	it('opens "Return to the authors" from the address', async () => {
		const result = await loadPage('?return=1');

		expect(result.dialog).toBe('return');
	});

	it('offers no number, and takes no new notes, once the paper is on the floor', async () => {
		vi.mocked(readCommitteePaper).mockResolvedValue(
			makePaper({ status: 'introduced', topicNumber: 1, sequence: 1 })
		);

		const result = await loadPage('?withdraw=1');

		expect(result.proposedNumber).toBeNull();
		expect(result.mayComment).toBe(false);
		expect(result.dialog).toBe('withdraw');
	});

	it("lists an introduced draft's amendments in the order the dais works, and opens a ruling", async () => {
		const card = (id: string, sequence: number, status: 'approved' | 'with_the_dais') => ({
			id,
			sequence,
			name: `Amendment ${sequence}`,
			amendment: { id, sequence, status, parentAmendmentId: null }
		});
		vi.mocked(readCommitteePaper).mockResolvedValue(
			makePaper({ status: 'introduced', topicNumber: 1, sequence: 1 })
		);
		vi.mocked(readIntroducedDraft).mockResolvedValue({
			cards: [card('one', 1, 'approved'), card('two', 2, 'with_the_dais')]
		} as unknown as Awaited<ReturnType<typeof readIntroducedDraft>>);

		const result = await loadPage('?ruleOut=2');

		expect(result.amendments?.map((row: DaisAmendmentRow) => [row.card.id, row.choices])).toEqual([
			['one', { mayDecide: false, mayPutToVote: true }],
			['two', { mayDecide: true, mayPutToVote: false }]
		]);
		expect(result.rulingOut).toEqual({ id: 'two', name: 'Amendment 2' });
	});

	it('opens no ruling for an amendment the dais has already decided', async () => {
		vi.mocked(readCommitteePaper).mockResolvedValue(
			makePaper({ status: 'introduced', topicNumber: 1, sequence: 1 })
		);
		vi.mocked(readIntroducedDraft).mockResolvedValue({
			cards: [{ id: 'one', sequence: 1, amendment: { id: 'one', sequence: 1, status: 'approved' } }]
		} as unknown as Awaited<ReturnType<typeof readIntroducedDraft>>);

		expect((await loadPage('?ruleOut=1')).rulingOut).toBeNull();
	});

	it('reads no support and draws no heading for a working paper', async () => {
		vi.mocked(readCommitteePaper).mockResolvedValue(makePaper({ kind: 'working_paper' }));

		const result = await loadPage();

		expect(readPaperSupport).not.toHaveBeenCalled();
		expect(result.support).toBeNull();
		expect(result.heading).toBeNull();
	});

	it('answers 404 for a paper never sent to the dais, one the crisis staff answer, or none', async () => {
		const papers = [
			makePaper({ status: 'writing', submittedAt: null }),
			makePaper({ kind: 'press_release' }),
			null
		];

		for (const paper of papers) {
			vi.mocked(readCommitteePaper).mockResolvedValue(paper);

			expect((await catchThrown(() => load(makeLoadEvent()))).status).toBe(404);
		}
	});
});

describe('approve', () => {
	it('approves with the number in the box and goes back to the list', async () => {
		const thrown = await catchThrown(() =>
			actions.approve(makeActionEvent('approve', { number: '1.2' }))
		);

		expect(approvePaper).toHaveBeenCalledWith(SUPABASE, 'paper-1', {
			topicNumber: 1,
			sequence: 2
		});
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: '“Human control” approved as Draft resolution 1.2.'
		});
		expect(thrown).toMatchObject({
			status: 303,
			location: chairResolutionsUrl(CONFERENCE_SLUG, COMMITTEE_SLUG)
		});
	});

	it('refuses a number that is not one, and writes nothing', async () => {
		const result = (await actions.approve(
			makeActionEvent('approve', { number: 'one' })
		)) as FailResult;

		expect(result.status).toBe(400);
		expect(result.data.flash.message).toBe(PAPER_NUMBER_REFUSAL);
		expect(approvePaper).not.toHaveBeenCalled();
	});

	it("shows the database's refusal", async () => {
		vi.mocked(approvePaper).mockResolvedValue({ refusal: 'Draft resolution 1.1 is taken.' });

		const result = (await actions.approve(
			makeActionEvent('approve', { number: '1.1' })
		)) as FailResult;

		expect(result.data.flash).toEqual({
			tone: 'error',
			message: 'Draft resolution 1.1 is taken.'
		});
	});

	it('asks again that the reader runs the room, and lets its 404 through', async () => {
		vi.mocked(requireCommitteePermission).mockImplementation(() => {
			error(404, 'This committee does not exist.');
		});

		const thrown = await catchThrown(() =>
			actions.approve(makeActionEvent('approve', { number: '1.1' }))
		);

		expect(thrown.status).toBe(404);
		expect(requireCommitteePermission).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			CONFERENCE_SLUG,
			COMMITTEE_SLUG,
			'run_room'
		);
		expect(approvePaper).not.toHaveBeenCalled();
	});
});

describe('return', () => {
	it('returns the paper with the trimmed comment and goes back to the list', async () => {
		const thrown = await catchThrown(() =>
			actions.return(makeActionEvent('return', { comment: '  Number the clauses.  ' }))
		);

		expect(returnPaper).toHaveBeenCalledWith(SUPABASE, 'paper-1', 'Number the clauses.');
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: '“Human control” returned to its authors.'
		});
		expect(thrown).toMatchObject({
			status: 303,
			location: chairResolutionsUrl(CONFERENCE_SLUG, COMMITTEE_SLUG)
		});
	});

	it('refuses a return without a comment, or with one too long', async () => {
		for (const comment of ['   ', 'x'.repeat(2001)]) {
			const result = (await actions.return(makeActionEvent('return', { comment }))) as FailResult;

			expect(result.data.flash.message).toBe(RETURN_COMMENT_REFUSAL);
		}

		expect(returnPaper).not.toHaveBeenCalled();
	});

	it("shows the database's refusal", async () => {
		vi.mocked(returnPaper).mockResolvedValue({ refusal: 'Only a submitted paper goes back.' });

		const result = (await actions.return(
			makeActionEvent('return', { comment: 'Again.' })
		)) as FailResult;

		expect(result.data.flash.message).toBe('Only a submitted paper goes back.');
	});
});

describe('withdraw', () => {
	it('withdraws an introduced paper and comes back to it', async () => {
		vi.mocked(readCommitteePaper).mockResolvedValue(
			makePaper({ status: 'introduced', topicNumber: 1, sequence: 1 })
		);

		const thrown = await catchThrown(() => actions.withdraw(makeActionEvent('withdraw')));

		expect(withdrawPaper).toHaveBeenCalledWith(SUPABASE, 'paper-1');
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Draft resolution 1.1, “Human control”, withdrawn.'
		});
		expect(thrown).toMatchObject({
			status: 303,
			location: chairResolutionUrl(CONFERENCE_SLUG, COMMITTEE_SLUG, 'paper-1')
		});
	});

	it("shows the database's refusal", async () => {
		vi.mocked(withdrawPaper).mockResolvedValue({ refusal: 'Only an introduced paper.' });

		const result = (await actions.withdraw(makeActionEvent('withdraw'))) as FailResult;

		expect(result.data.flash.message).toBe('Only an introduced paper.');
	});
});

describe('the projector’s buttons', () => {
	it('step the screen through the paper on its committee and come back to the review', async () => {
		vi.mocked(stepDisplayedClause).mockResolvedValue(null);

		const thrown = await catchThrown(() => actions.nextClause(makeActionEvent('nextClause')));

		expect(requireCommitteePermission).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			CONFERENCE_SLUG,
			COMMITTEE_SLUG,
			'run_room'
		);
		expect(stepDisplayedClause).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id, 'paper-1', 'next');
		expect(thrown).toMatchObject({
			status: 303,
			location: chairResolutionUrl(CONFERENCE_SLUG, COMMITTEE_SLUG, 'paper-1')
		});
	});
});

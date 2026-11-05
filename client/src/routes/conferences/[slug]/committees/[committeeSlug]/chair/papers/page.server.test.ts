import { error } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the actions are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
import type { ChairCommittee } from '$lib/chair-room';
import { PAPER_REFUSALS } from '$lib/chair-papers';
import type { Conference } from '$lib/conferences';
import type { BackgroundGuide } from '$lib/documents';
import type { PaperSeatRow } from '$lib/documents-page';
import { chairPapersUrl } from '$lib/urls';

// The gate, the paper queries and the guide's storage are stood in for, so
// these tests are about what the page decides: which seats it lists, which
// refusal each rule answers with, what it writes and where it goes back to.
// The queries have their own tests in `src/lib/server/paper-reviews.test.ts`
// and `src/lib/server/documents.test.ts`, and the page runs against a real
// database in `tests/e2e/chair-papers.spec.ts`.
vi.mock('$lib/server/access', () => ({
	requireCommitteePermission: vi.fn(),
	requireCommitteeTool: vi.fn()
}));

vi.mock('$lib/server/paper-reviews', () => ({
	approveSubmittedPapers: vi.fn(),
	listPaperSeats: vi.fn(),
	reviewCommitteePaper: vi.fn()
}));

vi.mock('$lib/server/documents', () => ({
	getBackgroundGuide: vi.fn(),
	removeBackgroundGuide: vi.fn(),
	uploadBackgroundGuide: vi.fn()
}));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

import { requireCommitteePermission, requireCommitteeTool } from '$lib/server/access';
import {
	getBackgroundGuide,
	removeBackgroundGuide,
	uploadBackgroundGuide
} from '$lib/server/documents';
import { setFlash } from '$lib/server/flash';
import {
	approveSubmittedPapers,
	listPaperSeats,
	reviewCommitteePaper
} from '$lib/server/paper-reviews';

/** The Supabase client. The page only hands it on to the server modules above. */
const SUPABASE = {};

/** The cookie jar. Only `setFlash`, which is stood in for, ever touches it. */
const COOKIES = {};

const CONFERENCE_SLUG = 'thimun-2027';
const COMMITTEE_SLUG = 'unsc';
const PAPERS_PATH = `/conferences/${CONFERENCE_SLUG}/committees/${COMMITTEE_SLUG}/chair/papers`;

const COMMITTEE: ChairCommittee = {
	id: 'committee-1',
	slug: COMMITTEE_SLUG,
	name: 'Security Council',
	abbreviation: 'UNSC',
	room: 'Room 1',
	defaultSpeakingTimeSeconds: 60,
	topics: ['Climate finance']
};

/** Only the fields `load` and the actions read. */
const CONFERENCE = { id: 'conference-1', slug: CONFERENCE_SLUG } as Conference;

/** One seat at each of three statuses. */
const SEATS: PaperSeatRow[] = [
	{
		seatId: 'seat-fr',
		seatName: 'France',
		countryCode: 'FR',
		delegateName: 'Amira',
		delegateAvatarPath: null,
		status: 'submitted',
		paper: {
			id: 'paper-fr',
			fileName: 'france.pdf',
			reviewStatus: 'submitted',
			reviewComment: null,
			reviewedAt: null,
			updatedAt: '2026-01-01T09:00:00Z',
			downloadUrl: 'https://storage.example/france.pdf',
			isWritten: false
		}
	},
	{
		seatId: 'seat-br',
		seatName: 'Brazil',
		countryCode: 'BR',
		delegateName: 'Luis',
		delegateAvatarPath: null,
		status: 'approved',
		paper: {
			id: 'paper-br',
			fileName: 'brazil.pdf',
			reviewStatus: 'approved',
			reviewComment: null,
			reviewedAt: '2026-01-02T09:00:00Z',
			updatedAt: '2026-01-02T09:00:00Z',
			downloadUrl: null,
			isWritten: false
		}
	},
	{
		seatId: 'seat-cn',
		seatName: 'China',
		countryCode: 'CN',
		delegateName: null,
		delegateAvatarPath: null,
		status: 'missing',
		paper: null
	}
];

const GUIDE: BackgroundGuide = {
	id: 'guide-1',
	title: 'UNSC background guide',
	fileName: 'unsc.pdf',
	fileSizeBytes: 2048,
	audience: 'everyone',
	downloadUrl: null
};

const PDF = new File(['%PDF-1.4'], 'guide.pdf', { type: 'application/pdf' });

/** A post to one of the page's actions, from an address that may carry `?status=`. */
function makeActionEvent(
	actionName: string,
	fields: Record<string, string | File>,
	status: string | null = null
): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	const statusQuery = status === null ? '?' : `?status=${status}&`;

	return {
		params: { slug: CONFERENCE_SLUG, committeeSlug: COMMITTEE_SLUG },
		url: new URL(`http://localhost${PAPERS_PATH}${statusQuery}/${actionName}`),
		locals: { supabase: SUPABASE },
		cookies: COOKIES,
		request: { formData: async () => formData }
	} as unknown as RequestEvent;
}

/** The page `load`'s event. `parent()` answers what the chair layout returned. */
/** A chair who may open every page of the console, which the layout hands down. */
const EVERY_TOOL = { mayReviewPapers: true, mayWriteNotes: true, mayProposeAwards: true };

function makeLoadEvent(search = ''): PageServerLoadEvent {
	return {
		params: { slug: CONFERENCE_SLUG, committeeSlug: COMMITTEE_SLUG },
		url: new URL(`http://localhost${PAPERS_PATH}${search}`),
		locals: { supabase: SUPABASE },
		parent: async () => ({
			conference: CONFERENCE,
			committee: COMMITTEE,
			committeeTools: EVERY_TOOL
		})
	} as unknown as PageServerLoadEvent;
}

/** Run something expected to redirect, and give back the redirect SvelteKit threw. */
async function catchRedirect(run: () => unknown): Promise<{ status: number; location: string }> {
	try {
		await run();
	} catch (thrown) {
		return thrown as { status: number; location: string };
	}

	throw new Error('Nothing was thrown, so nothing redirected.');
}

/** What `fail(...)` gives back: a value the action returns, not throws. */
type FailResult = {
	status: number;
	data: {
		flash: { message: string };
		reviewDocumentId: string | null;
		reviewComment: string | null;
		reviewError: string | null;
		guideTitle: string | null;
		guideAudience: string | null;
		guideError: string | null;
	};
};

beforeEach(() => {
	vi.clearAllMocks();

	vi.mocked(requireCommitteePermission).mockResolvedValue({
		user: { id: 'user-1', email: 'ada@example.com' },
		conference: CONFERENCE,
		committee: COMMITTEE
	});
	vi.mocked(listPaperSeats).mockResolvedValue(SEATS);
	vi.mocked(getBackgroundGuide).mockResolvedValue(GUIDE);
	vi.mocked(reviewCommitteePaper).mockResolvedValue(true);
	vi.mocked(approveSubmittedPapers).mockResolvedValue(2);
	vi.mocked(removeBackgroundGuide).mockResolvedValue(true);
});

/**
 * Run `load`. SvelteKit types it as possibly returning nothing, so this checks
 * that it did return, which lets the tests read the fields.
 */
async function loadPage(search = '') {
	const result = await load(makeLoadEvent(search));

	if (!result) throw new Error('load returned nothing');

	return result;
}

describe('load', () => {
	it('lists every seated delegate with the counts and the guide', async () => {
		const result = await loadPage();

		expect(listPaperSeats).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, COMMITTEE.id);
		expect(result).toMatchObject({
			statusFilter: null,
			counts: { submitted: 1, approved: 1, missing: 1, changes_requested: 0 },
			seatedCount: 3,
			guide: GUIDE,
			guideTitle: 'UNSC background guide'
		});
		expect(result.paperSeats).toHaveLength(3);
	});

	it('narrows the list to ?status= and keeps counting every seat', async () => {
		const result = await loadPage('?status=missing');

		expect(result.statusFilter).toBe('missing');
		expect(result.paperSeats.map((seat: PaperSeatRow) => seat.seatId)).toEqual(['seat-cn']);
		expect(result.counts.submitted).toBe(1);
	});

	it('shows every seat for a status it does not know', async () => {
		const result = await loadPage('?status=lost');

		expect(result.statusFilter).toBeNull();
		expect(result.paperSeats).toHaveLength(3);
	});
});

describe('the chair gate', () => {
	it('lets the 404 of requireCommitteePermission propagate and reviews nothing', async () => {
		vi.mocked(requireCommitteePermission).mockImplementation(() => {
			error(404, 'This committee does not exist.');
		});

		const event = makeActionEvent('approve', { documentId: 'paper-fr' });

		await expect(actions.approve(event)).rejects.toMatchObject({ status: 404 });
		expect(reviewCommitteePaper).not.toHaveBeenCalled();
	});
});

describe('approve', () => {
	it('approves inside this committee, with the comment, and keeps the filter', async () => {
		const event = makeActionEvent(
			'approve',
			{ documentId: 'paper-fr', comment: ' Well argued. ' },
			'submitted'
		);
		const redirected = await catchRedirect(() => actions.approve(event));

		expect(reviewCommitteePaper).toHaveBeenCalledWith(
			SUPABASE,
			COMMITTEE.id,
			'paper-fr',
			{ status: 'approved', comment: 'Well argued.' },
			'user-1'
		);
		expect(redirected).toMatchObject({
			status: 303,
			location: chairPapersUrl(CONFERENCE_SLUG, COMMITTEE_SLUG, 'submitted')
		});
	});

	it('clears the stored comment when the box was left empty (T170)', async () => {
		const event = makeActionEvent('approve', { documentId: 'paper-fr', comment: '' });
		await catchRedirect(() => actions.approve(event));

		expect(vi.mocked(reviewCommitteePaper).mock.calls[0][3]).toEqual({
			status: 'approved',
			comment: null
		});
	});

	it('refuses a paper of another committee', async () => {
		vi.mocked(reviewCommitteePaper).mockResolvedValue(false);

		const event = makeActionEvent('approve', { documentId: 'paper-elsewhere' });
		const result = (await actions.approve(event)) as FailResult;

		expect(result.data.flash.message).toBe(PAPER_REFUSALS.otherCommittee);
	});

	it('refuses a comment over 1000 characters', async () => {
		const comment = 'x'.repeat(1001);
		const event = makeActionEvent('approve', { documentId: 'paper-fr', comment });
		const result = (await actions.approve(event)) as FailResult;

		expect(result.data).toMatchObject({
			reviewDocumentId: 'paper-fr',
			reviewError: PAPER_REFUSALS.longComment
		});
		expect(reviewCommitteePaper).not.toHaveBeenCalled();
	});
});

describe('requestChanges', () => {
	it('sends the paper back with the comment', async () => {
		const event = makeActionEvent('requestChanges', {
			documentId: 'paper-fr',
			comment: 'Cite your sources.'
		});
		await catchRedirect(() => actions.requestChanges(event));

		expect(reviewCommitteePaper).toHaveBeenCalledWith(
			SUPABASE,
			COMMITTEE.id,
			'paper-fr',
			{ status: 'changes_requested', comment: 'Cite your sources.' },
			'user-1'
		);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Changes requested. The delegate has been notified.'
		});
	});

	it('refuses without a comment, with the quoted message under that paper', async () => {
		const event = makeActionEvent('requestChanges', { documentId: 'paper-fr', comment: '  ' });
		const result = (await actions.requestChanges(event)) as FailResult;

		expect(result.status).toBe(400);
		expect(result.data).toMatchObject({
			reviewDocumentId: 'paper-fr',
			reviewError: 'Tell the delegate what to change.'
		});
		expect(reviewCommitteePaper).not.toHaveBeenCalled();
	});
});

describe('approveAll', () => {
	it('approves the papers awaiting review of this committee', async () => {
		const event = makeActionEvent('approveAll', { confirm: '1' });
		await catchRedirect(() => actions.approveAll(event));

		expect(approveSubmittedPapers).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id, 'user-1');
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: '2 papers approved.'
		});
	});

	it('refuses without the confirmation', async () => {
		const result = (await actions.approveAll(makeActionEvent('approveAll', {}))) as FailResult;

		expect(result.data.flash.message).toBe(PAPER_REFUSALS.confirmApproveAll);
		expect(approveSubmittedPapers).not.toHaveBeenCalled();
	});

	it('says so when nothing was awaiting review', async () => {
		vi.mocked(approveSubmittedPapers).mockResolvedValue(0);

		const event = makeActionEvent('approveAll', { confirm: '1' });
		const result = (await actions.approveAll(event)) as FailResult;

		expect(result.data.flash.message).toBe(PAPER_REFUSALS.nothingToApprove);
	});
});

describe('uploadBackgroundGuide', () => {
	it('uploads the PDF for this committee with the title and audience', async () => {
		const event = makeActionEvent('uploadBackgroundGuide', {
			file: PDF,
			title: 'Guide',
			audience: 'everyone'
		});
		await catchRedirect(() => actions.uploadBackgroundGuide(event));

		expect(uploadBackgroundGuide).toHaveBeenCalledWith(SUPABASE, {
			conferenceId: CONFERENCE.id,
			committeeId: COMMITTEE.id,
			uploadedBy: 'user-1',
			title: 'Guide',
			file: expect.any(File),
			audience: 'everyone'
		});
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Background guide uploaded.'
		});
	});

	it('names the guide after the committee when the title is empty', async () => {
		const event = makeActionEvent('uploadBackgroundGuide', {
			file: PDF,
			title: '',
			audience: 'delegates'
		});
		await catchRedirect(() => actions.uploadBackgroundGuide(event));

		expect(vi.mocked(uploadBackgroundGuide).mock.calls[0][1].title).toBe('UNSC background guide');
	});

	it('refuses a file that is not a PDF and keeps the title and audience', async () => {
		const notPdf = new File(['hi'], 'guide.docx', { type: 'application/msword' });
		const event = makeActionEvent('uploadBackgroundGuide', {
			file: notPdf,
			title: 'Guide',
			audience: 'everyone'
		});
		const result = (await actions.uploadBackgroundGuide(event)) as FailResult;

		expect(result.data).toMatchObject({
			guideError: 'Upload a PDF of at most 20 MB.',
			guideTitle: 'Guide',
			guideAudience: 'everyone'
		});
		expect(uploadBackgroundGuide).not.toHaveBeenCalled();
	});

	it('refuses an audience that is not one of the two', async () => {
		const event = makeActionEvent('uploadBackgroundGuide', { file: PDF, audience: 'staff' });
		const result = (await actions.uploadBackgroundGuide(event)) as FailResult;

		expect(result.data.guideError).toBe(PAPER_REFUSALS.guideAudience);
	});

	it('answers 500 and keeps what was typed when the upload fails', async () => {
		vi.mocked(uploadBackgroundGuide).mockRejectedValue(new Error('bucket full'));

		const event = makeActionEvent('uploadBackgroundGuide', {
			file: PDF,
			title: 'Guide',
			audience: 'everyone'
		});
		const result = (await actions.uploadBackgroundGuide(event)) as FailResult;

		expect(result.status).toBe(500);
		expect(result.data).toMatchObject({
			guideError: PAPER_REFUSALS.uploadFailed,
			guideTitle: 'Guide'
		});
	});
});

describe('removeBackgroundGuide', () => {
	it('removes the guide the form showed', async () => {
		const event = makeActionEvent('removeBackgroundGuide', { documentId: 'guide-1', confirm: '1' });
		await catchRedirect(() => actions.removeBackgroundGuide(event));

		expect(removeBackgroundGuide).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id);
	});

	it('refuses without the confirmation', async () => {
		const event = makeActionEvent('removeBackgroundGuide', { documentId: 'guide-1' });
		const result = (await actions.removeBackgroundGuide(event)) as FailResult;

		expect(result.data.flash.message).toBe(PAPER_REFUSALS.confirmRemove);
		expect(removeBackgroundGuide).not.toHaveBeenCalled();
	});

	it('leaves a newer guide alone when the form named an older one', async () => {
		const event = makeActionEvent('removeBackgroundGuide', { documentId: 'guide-0', confirm: '1' });
		const result = (await actions.removeBackgroundGuide(event)) as FailResult;

		expect(result.data.flash.message).toBe(PAPER_REFUSALS.noGuide);
		expect(removeBackgroundGuide).not.toHaveBeenCalled();
	});
});

describe('the page’s own permission', () => {
	it('asks the console’s tools before reading anything', async () => {
		// Its type lets `load` answer without a promise, so `Promise.resolve` gives
		// `.catch` one. What the rest of `load` does past the mocks is not the point here.
		await Promise.resolve(load(makeLoadEvent())).catch(() => undefined);

		expect(requireCommitteeTool).toHaveBeenCalledWith(EVERY_TOOL, 'mayReviewPapers');
	});
});

import { error } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the actions are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
import type { ChairCommittee } from '$lib/chair-room';
import { PAPER_REFUSALS } from '$lib/chair-papers';
import type { Conference } from '$lib/conferences';
import type { PaperSeatRow } from '$lib/documents-page';
import { chairPaperReadingUrl } from '$lib/urls';

// The gate and the paper queries are stood in for, so these tests are about
// what the page decides: which seat it shows, when it answers 404, what a
// review writes and where it goes back to. The queries have their own tests
// in `src/lib/server/paper-reviews.test.ts`, and the page runs against a real
// database in `tests/e2e/chair-papers.spec.ts`.
vi.mock('$lib/server/access', () => ({
	requireCommitteePermission: vi.fn(),
	requireCommitteeTool: vi.fn()
}));

vi.mock('$lib/server/paper-reviews', () => ({
	listPaperSeats: vi.fn(),
	readWrittenPaperBody: vi.fn(),
	reviewCommitteePaper: vi.fn()
}));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

import { requireCommitteePermission, requireCommitteeTool } from '$lib/server/access';
import { setFlash } from '$lib/server/flash';
import {
	listPaperSeats,
	readWrittenPaperBody,
	reviewCommitteePaper
} from '$lib/server/paper-reviews';

/** The Supabase client. The page only hands it on to the server modules above. */
const SUPABASE = {};

/** The cookie jar. Only `setFlash`, which is stood in for, ever touches it. */
const COOKIES = {};

const CONFERENCE_SLUG = 'thimun-2027';
const COMMITTEE_SLUG = 'unsc';

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
const CONFERENCE = { id: 'conference-1', slug: CONFERENCE_SLUG, name: 'THIMUN 2027' } as Conference;

/** A seat with a paper; `isWritten` says whether it was written on MUNMeet or uploaded. */
function makeSeat(seatId: string, seatName: string, isWritten: boolean): PaperSeatRow {
	return {
		seatId,
		seatName,
		countryCode: 'FR',
		delegateName: 'Amira',
		delegateAvatarPath: null,
		status: 'submitted',
		paper: {
			id: `paper-${seatId}`,
			fileName: isWritten ? null : `${seatId}.pdf`,
			reviewStatus: 'submitted',
			reviewComment: null,
			reviewedAt: null,
			updatedAt: '2026-01-01T09:00:00Z',
			downloadUrl: isWritten ? null : 'https://storage.example/paper.pdf',
			isWritten
		}
	};
}

/** Two written papers with an uploaded one between them, and a seat with nothing. */
const SEATS: PaperSeatRow[] = [
	makeSeat('seat-fr', 'France', true),
	makeSeat('seat-gh', 'Ghana', false),
	makeSeat('seat-jp', 'Japan', true),
	{ ...makeSeat('seat-cn', 'China', false), status: 'missing', paper: null }
];

/** The page `load`'s event for one seat. `parent()` answers what the chair layout returned. */
/** A chair who may open every page of the console, which the layout hands down. */
const EVERY_TOOL = { mayReviewPapers: true, mayWriteNotes: true, mayProposeAwards: true };

function makeLoadEvent(seatId: string): PageServerLoadEvent {
	return {
		params: { slug: CONFERENCE_SLUG, committeeSlug: COMMITTEE_SLUG, seatId },
		locals: { supabase: SUPABASE },
		parent: async () => ({
			conference: CONFERENCE,
			committee: COMMITTEE,
			committeeTools: EVERY_TOOL
		})
	} as unknown as PageServerLoadEvent;
}

/** A post to one of the page's actions, from the reading page of France's paper. */
function makeActionEvent(actionName: string, fields: Record<string, string>): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	const path = chairPaperReadingUrl(CONFERENCE_SLUG, COMMITTEE_SLUG, 'seat-fr');

	return {
		params: { slug: CONFERENCE_SLUG, committeeSlug: COMMITTEE_SLUG, seatId: 'seat-fr' },
		url: new URL(`http://localhost${path}?/${actionName}`),
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
type FailResult = {
	status: number;
	data: { flash: { message: string }; reviewComment: string; reviewError: string | null };
};

beforeEach(() => {
	vi.clearAllMocks();

	vi.mocked(requireCommitteePermission).mockResolvedValue({
		user: { id: 'user-1', email: 'ada@example.com' },
		conference: CONFERENCE,
		committee: COMMITTEE
	});
	vi.mocked(listPaperSeats).mockResolvedValue(SEATS);
	vi.mocked(readWrittenPaperBody).mockResolvedValue('France **supports** the treaty.');
	vi.mocked(reviewCommitteePaper).mockResolvedValue(true);
});

/**
 * Run `load`. SvelteKit types it as possibly returning nothing, so this checks
 * that it did return, which lets the tests read the fields.
 */
async function loadPage(seatId: string) {
	const result = await load(makeLoadEvent(seatId));

	if (!result) throw new Error('load returned nothing');

	return result;
}

describe('load', () => {
	it("shows the seat's written paper as HTML, with its word count and heading", async () => {
		const result = await loadPage('seat-fr');

		expect(listPaperSeats).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, COMMITTEE.id);
		expect(readWrittenPaperBody).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id, 'paper-seat-fr');
		expect(result.paperSeat.seatName).toBe('France');
		expect(result.bodyHtml).toContain('<strong>supports</strong>');
		expect(result.wordCount).toBe(4);
		expect(result.sheetHeading).toEqual({
			seatName: 'France',
			conferenceName: 'THIMUN 2027',
			lines: [
				{ label: 'Country', value: 'France' },
				{ label: 'Committee', value: 'Security Council' },
				{ label: 'Topic', value: 'Climate finance' }
			]
		});
	});

	it('leads "Previous" and "Next" only to other written papers', async () => {
		const first = await loadPage('seat-fr');
		const last = await loadPage('seat-jp');

		expect(first).toMatchObject({ previousSeatId: null, nextSeatId: 'seat-jp' });
		expect(last).toMatchObject({ previousSeatId: 'seat-fr', nextSeatId: null });
	});

	it('answers 404 for an uploaded paper, a seat with no paper and another committee', async () => {
		for (const seatId of ['seat-gh', 'seat-cn', 'seat-of-another-committee']) {
			const thrown = await catchThrown(() => load(makeLoadEvent(seatId)));

			expect(thrown.status).toBe(404);
		}

		expect(readWrittenPaperBody).not.toHaveBeenCalled();
	});

	it('answers 404 when the text cannot be read after all', async () => {
		vi.mocked(readWrittenPaperBody).mockResolvedValue(null);

		const thrown = await catchThrown(() => load(makeLoadEvent('seat-fr')));

		expect(thrown.status).toBe(404);
	});
});

describe('approve', () => {
	it('approves inside this committee and comes back to the same paper', async () => {
		const event = makeActionEvent('approve', { documentId: 'paper-seat-fr', comment: ' Good. ' });
		const redirected = await catchThrown(() => actions.approve(event));

		expect(reviewCommitteePaper).toHaveBeenCalledWith(
			SUPABASE,
			COMMITTEE.id,
			'paper-seat-fr',
			{ status: 'approved', comment: 'Good.' },
			'user-1'
		);
		expect(redirected).toMatchObject({
			status: 303,
			location: chairPaperReadingUrl(CONFERENCE_SLUG, COMMITTEE_SLUG, 'seat-fr')
		});
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Approved. The delegate has been notified.'
		});
	});

	it('clears the stored comment when the box was left empty (T170)', async () => {
		const event = makeActionEvent('approve', { documentId: 'paper-seat-fr', comment: '' });
		await catchThrown(() => actions.approve(event));

		expect(vi.mocked(reviewCommitteePaper).mock.calls[0][3]).toEqual({
			status: 'approved',
			comment: null
		});
	});

	it('refuses a paper of another committee', async () => {
		vi.mocked(reviewCommitteePaper).mockResolvedValue(false);

		const event = makeActionEvent('approve', { documentId: 'paper-elsewhere' });
		const result = (await actions.approve(event)) as FailResult;

		expect(result.status).toBe(400);
		expect(result.data.flash.message).toBe(PAPER_REFUSALS.otherCommittee);
	});

	it('lets the 404 of requireCommitteePermission propagate and reviews nothing', async () => {
		vi.mocked(requireCommitteePermission).mockImplementation(() => {
			error(404, 'This committee does not exist.');
		});

		const event = makeActionEvent('approve', { documentId: 'paper-seat-fr' });

		await expect(actions.approve(event)).rejects.toMatchObject({ status: 404 });
		expect(reviewCommitteePaper).not.toHaveBeenCalled();
	});
});

describe('requestChanges', () => {
	it('sends the paper back with the comment and comes back to it', async () => {
		const event = makeActionEvent('requestChanges', {
			documentId: 'paper-seat-fr',
			comment: 'Cite your sources.'
		});
		const redirected = await catchThrown(() => actions.requestChanges(event));

		expect(reviewCommitteePaper).toHaveBeenCalledWith(
			SUPABASE,
			COMMITTEE.id,
			'paper-seat-fr',
			{ status: 'changes_requested', comment: 'Cite your sources.' },
			'user-1'
		);
		expect(redirected.location).toBe(
			chairPaperReadingUrl(CONFERENCE_SLUG, COMMITTEE_SLUG, 'seat-fr')
		);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Changes requested. The delegate has been notified.'
		});
	});

	it('refuses without a comment and keeps what was typed', async () => {
		const event = makeActionEvent('requestChanges', { documentId: 'paper-seat-fr', comment: ' ' });
		const result = (await actions.requestChanges(event)) as FailResult;

		expect(result.status).toBe(400);
		expect(result.data).toMatchObject({
			reviewComment: '',
			reviewError: 'Tell the delegate what to change.'
		});
		expect(reviewCommitteePaper).not.toHaveBeenCalled();
	});
});

describe('the page’s own permission', () => {
	it('asks the console’s tools before reading anything', async () => {
		// Its type lets `load` answer without a promise, so `Promise.resolve` gives
		// `.catch` one. What the rest of `load` does past the mocks is not the point here.
		await Promise.resolve(load(makeLoadEvent('seat-1'))).catch(() => undefined);

		expect(requireCommitteeTool).toHaveBeenCalledWith(EVERY_TOOL, 'mayReviewPapers');
	});
});

import { error, fail, redirect } from '@sveltejs/kit';
import { PAPER_REFUSALS, approvalCommentProblem } from '$lib/chair-papers';
import { reviewCommentProblem } from '$lib/documents-page';
import type { Flash } from '$lib/flash';
import { findWrittenPaper } from '$lib/paper-reading';
import { paperHeading } from '$lib/paper-sheet';
import { countWords } from '$lib/paper-writing';
import { chairPaperReadingUrl } from '$lib/urls';
import { requireCommitteePermission, requireCommitteeTool } from '$lib/server/access';
import { setFlash } from '$lib/server/flash';
import { renderMarkdown } from '$lib/server/markdown';
import {
	listPaperSeats,
	readWrittenPaperBody,
	reviewCommitteePaper,
	type PaperReview
} from '$lib/server/paper-reviews';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/**
 * Runs on the server, after the chair layout's `load` has checked that the
 * reader chairs this committee or organises its conference. `parent()` hands
 * over what the layout returned.
 *
 * It reads the committee's seats the way the papers page does, finds the seat
 * in the address among those with a paper written on MUNMeet, and reads that
 * one paper's text. A seat of another committee, a seat with no paper and a
 * seat whose paper is a PDF all answer 404: only a written paper has a
 * reading page. `load` runs again after every form sent here.
 */
export const load: PageServerLoad = async ({ parent, locals, params }) => {
	const { conference, committee, committeeTools } = await parent();
	// The console opened for `run_room`; this page asks its own permission too.
	requireCommitteeTool(committeeTools, 'mayReviewPapers');
	const seats = await listPaperSeats(locals.supabase, conference.id, committee.id);
	const place = findWrittenPaper(seats, params.seatId);

	if (place === null || place.seat.paper === null) error(404, 'Not found');

	const markdown = await readWrittenPaperBody(locals.supabase, committee.id, place.seat.paper.id);

	if (markdown === null) error(404, 'Not found');

	return {
		paperSeat: place.seat,
		previousSeatId: place.previousSeatId,
		nextSeatId: place.nextSeatId,
		// Drawn on the server, so the browser never turns Markdown into HTML itself.
		bodyHtml: renderMarkdown(markdown),
		wordCount: countWords(markdown),
		// The lines the paper opens with, the same as the delegate saw while writing (Trello S6HLyL5Y).
		sheetHeading: paperHeading({
			seatName: place.seat.seatName,
			countryCode: place.seat.countryCode,
			committeeName: committee.name,
			conferenceName: conference.name,
			topics: committee.topics
		})
	};
};

/** What a refused review sends back, so the comment box keeps what was typed. */
type ReadingPageResult = {
	flash: Flash;
	reviewComment: string;
	reviewError: string | null;
};

/** Refuse, staying on the page. The root layout shows `flash` as a toast. */
function refuse(message: string, reviewComment: string, reviewError: string | null = null) {
	return fail(400, {
		reviewComment,
		reviewError,
		flash: { tone: 'error', message }
	} satisfies ReadingPageResult);
}

/**
 * Back to this same paper with a message, so the chair can go on to "Next
 * paper" from here. A redirect cannot carry the message, so it travels in a
 * one-shot cookie the root layout reads.
 */
function backToPaper(event: RequestEvent, message: string): never {
	setFlash(event.cookies, { tone: 'success', message });
	redirect(
		303,
		chairPaperReadingUrl(event.params.slug, event.params.committeeSlug, event.params.seatId)
	);
}

/**
 * Save one review from the form, the same way the papers page's `approve` and
 * `requestChanges` do. The chair gate is asked again, since an action is its
 * own request and nothing `load` worked out reaches it.
 */
async function saveReview(event: RequestEvent, status: PaperReview['status']) {
	const { user, committee } = await requireCommitteePermission(
		event.locals,
		event.url,
		event.params.slug,
		event.params.committeeSlug,
		'review_papers'
	);
	const formData = await event.request.formData();
	const documentId = String(formData.get('documentId') ?? '').trim();
	const comment = String(formData.get('comment') ?? '').trim();
	const isApproval = status === 'approved';
	// A comment is optional when approving and required when sending a paper back.
	const problem = isApproval ? approvalCommentProblem(comment) : reviewCommentProblem(comment);

	if (problem !== null) return refuse(problem, comment, problem);

	// The `notify_document_reviewed` trigger tells the delegate.
	const review: PaperReview = { status, comment: comment === '' ? null : comment };
	const isSaved = await reviewCommitteePaper(
		event.locals.supabase,
		committee.id,
		documentId,
		review,
		user.id
	);

	if (!isSaved) return refuse(PAPER_REFUSALS.otherCommittee, comment);

	const message = isApproval
		? 'Approved. The delegate has been notified.'
		: 'Changes requested. The delegate has been notified.';

	backToPaper(event, message);
}

export const actions: Actions = {
	/** Approve the paper, with an optional comment for the delegate. */
	approve: async (event) => saveReview(event, 'approved'),

	/** Send the paper back with a comment. This reopens the delegate's paper page. */
	requestChanges: async (event) => saveReview(event, 'changes_requested')
};

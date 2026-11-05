/**
 * What the papers page's "Approve", "Request changes" and "Approve all
 * awaiting review" buttons are expected to change, worked out in the browser
 * at the moment of the press (T141). Mirrors `$lib/server/paper-reviews.ts`'s
 * `reviewCommitteePaper` and `approveSubmittedPapers`, so the screen shows
 * what the database will hold.
 *
 * File uploads (`BackgroundGuideCard.svelte`) are not part of this: what a
 * chosen file will be accepted as cannot be told without the server, so that
 * form keeps the older kind that waits for an answer before changing the
 * screen.
 */
import { approvalCommentProblem } from '$lib/chair-papers';
import {
	expectationsOf,
	type ChairExpectation,
	type ChairPress,
	type RowChange
} from '$lib/chair-form';
import { paperStatus, type ReviewStatus } from '$lib/documents';
import { reviewCommentProblem, type PaperSeatRow } from '$lib/documents-page';

/**
 * A paper's review fields a press changes. `id` is the paper's own id
 * (`documents.id`, the same id `PaperSeatRow.paper.id` holds), not the seat's,
 * because a seat with no paper has nothing a press could change.
 */
export type ReviewedPaper = {
	id: string;
	reviewStatus: ReviewStatus;
	reviewComment: string | null;
	reviewedAt: string;
};

/** One press's expectation: a single paper's review, by the paper's own id. */
function reviewExpectation(
	documentId: string,
	changes: Omit<ReviewedPaper, 'id'>
): ChairExpectation {
	return { papers: [{ id: documentId, changes }] };
}

/**
 * "Approve": the paper's review, with the comment typed (a blank box counts
 * as none). Null when the comment is too long, which the server would refuse.
 */
export function approvePaperPress(
	comment: string,
	documentId: string,
	reviewedAt: Date
): ChairExpectation | null {
	if (approvalCommentProblem(comment) !== null) return null;

	return reviewExpectation(documentId, {
		reviewStatus: 'approved',
		reviewComment: comment === '' ? null : comment,
		reviewedAt: reviewedAt.toISOString()
	});
}

/**
 * "Request changes": the paper's review, with the comment typed. Null when
 * the comment is missing or too long, which the server would refuse.
 */
export function requestPaperChangesPress(
	comment: string,
	documentId: string,
	reviewedAt: Date
): ChairExpectation | null {
	if (reviewCommentProblem(comment) !== null) return null;

	return reviewExpectation(documentId, {
		reviewStatus: 'changes_requested',
		reviewComment: comment,
		reviewedAt: reviewedAt.toISOString()
	});
}

/**
 * "Approve all awaiting review": every paper the screen currently shows that
 * is awaiting review, approved with no comment.
 *
 * A chair viewing a status filter that hides submitted papers has none of
 * them in `shownSeats`, so this presses nothing visible; the server still
 * approves every one of the committee, and the filtered list catches up once
 * it has answered. That is the one gap this leaves: it cannot invent ids for
 * papers the screen was never given.
 */
export function approveAllPapersPress(
	shownSeats: PaperSeatRow[],
	reviewedAt: Date
): ChairExpectation {
	const changes: RowChange<ReviewedPaper>[] = shownSeats
		.filter((seat) => seat.paper !== null && seat.paper.reviewStatus === 'submitted')
		.map((seat) => ({
			// The filter above keeps only seats with a paper, so this is never null.
			id: (seat.paper as NonNullable<PaperSeatRow['paper']>).id,
			changes: {
				reviewStatus: 'approved',
				reviewComment: null,
				reviewedAt: reviewedAt.toISOString()
			}
		}));

	return { papers: changes };
}

/**
 * `paperSeats` with every press's paper changes laid on top, matching each
 * change to the seat whose paper has that id.
 *
 * `rowsAfterChanges` in `$lib/chair-form.ts` cannot be used here: a
 * `PaperSeatRow` has no `id` of its own, and a change touches fields nested
 * inside its `paper`, not the seat itself, so this lays the changes on by hand
 * instead.
 */
export function paperSeatsAfterPresses(
	paperSeats: PaperSeatRow[],
	presses: ChairPress[]
): PaperSeatRow[] {
	const changes: RowChange<ReviewedPaper>[] = [];

	for (const expectation of expectationsOf(presses)) {
		changes.push(...(expectation.papers ?? []));
	}

	return paperSeats.map((seat) => {
		let paper = seat.paper;

		for (const change of changes) {
			if (paper === null || change.id !== paper.id || !change.changes) continue;

			paper = { ...paper, ...change.changes };
		}

		// A seat with no paper is never touched by the loop above, so `paper` is
		// still null here exactly when `seat.paper` was; TypeScript cannot see
		// that on its own, since `paper` is reassigned inside the loop.
		if (paper === null) return seat;
		if (paper === seat.paper) return seat;

		return { ...seat, paper, status: paperStatus(paper.reviewStatus) };
	});
}

/**
 * The chair's position papers page: which seats sent a paper, the review of
 * each one, and the committee's background guide.
 *
 * The rules and words live here, where they can be read and tested without
 * Svelte or a database. `$lib/server/paper-reviews.ts` and
 * `$lib/server/documents.ts` read and write the rows.
 */

import { formatDayAndMonth, formatDayAndTime } from '$lib/dates';
import { REVIEW_COMMENT_MAX_LENGTH, type PaperStatusCounts } from '$lib/documents-page';
import {
	DOCUMENT_MAX_SIZE_MB,
	PAPER_STATUSES,
	isAllowedFile,
	isPaperStatus,
	paperStatusLabel,
	type PaperDeadline,
	type PaperStatus
} from '$lib/documents';

/** The sentences the page answers a refused form with. */
export const PAPER_REFUSALS = {
	otherCommittee: 'That paper belongs to another committee.',
	longComment: `Please keep the comment under ${REVIEW_COMMENT_MAX_LENGTH} characters.`,
	confirmApproveAll: 'Please confirm before approving every paper.',
	nothingToApprove: 'No papers are awaiting review.',
	guideFile: `Upload a PDF of at most ${DOCUMENT_MAX_SIZE_MB} MB.`,
	guideAudience: 'Please say who the background guide is for.',
	uploadFailed: 'The upload failed. Please try again.',
	confirmRemove: 'Please confirm before removing the background guide.',
	noGuide: 'That background guide has already been replaced or removed.'
};

/**
 * The status `?status=` asks for, or null for every seat. An unknown word
 * shows everything rather than an empty list.
 */
export function readPaperStatusFilter(text: string | null): PaperStatus | null {
	if (text === null || !isPaperStatus(text)) return null;

	return text;
}

/** The choices of the status filter: "All" first, then the four statuses. */
export function paperFilterOptions(): { value: string; label: string }[] {
	const statusOptions = PAPER_STATUSES.map((status) => ({
		value: status,
		label: paperStatusLabel(status)
	}));

	return [{ value: '', label: 'All' }, ...statusOptions];
}

/**
 * The line under the page title: "Deadline 10 Feb 2027, 23:59 (Europe/Amsterdam)",
 * or "No deadline" when the conference set none.
 */
export function paperDeadlineLine(conference: PaperDeadline): string {
	if (conference.positionPaperDeadline === null) return 'No deadline';

	const deadline = formatDayAndTime(conference.positionPaperDeadline, conference.timezone);

	return `Deadline ${deadline} (${conference.timezone})`;
}

/** What `paperDateLine` needs to know about one paper. */
export type PaperDates = {
	reviewStatus: 'submitted' | 'approved' | 'changes_requested';
	reviewedAt: string | null;
	/** When the row last changed. For a paper awaiting review, that is its upload. */
	updatedAt: string;
};

/**
 * When the paper reached its status, in the conference's timezone: "Approved
 * 8 Feb", "Changes requested 6 Feb", "Submitted 3 Feb". A paper uploaded again
 * after the deadline, which a changes request allows, says "Resubmitted".
 */
export function paperDateLine(paper: PaperDates, conference: PaperDeadline): string {
	const timeZone = conference.timezone;

	if (paper.reviewStatus === 'approved' && paper.reviewedAt !== null) {
		return `Approved ${formatDayAndMonth(paper.reviewedAt, timeZone)}`;
	}

	if (paper.reviewStatus === 'changes_requested' && paper.reviewedAt !== null) {
		return `Changes requested ${formatDayAndMonth(paper.reviewedAt, timeZone)}`;
	}

	const uploadedOn = formatDayAndMonth(paper.updatedAt, timeZone);
	const deadline = conference.positionPaperDeadline;
	const isAfterDeadline =
		deadline !== null && new Date(paper.updatedAt).getTime() > new Date(deadline).getTime();

	if (isAfterDeadline) return `Resubmitted ${uploadedOn}`;

	return `Submitted ${uploadedOn}`;
}

/** What `lastCommentLine` needs to know about one paper. */
export type PaperLastComment = {
	reviewComment: string | null;
	reviewedAt: string | null;
};

/**
 * The line above the review box, "Your last comment, 3 Oct: Cite your
 * sources.", or null when the paper has no comment. The box itself always
 * starts empty (T170), so an old comment is never sent again by accident; the
 * line lets the chair build on it. The day is read in the conference's
 * timezone, like every other date on the page.
 */
export function lastCommentLine(paper: PaperLastComment, timezone: string): string | null {
	if (paper.reviewComment === null) return null;

	if (paper.reviewedAt === null) return `Your last comment: ${paper.reviewComment}`;

	const reviewedOn = formatDayAndMonth(paper.reviewedAt, timezone);

	return `Your last comment, ${reviewedOn}: ${paper.reviewComment}`;
}

/** The question "Approve all awaiting review" asks: "Approve 3 papers awaiting review?" */
export function approveAllQuestion(awaitingCount: number): string {
	if (awaitingCount === 1) return 'Approve 1 paper awaiting review?';

	return `Approve ${awaitingCount} papers awaiting review?`;
}

/** Whether every seated delegate's paper is approved, which turns the stats green. */
export function isEveryPaperApproved(counts: PaperStatusCounts): boolean {
	const unapproved = counts.missing + counts.submitted + counts.changes_requested;

	return counts.approved > 0 && unapproved === 0;
}

/**
 * What is wrong with the comment of an approval, or null. The comment is
 * optional there, unlike on a changes request, where `reviewCommentProblem`
 * in `$lib/documents-page.ts` asks for one.
 */
export function approvalCommentProblem(comment: string): string | null {
	if (comment.length > REVIEW_COMMENT_MAX_LENGTH) return PAPER_REFUSALS.longComment;

	return null;
}

/** The title a new background guide gets when the form leaves it empty: "UNSC background guide". */
export function defaultGuideTitle(committee: {
	name: string;
	abbreviation: string | null;
}): string {
	return `${committee.abbreviation ?? committee.name} background guide`;
}

/**
 * What is wrong with the file chosen for the background guide, or null. An
 * empty file box keeps the shared "Choose a file to upload."; every other
 * problem is the one sentence the chair page uses for the type and the size.
 */
export function guideFileProblem(file: { type: string; size: number }): string | null {
	const problem = isAllowedFile(file, 'background_guide');

	if (problem === null || file.size === 0) return problem;

	return PAPER_REFUSALS.guideFile;
}

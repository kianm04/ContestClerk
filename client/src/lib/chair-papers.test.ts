import { describe, expect, it } from 'vitest';
import {
	PAPER_REFUSALS,
	approvalCommentProblem,
	approveAllQuestion,
	defaultGuideTitle,
	guideFileProblem,
	isEveryPaperApproved,
	lastCommentLine,
	paperDateLine,
	paperDeadlineLine,
	paperFilterOptions,
	readPaperStatusFilter
} from './chair-papers';

/** A deadline of 10 Feb 2027 at 23:59 in Amsterdam, 22:59 in UTC. */
const CONFERENCE = {
	positionPaperDeadline: '2027-02-10T22:59:00Z',
	timezone: 'Europe/Amsterdam'
};

describe('readPaperStatusFilter', () => {
	it('reads one of the four statuses', () => {
		expect(readPaperStatusFilter('changes_requested')).toBe('changes_requested');
		expect(readPaperStatusFilter('missing')).toBe('missing');
	});

	it('is null for nothing, an empty choice or an unknown word', () => {
		expect(readPaperStatusFilter(null)).toBeNull();
		expect(readPaperStatusFilter('')).toBeNull();
		expect(readPaperStatusFilter('lost')).toBeNull();
	});
});

describe('paperFilterOptions', () => {
	it('offers "All" and then the four statuses in words', () => {
		expect(paperFilterOptions().map((option) => option.label)).toEqual([
			'All',
			'Missing',
			'Awaiting review',
			'Approved',
			'Changes requested'
		]);
	});
});

describe('paperDeadlineLine', () => {
	it('gives the deadline in the conference timezone', () => {
		expect(paperDeadlineLine(CONFERENCE)).toBe('Deadline 10 Feb 2027, 23:59 (Europe/Amsterdam)');
	});

	it('says when there is none', () => {
		expect(paperDeadlineLine({ ...CONFERENCE, positionPaperDeadline: null })).toBe('No deadline');
	});
});

describe('paperDateLine', () => {
	it('dates an approval and a changes request by the review', () => {
		const reviewedAt = '2027-02-08T10:00:00Z';
		const updatedAt = '2027-02-01T10:00:00Z';

		expect(paperDateLine({ reviewStatus: 'approved', reviewedAt, updatedAt }, CONFERENCE)).toBe(
			'Approved 8 Feb'
		);
		expect(
			paperDateLine({ reviewStatus: 'changes_requested', reviewedAt, updatedAt }, CONFERENCE)
		).toBe('Changes requested 8 Feb');
	});

	it('dates a paper awaiting review by its upload', () => {
		const paper = {
			reviewStatus: 'submitted' as const,
			reviewedAt: null,
			updatedAt: '2027-02-03T10:00:00Z'
		};

		expect(paperDateLine(paper, CONFERENCE)).toBe('Submitted 3 Feb');
	});

	it('calls a paper uploaded after the deadline resubmitted', () => {
		const paper = {
			reviewStatus: 'submitted' as const,
			reviewedAt: '2027-02-11T09:00:00Z',
			updatedAt: '2027-02-12T09:00:00Z'
		};

		expect(paperDateLine(paper, CONFERENCE)).toBe('Resubmitted 12 Feb');
		expect(paperDateLine(paper, { ...CONFERENCE, positionPaperDeadline: null })).toBe(
			'Submitted 12 Feb'
		);
	});
});

describe('lastCommentLine', () => {
	it('names the day of the last review, in the conference timezone', () => {
		// 23:30 on 2 Oct in UTC is already 3 Oct in Amsterdam.
		const paper = { reviewComment: 'Cite your sources.', reviewedAt: '2026-10-02T23:30:00Z' };

		expect(lastCommentLine(paper, CONFERENCE.timezone)).toBe(
			'Your last comment, 3 Oct: Cite your sources.'
		);
	});

	it('leaves the day out when the paper has no review time', () => {
		const paper = { reviewComment: 'Cite your sources.', reviewedAt: null };

		expect(lastCommentLine(paper, CONFERENCE.timezone)).toBe(
			'Your last comment: Cite your sources.'
		);
	});

	it('is null when there is no comment to show', () => {
		const paper = { reviewComment: null, reviewedAt: '2026-10-02T10:00:00Z' };

		expect(lastCommentLine(paper, CONFERENCE.timezone)).toBeNull();
	});
});

describe('approveAllQuestion', () => {
	it('asks with the number of papers', () => {
		expect(approveAllQuestion(3)).toBe('Approve 3 papers awaiting review?');
		expect(approveAllQuestion(1)).toBe('Approve 1 paper awaiting review?');
	});
});

describe('isEveryPaperApproved', () => {
	it('is true only when every seated delegate has an approved paper', () => {
		const counts = { missing: 0, submitted: 0, approved: 4, changes_requested: 0 };

		expect(isEveryPaperApproved(counts)).toBe(true);
		expect(isEveryPaperApproved({ ...counts, missing: 1 })).toBe(false);
		expect(isEveryPaperApproved({ ...counts, approved: 0 })).toBe(false);
	});
});

describe('approvalCommentProblem', () => {
	it('allows no comment, and refuses one over 1000 characters', () => {
		expect(approvalCommentProblem('')).toBeNull();
		expect(approvalCommentProblem('x'.repeat(1001))).toBe(PAPER_REFUSALS.longComment);
	});
});

describe('defaultGuideTitle', () => {
	it('uses the abbreviation, or the name without one', () => {
		expect(defaultGuideTitle({ name: 'Security Council', abbreviation: 'UNSC' })).toBe(
			'UNSC background guide'
		);
		expect(defaultGuideTitle({ name: 'Crisis', abbreviation: null })).toBe(
			'Crisis background guide'
		);
	});
});

describe('guideFileProblem', () => {
	it('accepts a PDF of at most 20 MB', () => {
		expect(guideFileProblem({ type: 'application/pdf', size: 1000 })).toBeNull();
	});

	it('asks for a file when none was chosen', () => {
		expect(guideFileProblem({ type: '', size: 0 })).toBe('Choose a file to upload.');
	});

	it('answers the one quoted sentence for the wrong type or too large a file', () => {
		const tooLarge = { type: 'application/pdf', size: 21 * 1024 * 1024 };

		expect(guideFileProblem({ type: 'image/png', size: 1000 })).toBe(
			'Upload a PDF of at most 20 MB.'
		);
		expect(guideFileProblem(tooLarge)).toBe('Upload a PDF of at most 20 MB.');
	});
});

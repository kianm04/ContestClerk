import { describe, expect, it } from 'vitest';
import {
	approveAllPapersPress,
	approvePaperPress,
	paperSeatsAfterPresses,
	requestPaperChangesPress,
	type ReviewedPaper
} from './paper-presses';
import type { ChairPress } from './chair-form';
import type { PaperSeatRow } from './documents-page';

// These mirror what `$lib/server/paper-reviews.ts`'s `reviewCommitteePaper`
// and `approveSubmittedPapers` write, so a press worked out here shows the
// same thing the server will save. The comment's own checks
// (`approvalCommentProblem`, `reviewCommentProblem`) are already tested next
// to where they are defined; these tests are about the row a press builds on
// top of them.

const REVIEWED_AT = new Date('2026-01-01T10:00:00Z');

function paperSeat(overrides: Partial<PaperSeatRow> = {}): PaperSeatRow {
	return {
		seatId: 'seat-fr',
		seatName: 'France',
		countryCode: 'FR',
		delegateName: 'Amira Haddad',
		delegateAvatarPath: null,
		status: 'submitted',
		paper: {
			id: 'paper-1',
			fileName: 'position.pdf',
			reviewStatus: 'submitted',
			reviewComment: null,
			reviewedAt: null,
			updatedAt: '2026-01-01T08:00:00Z',
			downloadUrl: 'https://example.test/paper-1',
			isWritten: false
		},
		...overrides
	};
}

describe('approvePaperPress', () => {
	it('approves with the typed comment', () => {
		const expectation = approvePaperPress('Nicely argued.', 'paper-1', REVIEWED_AT);

		expect(expectation).toEqual({
			papers: [
				{
					id: 'paper-1',
					changes: {
						reviewStatus: 'approved',
						reviewComment: 'Nicely argued.',
						reviewedAt: '2026-01-01T10:00:00.000Z'
					}
				}
			]
		});
	});

	it('turns a blank comment into no comment at all', () => {
		const expectation = approvePaperPress('', 'paper-1', REVIEWED_AT);

		expect(expectation?.papers?.[0].changes?.reviewComment).toBeNull();
	});

	it('answers null for a comment the server would refuse: too long', () => {
		const tooLong = 'x'.repeat(1001);

		expect(approvePaperPress(tooLong, 'paper-1', REVIEWED_AT)).toBeNull();
	});
});

describe('requestPaperChangesPress', () => {
	it('sends the paper back with the typed comment', () => {
		const expectation = requestPaperChangesPress('Fix the citations.', 'paper-1', REVIEWED_AT);

		expect(expectation).toEqual({
			papers: [
				{
					id: 'paper-1',
					changes: {
						reviewStatus: 'changes_requested',
						reviewComment: 'Fix the citations.',
						reviewedAt: '2026-01-01T10:00:00.000Z'
					}
				}
			]
		});
	});

	it('answers null for a comment the server would refuse: empty', () => {
		expect(requestPaperChangesPress('', 'paper-1', REVIEWED_AT)).toBeNull();
	});

	it('answers null for a comment the server would refuse: too long', () => {
		const tooLong = 'x'.repeat(1001);

		expect(requestPaperChangesPress(tooLong, 'paper-1', REVIEWED_AT)).toBeNull();
	});
});

describe('approveAllPapersPress', () => {
	it('approves every shown seat awaiting review, and none other', () => {
		const seats = [
			paperSeat(),
			paperSeat({
				seatId: 'seat-de',
				paper: {
					id: 'paper-2',
					fileName: 'position-2.pdf',
					reviewStatus: 'approved',
					reviewComment: null,
					reviewedAt: '2025-12-01T00:00:00Z',
					updatedAt: '2025-12-01T00:00:00Z',
					downloadUrl: null,
					isWritten: false
				}
			}),
			paperSeat({ seatId: 'seat-us', paper: null, status: 'missing' })
		];

		const expectation = approveAllPapersPress(seats, REVIEWED_AT);

		expect(expectation).toEqual({
			papers: [
				{
					id: 'paper-1',
					changes: {
						reviewStatus: 'approved',
						reviewComment: null,
						reviewedAt: '2026-01-01T10:00:00.000Z'
					}
				}
			]
		});
	});

	it('presses nothing when the shown seats have none awaiting review', () => {
		const seats = [paperSeat({ paper: null, status: 'missing' })];

		expect(approveAllPapersPress(seats, REVIEWED_AT)).toEqual({ papers: [] });
	});
});

describe('paperSeatsAfterPresses', () => {
	function pressOf(expected: { papers: { id: string; changes: Partial<ReviewedPaper> }[] }) {
		return {
			id: 1,
			formData: new FormData(),
			action: new URL('http://localhost/?/approve'),
			expected
		} as ChairPress;
	}

	it('lays a change on the seat whose paper has that id', () => {
		const seats = [paperSeat()];
		const presses = [
			pressOf({
				papers: [
					{
						id: 'paper-1',
						changes: {
							reviewStatus: 'approved',
							reviewComment: null,
							reviewedAt: '2026-01-01T10:00:00.000Z'
						}
					}
				]
			})
		];

		const result = paperSeatsAfterPresses(seats, presses);

		expect(result[0].paper?.reviewStatus).toBe('approved');
		expect(result[0].status).toBe('approved');
	});

	it('leaves a seat with no paper, or a different paper id, unchanged', () => {
		const seats = [paperSeat({ paper: null, status: 'missing' }), paperSeat({ seatId: 'seat-de' })];
		const presses = [
			pressOf({
				papers: [
					{
						id: 'paper-does-not-match',
						changes: {
							reviewStatus: 'approved',
							reviewComment: null,
							reviewedAt: '2026-01-01T10:00:00.000Z'
						}
					}
				]
			})
		];

		const result = paperSeatsAfterPresses(seats, presses);

		expect(result).toEqual(seats);
	});
});

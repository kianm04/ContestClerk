import { describe, expect, it } from 'vitest';
import type { PaperSeatRow } from './documents-page';
import { findWrittenPaper } from './paper-reading';

/** A seat with a paper; `isWritten` says whether it was written on MUNMeet or uploaded. */
function seatWithPaper(seatId: string, isWritten: boolean): PaperSeatRow {
	return {
		seatId,
		seatName: seatId,
		countryCode: null,
		delegateName: null,
		delegateAvatarPath: null,
		status: 'submitted',
		paper: {
			id: `paper-${seatId}`,
			fileName: isWritten ? null : `${seatId}.pdf`,
			reviewStatus: 'submitted',
			reviewComment: null,
			reviewedAt: null,
			updatedAt: '2027-01-10T09:00:00Z',
			downloadUrl: null,
			isWritten
		}
	};
}

/** A seat whose delegate has sent nothing. */
function seatWithoutPaper(seatId: string): PaperSeatRow {
	return { ...seatWithPaper(seatId, false), status: 'missing', paper: null };
}

// In seat order: a written paper, an upload, no paper, and two more written papers.
const SEATS = [
	seatWithPaper('brazil', true),
	seatWithPaper('canada', false),
	seatWithoutPaper('chile'),
	seatWithPaper('japan', true),
	seatWithPaper('mexico', true)
];

describe('findWrittenPaper', () => {
	it('finds the seat and the written papers either side, skipping the others', () => {
		const place = findWrittenPaper(SEATS, 'japan');

		expect(place?.seat.seatId).toBe('japan');
		expect(place?.previousSeatId).toBe('brazil');
		expect(place?.nextSeatId).toBe('mexico');
	});

	it('has no previous paper for the first and no next paper for the last', () => {
		expect(findWrittenPaper(SEATS, 'brazil')?.previousSeatId).toBeNull();
		expect(findWrittenPaper(SEATS, 'mexico')?.nextSeatId).toBeNull();
	});

	it('answers null for an uploaded paper, a seat with no paper and an unknown seat', () => {
		expect(findWrittenPaper(SEATS, 'canada')).toBeNull();
		expect(findWrittenPaper(SEATS, 'chile')).toBeNull();
		expect(findWrittenPaper(SEATS, 'elsewhere')).toBeNull();
	});
});

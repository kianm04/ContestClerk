import { describe, expect, it } from 'vitest';
import type { PaperSeatRow } from '$lib/documents-page';
import { rowsAfterPresses, type PressedForm } from '$lib/row-changes';
import {
	describePaperReviewFailure,
	expectPaperReviewChange,
	withSeatId,
	type PaperReviewRow
} from './paper-review-presses';

/** A filled seat with a submitted paper, so each test only changes what it needs to. */
function makeSeat(overrides: Partial<PaperSeatRow> = {}): PaperSeatRow {
	return {
		seatId: 'seat-1',
		seatName: 'France',
		countryCode: 'FR',
		delegateName: 'Amélie Laurent',
		delegateAvatarPath: null,
		status: 'submitted',
		paper: {
			id: 'paper-1',
			fileName: 'france.pdf',
			reviewStatus: 'submitted',
			reviewComment: null,
			reviewedAt: null,
			updatedAt: '2026-02-12T10:00:00Z',
			downloadUrl: null,
			isWritten: false
		},
		...overrides
	};
}

/** A press of `action`, as `use:enhance` hands it over, with `documentId` in the address. */
function pressInput(action: string, formValues: Record<string, string> = {}): PressedForm {
	const address = new URL(`http://localhost/manage/riverside-2027/documents?tab=papers${action}`);

	for (const [key, value] of Object.entries(formValues)) {
		if (key === 'documentId') address.searchParams.set('documentId', value);
	}

	const formData = new FormData();

	for (const [key, value] of Object.entries(formValues)) formData.set(key, value);

	return { action: address, formData };
}

describe('expectPaperReviewChange', () => {
	it('marks the approved seat approved, and clears any review comment', () => {
		const seat = makeSeat({
			paper: { ...makeSeat().paper!, reviewComment: 'Please add sources.' }
		});
		const rows = [withSeatId(seat)];

		const shown = rowsAfterPresses(rows, [
			{
				id: 1,
				formData: pressInput('&/approvePaper', { documentId: 'paper-1' }).formData,
				action: pressInput('&/approvePaper', { documentId: 'paper-1' }).action,
				expected: expectPaperReviewChange(
					pressInput('&/approvePaper', { documentId: 'paper-1' }),
					rows
				)
			}
		]);

		expect(shown[0].status).toBe('approved');
		expect(shown[0].paper?.reviewStatus).toBe('approved');
		expect(shown[0].paper?.reviewComment).toBeNull();
	});

	it('leaves a press naming no paper alone', () => {
		const rows = [withSeatId(makeSeat())];
		const input = pressInput('&/approvePaper', { documentId: 'no-such-paper' });

		expect(expectPaperReviewChange(input, rows)).toBeNull();
	});

	it('marks every ticked paper approved for "Approve selected"', () => {
		const first = makeSeat({ seatId: 'seat-1', paper: { ...makeSeat().paper!, id: 'paper-1' } });
		const second = makeSeat({ seatId: 'seat-2', paper: { ...makeSeat().paper!, id: 'paper-2' } });
		const untouched = makeSeat({
			seatId: 'seat-3',
			paper: { ...makeSeat().paper!, id: 'paper-3' }
		});
		const rows: PaperReviewRow[] = [first, second, untouched].map(withSeatId);

		const formData = new FormData();
		formData.append('ids', 'paper-1');
		formData.append('ids', 'paper-2');
		const input: PressedForm = {
			action: new URL(
				'http://localhost/manage/riverside-2027/documents?tab=papers&/bulkApprovePapers'
			),
			formData
		};

		const changes = expectPaperReviewChange(input, rows);
		const shown = rowsAfterPresses(rows, [
			{ id: 1, formData: input.formData, action: input.action, expected: changes }
		]);

		expect(shown.find((row) => row.id === 'seat-1')?.status).toBe('approved');
		expect(shown.find((row) => row.id === 'seat-2')?.status).toBe('approved');
		expect(shown.find((row) => row.id === 'seat-3')?.status).toBe('submitted');
	});

	it('marks the named seat "changes requested" with the typed comment', () => {
		const rows = [withSeatId(makeSeat())];
		const input = pressInput('&/requestChanges', {
			documentId: 'paper-1',
			reviewComment: 'Please add sources.'
		});

		const shown = rowsAfterPresses(rows, [
			{
				id: 1,
				formData: input.formData,
				action: input.action,
				expected: expectPaperReviewChange(input, rows)
			}
		]);

		expect(shown[0].status).toBe('changes_requested');
		expect(shown[0].paper?.reviewComment).toBe('Please add sources.');
	});

	it('says null for a press this form does not predict', () => {
		const rows = [withSeatId(makeSeat())];
		const input: PressedForm = {
			action: new URL(
				'http://localhost/manage/riverside-2027/documents?tab=papers&/uploadResource'
			),
			formData: new FormData()
		};

		expect(expectPaperReviewChange(input, rows)).toBeNull();
	});
});

describe('describePaperReviewFailure', () => {
	it('names what did not happen for each action', () => {
		expect(describePaperReviewFailure(pressInput('&/approvePaper'))).toBe(
			'The paper was not approved.'
		);
		expect(describePaperReviewFailure(pressInput('&/bulkApprovePapers'))).toBe(
			'The papers were not approved.'
		);
		expect(describePaperReviewFailure(pressInput('&/requestChanges'))).toBe(
			'The changes were not requested.'
		);
	});
});

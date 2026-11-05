/**
 * What approving a paper, or asking for changes to it, does to the papers
 * tab's seat list, worked out in the browser at the moment of the press
 * (T142), so the row shows its new status at once instead of waiting for the
 * server. Mirrors `approvePaper`, `bulkApprovePapers` and `requestChanges` in
 * `+page.server.ts`.
 */
import type { PaperSeatRow } from '$lib/documents-page';
import { pressedAction, pressedField, type PressedForm, type RowChange } from '$lib/row-changes';

/**
 * A seat row with an `id`, which `RowChange` needs to find a row and
 * `PaperSeatRow` does not have: it is named by `seatId` instead. The page
 * builds this once from the seats it loaded (`withSeatId`) and hands the
 * result to both `rowsAfterPresses` and this file.
 */
export type PaperReviewRow = PaperSeatRow & { id: string };

/** Give a loaded seat the `id` its instant form needs, taken from `seatId`. */
export function withSeatId(seat: PaperSeatRow): PaperReviewRow {
	return { ...seat, id: seat.seatId };
}

/** The seat whose paper has this document id, or `null` when none does. */
function findSeatByDocumentId(seats: PaperReviewRow[], documentId: string): PaperReviewRow | null {
	return seats.find((seat) => seat.paper?.id === documentId) ?? null;
}

/** The change that marks one seat's paper approved. */
function approvedChange(seat: PaperReviewRow): RowChange<PaperReviewRow> {
	// `seat.paper` is read again just above, so TypeScript knows it is not null.
	return {
		id: seat.id,
		changes: {
			status: 'approved',
			paper: { ...seat.paper!, reviewStatus: 'approved', reviewComment: null }
		}
	};
}

/**
 * What a press will change, given the seats on screen when it was made:
 * approving one paper or several marks each `approved`, and "Request
 * changes" marks one `changes_requested` with the comment that was typed.
 * Null for a press this form does not predict.
 */
export function expectPaperReviewChange(
	input: PressedForm,
	seats: PaperReviewRow[]
): RowChange<PaperReviewRow>[] | null {
	const action = pressedAction(input.action);

	if (action === '?/approvePaper') {
		const documentId = input.action.searchParams.get('documentId') ?? '';
		const seat = findSeatByDocumentId(seats, documentId);

		return seat && seat.paper ? [approvedChange(seat)] : null;
	}

	if (action === '?/bulkApprovePapers') {
		const documentIds = input.formData.getAll('ids').map((value) => String(value));
		const changed = seats.filter((seat) => seat.paper && documentIds.includes(seat.paper.id));

		return changed.map((seat) => approvedChange(seat));
	}

	if (action === '?/requestChanges') {
		const documentId = pressedField(input.formData, 'documentId');
		const seat = findSeatByDocumentId(seats, documentId);

		if (!seat || !seat.paper) return null;

		const reviewComment = pressedField(input.formData, 'reviewComment');

		return [
			{
				id: seat.id,
				changes: {
					status: 'changes_requested',
					paper: { ...seat.paper, reviewStatus: 'changes_requested', reviewComment }
				}
			}
		];
	}

	return null;
}

/** What did not happen when a paper review press failed, for its toast. */
export function describePaperReviewFailure(press: PressedForm): string {
	const action = pressedAction(press.action);

	if (action === '?/requestChanges') return 'The changes were not requested.';
	if (action === '?/bulkApprovePapers') return 'The papers were not approved.';

	return 'The paper was not approved.';
}

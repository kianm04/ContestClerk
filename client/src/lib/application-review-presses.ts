/**
 * What each of the application review page's five actions changes, worked out
 * in the browser so the page updates the moment a button is pressed rather
 * than waiting for the server (T142).
 *
 * The page keeps one instant form (`createInstantForm` in
 * `$lib/instant-form.svelte.ts`) for its five forms — "Accept", "Waitlist",
 * "Not accepted", "Revoke acceptance" and "Save note" — and draws itself with
 * `applicationReviewAfterPresses(review, form.presses)`.
 *
 * Accepting also writes a new invoice, whose amount and number only the
 * server knows, so the expected change leaves the invoice out until the page
 * reads its data again once the press has settled; the seat and the status
 * still change at once. Revoking behaves the same way: an unpaid invoice is
 * voided on the server, but since the seat disappears the page never shows
 * the invoice either way, so leaving it out changes nothing on screen.
 */
import type { SeatGroup } from '$lib/allocation';
import {
	findFreeSeat,
	readRevokeTo,
	type ApplicationForReview,
	type ReviewSeat
} from '$lib/application-review';
import type { ApplicationStatus, MyApplicationInvoice } from '$lib/applications';
import type { InstantPress, InstantSubmitInput } from '$lib/instant-form.svelte';
import { pressedAction, pressedField } from '$lib/row-changes';

/** What a press of one of the five forms will leave the review looking like. */
export type ApplicationReviewChange = {
	status: ApplicationStatus;
	seat: ReviewSeat | null;
	invoice: MyApplicationInvoice | null;
	/** What the applicant is told, or `null` for an application not yet decided. */
	decisionNote: string | null;
	/** What the organisers wrote to each other. */
	internalNote: string | null;
};

/** One press of a review action, and the change it is expected to make. */
export type ApplicationReviewPress = InstantPress<ApplicationReviewChange>;

/** The five action names this page's forms may post to. */
type ReviewActionName = 'accept' | 'waitlist' | 'reject' | 'revoke' | 'saveInternalNote';

const REVIEW_ACTION_NAMES: ReviewActionName[] = [
	'accept',
	'waitlist',
	'reject',
	'revoke',
	'saveInternalNote'
];

/**
 * The action name a press posted to, or null when it posted to something
 * else. `pressedAction` writes the action as `?/accept` or, with the queue's
 * own filters in front of it, `?status=submitted&/accept`; either way the
 * name itself is everything after the last `/`.
 */
function reviewActionOf(action: URL): ReviewActionName | null {
	const written = pressedAction(action);
	const name = written.slice(written.lastIndexOf('/') + 1);

	return REVIEW_ACTION_NAMES.includes(name as ReviewActionName) ? (name as ReviewActionName) : null;
}

/** The change that carries every field of `review` over unchanged. */
function unchangedFrom(review: ApplicationForReview): ApplicationReviewChange {
	return {
		status: review.application.status,
		seat: review.seat,
		invoice: review.invoice,
		decisionNote: review.application.decisionNote,
		internalNote: review.application.internalNote
	};
}

/**
 * What a press of any of the five forms will change, given the review as the
 * page shows it at the moment of the press. Null for a press this file does
 * not recognise, or one it cannot predict, which the instant form then
 * leaves unpredicted.
 *
 * `seatGroups` is only read for "Accept": the seat chosen has to be one of
 * the free seats the page offered, the same way the server checks it before
 * writing the invoice.
 */
export function expectApplicationReviewChange(
	input: InstantSubmitInput,
	review: ApplicationForReview,
	seatGroups: SeatGroup[]
): ApplicationReviewChange | null {
	const action = reviewActionOf(input.action);
	const unchanged = unchangedFrom(review);

	if (action === 'accept') {
		const seatId = pressedField(input.formData, 'seatId');
		const choice = findFreeSeat(seatGroups, seatId);

		if (choice === null) return null;

		return {
			...unchanged,
			status: 'accepted',
			seat: {
				id: choice.seat.id,
				name: choice.seat.name,
				committeeLabel: choice.committeeLabel
			},
			invoice: null
		};
	}

	if (action === 'waitlist' || action === 'reject') {
		const decisionNote = pressedField(input.formData, 'decisionNote').trim();

		return {
			...unchanged,
			status: action === 'waitlist' ? 'waitlisted' : 'rejected',
			decisionNote: decisionNote === '' ? null : decisionNote
		};
	}

	if (action === 'revoke') {
		return {
			...unchanged,
			status: readRevokeTo(pressedField(input.formData, 'revokeTo')),
			seat: null,
			invoice: null
		};
	}

	if (action === 'saveInternalNote') {
		return {
			...unchanged,
			internalNote: pressedField(input.formData, 'internalNote').trim()
		};
	}

	return null;
}

/** `review` with every press still on its way laid on top, oldest first. */
export function applicationReviewAfterPresses(
	review: ApplicationForReview,
	presses: ApplicationReviewPress[]
): ApplicationForReview {
	let shown = review;

	for (const press of presses) {
		if (press.expected === null) continue;

		shown = {
			...shown,
			application: {
				...shown.application,
				status: press.expected.status,
				decisionNote: press.expected.decisionNote,
				internalNote: press.expected.internalNote
			},
			seat: press.expected.seat,
			invoice: press.expected.invoice
		};
	}

	return shown;
}

/** What did not happen when a press failed, for its toast. */
export function describeApplicationReviewFailure(press: ApplicationReviewPress): string {
	const action = reviewActionOf(press.action);

	if (action === 'accept') return 'The application was not accepted.';
	if (action === 'waitlist') return 'The application was not waitlisted.';
	if (action === 'reject') return 'The application was not marked as not accepted.';
	if (action === 'revoke') return 'The seat was not taken back.';
	if (action === 'saveInternalNote') return 'The note was not saved.';

	return 'The application was not changed.';
}

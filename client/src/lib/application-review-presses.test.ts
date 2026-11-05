import { describe, expect, it } from 'vitest';
import type { AllocatableSeat, SeatGroup } from '$lib/allocation';
import type { ApplicationForReview } from '$lib/application-review';
import type { InstantSubmitInput } from '$lib/instant-form.svelte';
import {
	applicationReviewAfterPresses,
	describeApplicationReviewFailure,
	expectApplicationReviewChange,
	type ApplicationReviewChange,
	type ApplicationReviewPress
} from './application-review-presses';

/** A submitted application with nothing decided yet, so each test only changes what it needs. */
function makeReview(overrides: Partial<ApplicationForReview> = {}): ApplicationForReview {
	return {
		application: {
			id: 'application-1',
			conferenceId: 'conference-1',
			status: 'submitted',
			committeePreferences: ['committee-1'],
			seatPreferences: null,
			motivation: null,
			answers: {},
			submittedAt: '2026-09-01T09:00:00Z',
			decidedAt: null,
			decisionNote: null,
			internalNote: null
		},
		profile: {
			userId: 'user-applicant',
			fullName: 'Anna Kowalska',
			avatarPath: null,
			institutionName: null,
			countryCode: null,
			experienceLevel: null
		},
		details: null,
		questions: [],
		preferredCommittees: ['UNSC'],
		seat: null,
		invoice: null,
		...overrides
	};
}

/** A free seat in "UNSC", the way `listSeatsByCommittee` shapes one. */
function makeSeat(overrides: Partial<AllocatableSeat> = {}): AllocatableSeat {
	return {
		id: 'seat-1',
		committeeId: 'committee-1',
		name: 'France',
		countryCode: 'FR',
		isAvailable: true,
		delegationId: null,
		userId: null,
		...overrides
	};
}

const SEAT_GROUPS: SeatGroup[] = [
	{ committeeId: 'committee-1', committeeLabel: 'UNSC', seats: [makeSeat()] }
];

/** A press of `search` carrying `fields`. */
function pressInput(search: string, fields: Record<string, string>): InstantSubmitInput {
	const formData = new FormData();
	for (const [name, value] of Object.entries(fields)) formData.set(name, value);

	return {
		action: new URL(`http://localhost/manage/rotterdam-2026/applications/application-1${search}`),
		formData,
		// A stand-in: nothing under test reads the real form element, and this
		// file's tests run in plain Node, which has no `document` to make one from.
		formElement: {} as HTMLFormElement,
		controller: new AbortController(),
		submitter: null,
		cancel: () => undefined
	};
}

/** The press as the instant form keeps it, with its expectation. */
function keptPress(
	input: InstantSubmitInput,
	review: ApplicationForReview,
	seatGroups: SeatGroup[] = SEAT_GROUPS
): ApplicationReviewPress {
	return {
		id: 1,
		formData: input.formData,
		action: input.action,
		expected: expectApplicationReviewChange(input, review, seatGroups)
	};
}

describe('expectApplicationReviewChange', () => {
	it('accepts the application into the chosen seat, with no invoice yet', () => {
		const review = makeReview();
		const change = expectApplicationReviewChange(
			pressInput('?/accept', { seatId: 'seat-1' }),
			review,
			SEAT_GROUPS
		) as ApplicationReviewChange;

		expect(change.status).toBe('accepted');
		expect(change.seat).toEqual({ id: 'seat-1', name: 'France', committeeLabel: 'UNSC' });
		expect(change.invoice).toBeNull();
	});

	it('leaves accept unpredicted when the seat is not one of the free seats offered', () => {
		const review = makeReview();
		const change = expectApplicationReviewChange(
			pressInput('?/accept', { seatId: 'seat-taken' }),
			review,
			SEAT_GROUPS
		);

		expect(change).toBeNull();
	});

	it('waitlists the application, keeping the note typed for the applicant', () => {
		const review = makeReview();
		const change = expectApplicationReviewChange(
			pressInput('?/waitlist', { decisionNote: 'Strong application, seats are full for now.' }),
			review,
			[]
		) as ApplicationReviewChange;

		expect(change.status).toBe('waitlisted');
		expect(change.decisionNote).toBe('Strong application, seats are full for now.');
	});

	it('marks the application not accepted, with an empty note read as none', () => {
		const review = makeReview();
		const change = expectApplicationReviewChange(
			pressInput('?/reject', { decisionNote: '  ' }),
			review,
			[]
		) as ApplicationReviewChange;

		expect(change.status).toBe('rejected');
		expect(change.decisionNote).toBeNull();
	});

	it('revokes an acceptance, freeing the seat and dropping the invoice', () => {
		const review = makeReview({
			application: { ...makeReview().application, status: 'accepted' },
			seat: { id: 'seat-1', name: 'France', committeeLabel: 'UNSC' },
			invoice: {
				id: 'invoice-1',
				number: 'ROTTERDAMMUN-2026-0001',
				status: 'unpaid',
				amountCents: 6500,
				currency: 'EUR'
			}
		});
		const change = expectApplicationReviewChange(
			pressInput('?/revoke', { revokeTo: 'withdrawn' }),
			review,
			[]
		) as ApplicationReviewChange;

		expect(change.status).toBe('withdrawn');
		expect(change.seat).toBeNull();
		expect(change.invoice).toBeNull();
	});

	it('reads an unrecognised revoke choice as "rejected", the way the server does', () => {
		const review = makeReview();
		const change = expectApplicationReviewChange(
			pressInput('?/revoke', { revokeTo: 'not-a-real-choice' }),
			review,
			[]
		) as ApplicationReviewChange;

		expect(change.status).toBe('rejected');
	});

	it('saves the internal note, leaving the decision alone', () => {
		const review = makeReview();
		const change = expectApplicationReviewChange(
			pressInput('?/saveInternalNote', { internalNote: '  Follow up before deciding.  ' }),
			review,
			[]
		) as ApplicationReviewChange;

		expect(change.internalNote).toBe('Follow up before deciding.');
		expect(change.status).toBe('submitted');
	});

	it('reads the action from behind the page queue filter', () => {
		const review = makeReview();
		const change = expectApplicationReviewChange(
			pressInput('?status=submitted&/reject', { decisionNote: '' }),
			review,
			[]
		) as ApplicationReviewChange;

		expect(change.status).toBe('rejected');
	});
});

describe('applicationReviewAfterPresses', () => {
	it('lays a press on top of the review, oldest first', () => {
		const review = makeReview();
		const shown = applicationReviewAfterPresses(review, [
			keptPress(pressInput('?/waitlist', { decisionNote: 'Not this round.' }), review)
		]);

		expect(shown.application.status).toBe('waitlisted');
		expect(shown.application.decisionNote).toBe('Not this round.');
	});

	it('leaves the review alone when a press could not be predicted', () => {
		const review = makeReview();
		const shown = applicationReviewAfterPresses(review, [
			keptPress(pressInput('?/accept', { seatId: 'seat-taken' }), review)
		]);

		expect(shown).toEqual(review);
	});
});

describe('describeApplicationReviewFailure', () => {
	it('names what did not happen for each action', () => {
		const review = makeReview();

		expect(describeApplicationReviewFailure(keptPress(pressInput('?/accept', {}), review))).toBe(
			'The application was not accepted.'
		);
		expect(describeApplicationReviewFailure(keptPress(pressInput('?/waitlist', {}), review))).toBe(
			'The application was not waitlisted.'
		);
		expect(describeApplicationReviewFailure(keptPress(pressInput('?/reject', {}), review))).toBe(
			'The application was not marked as not accepted.'
		);
		expect(describeApplicationReviewFailure(keptPress(pressInput('?/revoke', {}), review))).toBe(
			'The seat was not taken back.'
		);
		expect(
			describeApplicationReviewFailure(keptPress(pressInput('?/saveInternalNote', {}), review))
		).toBe('The note was not saved.');
	});
});

import { describe, expect, it } from 'vitest';
import type { SeatGroup } from '$lib/allocation';
import type { ApplicationQuestion } from '$lib/application-questions';
import {
	NOT_PROVIDED,
	UNKNOWN_AGE,
	acceptedFlash,
	ageRangeWarning,
	applicantProfileItems,
	canAllocate,
	canReject,
	canRevoke,
	canWaitlist,
	findFreeSeat,
	paidInvoiceNumberOf,
	readRevokeTo,
	revokedFlash,
	reviewAnswers,
	seatChoiceOptions,
	type ApplicantDetails,
	type ApplicantProfile
} from './application-review';
import type { MyApplicationInvoice } from './applications';

/** Two committees with one free seat each, the preferred committee already first. */
const SEAT_GROUPS: SeatGroup[] = [
	{
		committeeId: 'committee-hrc',
		committeeLabel: 'HRC',
		seats: [
			{
				id: 'seat-france',
				committeeId: 'committee-hrc',
				name: 'France',
				countryCode: 'FR',
				isAvailable: true,
				delegationId: null,
				userId: null
			}
		]
	},
	{
		committeeId: 'committee-unsc',
		committeeLabel: 'UNSC',
		seats: [
			{
				id: 'seat-chad',
				committeeId: 'committee-unsc',
				name: 'Chad',
				countryCode: 'TD',
				isAvailable: true,
				delegationId: null,
				userId: null
			}
		]
	}
];

/** An applicant who filled in every public fact. */
const PROFILE: ApplicantProfile = {
	userId: 'user-applicant',
	fullName: 'Anna Kowalski',
	avatarPath: null,
	institutionName: 'Delft University',
	countryCode: 'NL',
	experienceLevel: 'intermediate'
};

/** An applicant who filled in every private fact. */
const DETAILS: ApplicantDetails = {
	email: 'anna@example.com',
	dateOfBirth: '2008-04-01',
	phone: '+31 6 1234 5678',
	dietaryRequirements: 'Vegetarian',
	emergencyContactName: 'Maria Kowalska',
	emergencyContactPhone: '+48 600 100 200'
};

/** One invoice for the seat, `unpaid` unless a test says otherwise. */
function invoice(overrides: Partial<MyApplicationInvoice> = {}): MyApplicationInvoice {
	return {
		id: 'invoice-1',
		number: 'DELFTMUN-0031',
		status: 'unpaid',
		amountCents: 4500,
		currency: 'EUR',
		...overrides
	};
}

/** One custom question, a short text one unless a test says otherwise. */
function question(overrides: Partial<ApplicationQuestion>): ApplicationQuestion {
	return {
		id: 'question-1',
		label: 'Question',
		helpText: null,
		type: 'short_text',
		options: [],
		isRequired: false,
		position: 0,
		...overrides
	};
}

/** The value of one row of the profile list, found by its label. */
function valueOf(items: { label: string; value: string }[], label: string): string | undefined {
	return items.find((item) => item.label === label)?.value;
}

describe('what each status allows', () => {
	it('lets a submitted application be accepted, waitlisted or not accepted', () => {
		expect(canAllocate('submitted')).toBe(true);
		expect(canWaitlist('submitted')).toBe(true);
		expect(canReject('submitted')).toBe(true);
		expect(canRevoke('submitted')).toBe(false);
	});

	it('lets a waitlisted application be accepted or not accepted, but not waitlisted again', () => {
		expect(canAllocate('waitlisted')).toBe(true);
		expect(canWaitlist('waitlisted')).toBe(false);
		expect(canReject('waitlisted')).toBe(true);
	});

	it('lets only an accepted application have its seat taken back', () => {
		expect(canRevoke('accepted')).toBe(true);
		expect(canAllocate('accepted')).toBe(false);
		expect(canReject('accepted')).toBe(false);
	});

	it('leaves a rejected or withdrawn application with nothing to decide', () => {
		for (const status of ['rejected', 'withdrawn'] as const) {
			expect(canAllocate(status)).toBe(false);
			expect(canWaitlist(status)).toBe(false);
			expect(canReject(status)).toBe(false);
			expect(canRevoke(status)).toBe(false);
		}
	});
});

describe('readRevokeTo', () => {
	it('reads withdrawn as withdrawn', () => {
		expect(readRevokeTo('withdrawn')).toBe('withdrawn');
	});

	it('reads anything else as not accepted', () => {
		expect(readRevokeTo('rejected')).toBe('rejected');
		expect(readRevokeTo('')).toBe('rejected');
		expect(readRevokeTo('accepted')).toBe('rejected');
	});
});

describe('the flashes', () => {
	it('names the applicant, the seat and the committee after an accept', () => {
		expect(acceptedFlash('Anna Kowalski', 'France', 'UNSC')).toBe(
			'Anna Kowalski is now France in UNSC.'
		);
	});

	it('names a paid invoice that still needs a refund after a revoke', () => {
		expect(revokedFlash(null)).toBe('The seat is free again.');
		expect(revokedFlash('DELFTMUN-0031')).toBe(
			'The seat is free again. The paid invoice DELFTMUN-0031 still needs a manual refund.'
		);
	});
});

describe('seatChoiceOptions', () => {
	it('offers every free seat, named by committee and seat, in the order of the groups', () => {
		expect(seatChoiceOptions(SEAT_GROUPS)).toEqual([
			{ value: 'seat-france', label: 'HRC · France' },
			{ value: 'seat-chad', label: 'UNSC · Chad' }
		]);
	});

	it('offers nothing when every seat is taken', () => {
		expect(seatChoiceOptions([])).toEqual([]);
	});
});

describe('findFreeSeat', () => {
	it('finds the seat and the label of its committee', () => {
		const choice = findFreeSeat(SEAT_GROUPS, 'seat-chad');

		expect(choice?.seat.name).toBe('Chad');
		expect(choice?.committeeLabel).toBe('UNSC');
	});

	it('answers null for a seat no group offers any more', () => {
		expect(findFreeSeat(SEAT_GROUPS, 'seat-taken')).toBeNull();
	});
});

describe('paidInvoiceNumberOf', () => {
	it('names only a paid invoice', () => {
		expect(paidInvoiceNumberOf(invoice({ status: 'paid' }))).toBe('DELFTMUN-0031');
		expect(paidInvoiceNumberOf(invoice({ status: 'unpaid' }))).toBeNull();
		expect(paidInvoiceNumberOf(null)).toBeNull();
	});
});

/** A reader who may see both halves of the private details. */
const EVERY_DETAIL = { contact: true, welfare: true };

describe('applicantProfileItems', () => {
	it('lists the public and the private facts in the order the page shows them', () => {
		const items = applicantProfileItems(PROFILE, DETAILS, 18, EVERY_DETAIL);

		expect(items.map((item) => item.label)).toEqual([
			'Institution',
			'Country',
			'Experience',
			'Age',
			'Email',
			'Phone',
			'Dietary requirements',
			'Emergency contact'
		]);
		expect(valueOf(items, 'Country')).toBe('Netherlands');
		expect(items.find((item) => item.label === 'Country')?.countryCode).toBe('NL');
		expect(valueOf(items, 'Experience')).toBe('Intermediate');
		expect(valueOf(items, 'Age')).toBe('18');
		expect(valueOf(items, 'Emergency contact')).toBe('Maria Kowalska · +48 600 100 200');
	});

	it('says "Not provided" for every missing fact rather than leaving a blank', () => {
		const items = applicantProfileItems(
			{ ...PROFILE, institutionName: null, countryCode: null, experienceLevel: null },
			null,
			null,
			EVERY_DETAIL
		);

		expect(valueOf(items, 'Institution')).toBe(NOT_PROVIDED);
		expect(valueOf(items, 'Country')).toBe(NOT_PROVIDED);
		expect(valueOf(items, 'Experience')).toBe(NOT_PROVIDED);
		expect(valueOf(items, 'Age')).toBe(UNKNOWN_AGE);
		expect(valueOf(items, 'Email')).toBe(NOT_PROVIDED);
		expect(valueOf(items, 'Phone')).toBe(NOT_PROVIDED);
		expect(valueOf(items, 'Dietary requirements')).toBe(NOT_PROVIDED);
		expect(valueOf(items, 'Emergency contact')).toBe(NOT_PROVIDED);
	});

	it('treats a blank detail as missing and keeps whichever half of the emergency contact was given', () => {
		const items = applicantProfileItems(
			PROFILE,
			{ ...DETAILS, phone: '   ', emergencyContactName: null },
			18,
			EVERY_DETAIL
		);

		expect(valueOf(items, 'Phone')).toBe(NOT_PROVIDED);
		expect(valueOf(items, 'Emergency contact')).toBe('+48 600 100 200');
	});

	it('leaves out the rows of a half the reader may not see', () => {
		const contactOnly = applicantProfileItems(PROFILE, DETAILS, 18, {
			contact: true,
			welfare: false
		});
		const welfareOnly = applicantProfileItems(PROFILE, DETAILS, 18, {
			contact: false,
			welfare: true
		});

		expect(contactOnly.map((item) => item.label)).toEqual([
			'Institution',
			'Country',
			'Experience',
			'Email',
			'Phone'
		]);
		expect(welfareOnly.map((item) => item.label)).toEqual([
			'Institution',
			'Country',
			'Experience',
			'Age',
			'Dietary requirements',
			'Emergency contact'
		]);
	});
});

describe('ageRangeWarning', () => {
	it('says nothing for an age inside the range, an unknown age or a conference with no bounds', () => {
		expect(ageRangeWarning(16, 14, 18)).toBeNull();
		expect(ageRangeWarning(null, 14, 18)).toBeNull();
		expect(ageRangeWarning(40, null, null)).toBeNull();
	});

	it('names the whole range when the conference has both bounds', () => {
		expect(ageRangeWarning(12, 14, 18)).toBe('This conference is for delegates aged 14 to 18.');
		expect(ageRangeWarning(19, 14, 18)).toBe('This conference is for delegates aged 14 to 18.');
	});

	it('names the one bound a conference has', () => {
		expect(ageRangeWarning(12, 14, null)).toBe(
			'This conference is for delegates aged 14 and over.'
		);
		expect(ageRangeWarning(19, null, 18)).toBe('This conference is for delegates up to 18.');
	});
});

describe('reviewAnswers', () => {
	it('lists every question in the order it was asked, with "Not answered" for a blank one', () => {
		const questions = [
			question({ id: 'question-b', label: 'Why us?', type: 'long_text', position: 2 }),
			question({ id: 'question-a', label: 'Shirt size', position: 1 })
		];

		expect(reviewAnswers(questions, { 'question-b': 'Because.' })).toEqual([
			{ questionId: 'question-a', label: 'Shirt size', value: 'Not answered', isLong: false },
			{ questionId: 'question-b', label: 'Why us?', value: 'Because.', isLong: true }
		]);
	});
});

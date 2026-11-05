import { describe, expect, it } from 'vitest';
import {
	applicableFee,
	canAddFees,
	canTransitionInvoice,
	COLLECTION_MODE_OPTIONS,
	conferenceInvoiceTotals,
	platformFeeTakenCents,
	EMPTY_FEE_FORM,
	FEE_APPLIES_TO_OPTIONS,
	FEE_NAME_MAX_LENGTH,
	feeAppliesToLabel,
	feeInvoiceCountSentence,
	feeWindowSentence,
	hasCollectionModeErrors,
	hasFeeErrors,
	invoiceTotals,
	isCollectionMode,
	isFeeAppliesTo,
	isFeeCurrentlyValid,
	PAYMENT_INSTRUCTIONS_MAX_LENGTH,
	readCollectionModeForm,
	readFeeForm,
	validateCollectionModeForm,
	validateFeeForm,
	type Fee,
	type FeeFormValues,
	type ManagedFee
} from './fees';
import type { InvoiceStatus } from './invoices';

/** A fee a conference could really have, so a test can change one field of it. */
function fee(changes: Partial<Fee> = {}): Fee {
	return {
		id: 'fee-1',
		name: 'Delegate fee',
		amountCents: 6500,
		appliesTo: 'individual',
		validFrom: null,
		validUntil: null,
		position: 0,
		...changes
	};
}

/** Midday on 1 November 2026, so no test sits on a window's edge by accident. */
const NOW = new Date('2026-11-01T12:00:00Z');

describe('COLLECTION_MODE_OPTIONS', () => {
	it('offers card first and outside MUNMeet second', () => {
		const values = COLLECTION_MODE_OPTIONS.map((option) => option.value);

		expect(values).toEqual(['stripe', 'manual']);
	});

	it('names each way of collecting payment and says what it means', () => {
		expect(COLLECTION_MODE_OPTIONS[0].label).toBe('By card through MUNMeet');
		expect(COLLECTION_MODE_OPTIONS[0].description).toBe(
			'Delegates pay their invoices by card. Stripe pays the money out to your organisation.'
		);
		expect(COLLECTION_MODE_OPTIONS[1].label).toBe('Outside MUNMeet');
		expect(COLLECTION_MODE_OPTIONS[1].description).toBe(
			'You tell delegates how to pay and mark each invoice paid yourself.'
		);
	});
});

describe('feeWindowSentence', () => {
	// Amsterdam is an hour ahead of UTC on 1 November, so a window the organiser
	// set to run until midnight on the 1st is stored as 23:00 on 31 October. The
	// row has to say the 1st, which is the day they chose.
	const AMSTERDAM = 'Europe/Amsterdam';

	it('says nothing at all for a fee with no window', () => {
		expect(feeWindowSentence(fee(), AMSTERDAM)).toBe('');
	});

	it('names both ends when the fee has both', () => {
		const earlyBird = fee({
			validFrom: '2026-08-31T22:00:00Z',
			validUntil: '2026-10-31T23:00:00Z'
		});

		expect(feeWindowSentence(earlyBird, AMSTERDAM)).toBe('1 Sept – 1 Nov 2026');
	});

	it('reads each end in the conference timezone rather than in UTC', () => {
		// The same moment, read in a zone behind UTC instead of ahead of it: there
		// it is still 31 October, so the row says the 31st.
		const earlyBird = fee({ validUntil: '2026-10-31T23:00:00Z' });

		expect(feeWindowSentence(earlyBird, AMSTERDAM)).toBe('Until 1 Nov 2026');
		expect(feeWindowSentence(earlyBird, 'America/New_York')).toBe('Until 31 Oct 2026');
	});

	it('says which end it has when only one is set', () => {
		expect(feeWindowSentence(fee({ validFrom: '2026-11-01T00:00:00Z' }), 'UTC')).toBe(
			'From 1 Nov 2026'
		);
		expect(feeWindowSentence(fee({ validUntil: '2026-11-01T00:00:00Z' }), 'UTC')).toBe(
			'Until 1 Nov 2026'
		);
	});
});

describe('feeAppliesToLabel', () => {
	it('gives the words the dropdown uses, so a row and the form agree', () => {
		expect(feeAppliesToLabel('individual')).toBe('Individual delegates');
		expect(feeAppliesToLabel('delegation_member')).toBe('Delegation members');
	});
});

describe('feeInvoiceCountSentence', () => {
	it('uses the singular for the one fee that needs it', () => {
		expect(feeInvoiceCountSentence(1)).toBe('1 invoice');
	});

	it('uses the plural for none and for many', () => {
		expect(feeInvoiceCountSentence(0)).toBe('0 invoices');
		expect(feeInvoiceCountSentence(12)).toBe('12 invoices');
	});
});

describe('FEE_APPLIES_TO_OPTIONS', () => {
	it('offers the two kinds of person a fee can be for', () => {
		const values = FEE_APPLIES_TO_OPTIONS.map((option) => option.value);

		expect(values).toEqual(['individual', 'delegation_member']);
	});

	it('takes its words from the ones the rest of the app shows', () => {
		expect(FEE_APPLIES_TO_OPTIONS[0].label).toBe('Individual delegates');
		expect(FEE_APPLIES_TO_OPTIONS[1].label).toBe('Delegation members');
	});
});

describe('isFeeAppliesTo', () => {
	it('accepts the two values the database enum has', () => {
		expect(isFeeAppliesTo('individual')).toBe(true);
		expect(isFeeAppliesTo('delegation_member')).toBe(true);
	});

	it('refuses anything else, whatever a hand-made request sends', () => {
		expect(isFeeAppliesTo('')).toBe(false);
		expect(isFeeAppliesTo('everybody')).toBe(false);
		expect(isFeeAppliesTo('Individual')).toBe(false);
	});
});

describe('isCollectionMode', () => {
	it('accepts the two ways of collecting payment', () => {
		expect(isCollectionMode('stripe')).toBe(true);
		expect(isCollectionMode('manual')).toBe(true);
	});

	it('refuses anything else', () => {
		expect(isCollectionMode('')).toBe(false);
		expect(isCollectionMode('cash')).toBe(false);
	});
});

describe('isFeeCurrentlyValid', () => {
	it('says a fee with no window at all is always open', () => {
		expect(isFeeCurrentlyValid(fee(), NOW)).toBe(true);
	});

	it('is closed before the window opens and open once it has', () => {
		const earlyBird = fee({ validFrom: '2026-11-01T13:00:00Z' });

		expect(isFeeCurrentlyValid(earlyBird, NOW)).toBe(false);
		expect(isFeeCurrentlyValid(fee({ validFrom: '2026-11-01T11:00:00Z' }), NOW)).toBe(true);
	});

	it('is open until the end and closed after it', () => {
		expect(isFeeCurrentlyValid(fee({ validUntil: '2026-11-01T13:00:00Z' }), NOW)).toBe(true);
		expect(isFeeCurrentlyValid(fee({ validUntil: '2026-11-01T11:00:00Z' }), NOW)).toBe(false);
	});

	it('counts both bounds as inside the window, the way the database does', () => {
		const startsNow = fee({ validFrom: '2026-11-01T12:00:00Z' });
		const endsNow = fee({ validUntil: '2026-11-01T12:00:00Z' });

		expect(isFeeCurrentlyValid(startsNow, NOW)).toBe(true);
		expect(isFeeCurrentlyValid(endsNow, NOW)).toBe(true);
	});

	it('needs both bounds to be right when a fee has both', () => {
		const window = { validFrom: '2026-10-01T00:00:00Z', validUntil: '2026-12-01T00:00:00Z' };

		expect(isFeeCurrentlyValid(fee(window), NOW)).toBe(true);
		expect(isFeeCurrentlyValid(fee(window), new Date('2026-09-01T12:00:00Z'))).toBe(false);
		expect(isFeeCurrentlyValid(fee(window), new Date('2027-01-01T12:00:00Z'))).toBe(false);
	});
});

describe('applicableFee', () => {
	it('picks the lowest position of the fees that apply', () => {
		const fees = [
			fee({ id: 'plain', position: 1 }),
			fee({ id: 'early-bird', position: 0, validUntil: '2026-12-01T00:00:00Z' })
		];

		expect(applicableFee(fees, 'individual', NOW)?.id).toBe('early-bird');
	});

	it('leaves out the fees for the other kind of person', () => {
		const fees = [
			fee({ id: 'school', appliesTo: 'delegation_member', position: 0 }),
			fee({ id: 'individual', appliesTo: 'individual', position: 1 })
		];

		expect(applicableFee(fees, 'individual', NOW)?.id).toBe('individual');
		expect(applicableFee(fees, 'delegation_member', NOW)?.id).toBe('school');
	});

	it('leaves out a fee whose window has closed, however low its position', () => {
		const fees = [
			fee({ id: 'early-bird', position: 0, validUntil: '2026-10-01T00:00:00Z' }),
			fee({ id: 'plain', position: 1 })
		];

		expect(applicableFee(fees, 'individual', NOW)?.id).toBe('plain');
	});

	it('gives back nothing when no fee applies, so no invoice is created', () => {
		const fees = [fee({ id: 'school', appliesTo: 'delegation_member' })];

		expect(applicableFee(fees, 'individual', NOW)).toBeNull();
		expect(applicableFee([], 'individual', NOW)).toBeNull();
	});

	it('keeps the order the list arrived in when two fees share a position', () => {
		const fees = [fee({ id: 'first', position: 0 }), fee({ id: 'second', position: 0 })];

		expect(applicableFee(fees, 'individual', NOW)?.id).toBe('first');
	});

	it('hands back the whole row it was given, invoice count and all', () => {
		// The page lists `ManagedFee`s, and the fee it picks has to keep that
		// shape rather than being cut down to a plain `Fee` on the way through.
		const fees: ManagedFee[] = [{ ...fee({ id: 'plain' }), invoiceCount: 12 }];
		const chosen = applicableFee(fees, 'individual', NOW);

		expect(chosen?.invoiceCount).toBe(12);
	});
});

describe('EMPTY_FEE_FORM', () => {
	it('starts a new fee on the kind of person the database would have chosen', () => {
		expect(EMPTY_FEE_FORM.appliesTo).toBe('individual');
	});

	it('starts a new fee with no window, which is the plain price', () => {
		expect(EMPTY_FEE_FORM.validFrom).toBe('');
		expect(EMPTY_FEE_FORM.validUntil).toBe('');
	});

	it('has no fee id, which is how the page knows it is adding rather than editing', () => {
		expect(EMPTY_FEE_FORM.feeId).toBe('');
	});
});

describe('readFeeForm', () => {
	/** The form the fee editor posts. */
	function feeForm(fields: Record<string, string>): FormData {
		const formData = new FormData();

		for (const fieldName of Object.keys(fields)) {
			formData.set(fieldName, fields[fieldName]);
		}

		return formData;
	}

	it('reads every field the form asks for', () => {
		const formData = feeForm({
			feeId: 'fee-1',
			name: 'Early bird delegate fee',
			amount: '55.00',
			appliesTo: 'individual',
			validFrom: '2026-09-01T00:00',
			validUntil: '2026-11-01T00:00'
		});

		expect(readFeeForm(formData)).toEqual({
			feeId: 'fee-1',
			name: 'Early bird delegate fee',
			amount: '55.00',
			appliesTo: 'individual',
			validFrom: '2026-09-01T00:00',
			validUntil: '2026-11-01T00:00'
		});
	});

	it('counts a field the form left out as empty text', () => {
		const values = readFeeForm(feeForm({ name: 'Delegate fee' }));

		expect(values.feeId).toBe('');
		expect(values.validFrom).toBe('');
		expect(values.validUntil).toBe('');
	});

	it('drops the spaces around what somebody typed', () => {
		const values = readFeeForm(feeForm({ name: '  Delegate fee  ', amount: ' 65.00 ' }));

		expect(values.name).toBe('Delegate fee');
		expect(values.amount).toBe('65.00');
	});
});

describe('validateFeeForm', () => {
	/** A fee the form could really have been filled in with. */
	function feeValues(changes: Partial<FeeFormValues> = {}): FeeFormValues {
		return {
			feeId: '',
			name: 'Delegate fee',
			amount: '65.00',
			appliesTo: 'individual',
			validFrom: '',
			validUntil: '',
			...changes
		};
	}

	it('accepts a fee that is filled in properly', () => {
		expect(validateFeeForm(feeValues())).toEqual({});
	});

	it('asks for a name when there is none', () => {
		expect(validateFeeForm(feeValues({ name: '' })).name).toBe('Please name the fee.');
	});

	it('refuses a name longer than the limit', () => {
		const tooLong = 'a'.repeat(FEE_NAME_MAX_LENGTH + 1);

		expect(validateFeeForm(feeValues({ name: tooLong })).name).toBe(
			`Please keep the name under ${FEE_NAME_MAX_LENGTH} characters.`
		);
	});

	it('accepts a name of exactly the longest allowed', () => {
		const longest = 'a'.repeat(FEE_NAME_MAX_LENGTH);

		expect(validateFeeForm(feeValues({ name: longest })).name).toBeUndefined();
	});

	it('accepts an amount with two decimals, with none, and of nothing at all', () => {
		expect(validateFeeForm(feeValues({ amount: '65.00' })).amount).toBeUndefined();
		expect(validateFeeForm(feeValues({ amount: '65' })).amount).toBeUndefined();
		expect(validateFeeForm(feeValues({ amount: '0' })).amount).toBeUndefined();
	});

	it('refuses an amount that is missing, negative, or not a number', () => {
		const message = 'Please enter an amount of 0 or more.';

		expect(validateFeeForm(feeValues({ amount: '' })).amount).toBe(message);
		expect(validateFeeForm(feeValues({ amount: '-5' })).amount).toBe(message);
		expect(validateFeeForm(feeValues({ amount: 'sixty five' })).amount).toBe(message);
	});

	it('refuses an amount with more than two decimals', () => {
		expect(validateFeeForm(feeValues({ amount: '65.999' })).amount).toBe(
			'Please enter an amount of 0 or more.'
		);
	});

	it('refuses a kind of person the database does not have', () => {
		expect(validateFeeForm(feeValues({ appliesTo: 'schools' })).appliesTo).toBe(
			'Please choose who this fee applies to.'
		);
	});

	it('accepts a fee with no window, or with only one end of one', () => {
		expect(validateFeeForm(feeValues()).validUntil).toBeUndefined();
		expect(
			validateFeeForm(feeValues({ validFrom: '2026-09-01T00:00' })).validUntil
		).toBeUndefined();
		expect(
			validateFeeForm(feeValues({ validUntil: '2026-11-01T00:00' })).validUntil
		).toBeUndefined();
	});

	it('accepts a window that ends after it starts', () => {
		const values = feeValues({ validFrom: '2026-09-01T00:00', validUntil: '2026-11-01T00:00' });

		expect(validateFeeForm(values).validUntil).toBeUndefined();
	});

	it('refuses a window that ends before it starts', () => {
		const values = feeValues({ validFrom: '2026-11-01T00:00', validUntil: '2026-09-01T00:00' });

		expect(validateFeeForm(values).validUntil).toBe('The end must be after the start.');
	});

	it('refuses a window that ends at the very minute it starts', () => {
		const values = feeValues({ validFrom: '2026-09-01T09:00', validUntil: '2026-09-01T09:00' });

		expect(validateFeeForm(values).validUntil).toBe('The end must be after the start.');
	});

	it('collects every problem at once rather than stopping at the first', () => {
		const values = feeValues({ name: '', amount: 'free', appliesTo: '' });
		const errors = validateFeeForm(values);

		expect(Object.keys(errors).sort()).toEqual(['amount', 'appliesTo', 'name']);
	});
});

describe('hasFeeErrors', () => {
	it('says nothing is wrong with an empty set of messages', () => {
		expect(hasFeeErrors({})).toBe(false);
	});

	it('says something is wrong as soon as one field has a message', () => {
		expect(hasFeeErrors({ name: 'Please name the fee.' })).toBe(true);
	});
});

describe('readCollectionModeForm', () => {
	it('reads both fields and drops the spaces around them', () => {
		const formData = new FormData();
		formData.set('mode', 'manual');
		formData.set('paymentInstructions', '  Pay by bank transfer to NL00 BANK.  ');

		expect(readCollectionModeForm(formData)).toEqual({
			mode: 'manual',
			paymentInstructions: 'Pay by bank transfer to NL00 BANK.'
		});
	});

	it('counts a field the form left out as empty text', () => {
		expect(readCollectionModeForm(new FormData())).toEqual({
			mode: '',
			paymentInstructions: ''
		});
	});
});

describe('validateCollectionModeForm', () => {
	const CONNECTED = { isStripeConnected: true };
	const NOT_CONNECTED = { isStripeConnected: false };

	it('accepts card payment once Stripe is connected', () => {
		const values = { mode: 'stripe', paymentInstructions: '' };

		expect(validateCollectionModeForm(values, CONNECTED)).toEqual({});
	});

	it('refuses card payment while Stripe is not connected', () => {
		const values = { mode: 'stripe', paymentInstructions: '' };

		expect(validateCollectionModeForm(values, NOT_CONNECTED).mode).toBe(
			'Connect Stripe first, or choose to collect payments outside MUNMeet.'
		);
	});

	it('accepts collecting outside MUNMeet with instructions, connected or not', () => {
		const values = { mode: 'manual', paymentInstructions: 'Pay by bank transfer to NL00 BANK.' };

		expect(validateCollectionModeForm(values, NOT_CONNECTED)).toEqual({});
		expect(validateCollectionModeForm(values, CONNECTED)).toEqual({});
	});

	it('asks for instructions when payments are collected outside MUNMeet', () => {
		const values = { mode: 'manual', paymentInstructions: '' };

		expect(validateCollectionModeForm(values, CONNECTED).paymentInstructions).toBe(
			'Please tell delegates how to pay.'
		);
	});

	it('refuses instructions longer than the limit', () => {
		const tooLong = 'a'.repeat(PAYMENT_INSTRUCTIONS_MAX_LENGTH + 1);
		const values = { mode: 'manual', paymentInstructions: tooLong };

		expect(validateCollectionModeForm(values, CONNECTED).paymentInstructions).toBe(
			`Please keep the instructions under ${PAYMENT_INSTRUCTIONS_MAX_LENGTH} characters.`
		);
	});

	it('refuses a mode the page does not offer', () => {
		const values = { mode: 'cash', paymentInstructions: '' };

		expect(validateCollectionModeForm(values, CONNECTED).mode).toBe(
			'Please choose how you collect payments.'
		);
	});
});

describe('hasCollectionModeErrors', () => {
	it('says nothing is wrong with an empty set of messages', () => {
		expect(hasCollectionModeErrors({})).toBe(false);
	});

	it('says something is wrong as soon as one field has a message', () => {
		expect(
			hasCollectionModeErrors({ paymentInstructions: 'Please tell delegates how to pay.' })
		).toBe(true);
	});
});

describe('canAddFees', () => {
	it('allows fees once Stripe is connected', () => {
		expect(canAddFees({ isStripeConnected: true, collectsPaymentsManually: false })).toBe(true);
	});

	it('allows fees when the organiser collects payments outside MUNMeet', () => {
		expect(canAddFees({ isStripeConnected: false, collectsPaymentsManually: true })).toBe(true);
	});

	it('refuses fees when there is no way of being paid at all', () => {
		expect(canAddFees({ isStripeConnected: false, collectsPaymentsManually: false })).toBe(false);
	});
});

describe('invoiceTotals', () => {
	/** An invoice as the totals see it: what it is in, what it is for, and where it stands. */
	function billed(currency: string, amountCents: number, status: InvoiceStatus) {
		return { currency, amountCents, status };
	}

	it('adds the unpaid invoices into the outstanding total', () => {
		const totals = invoiceTotals([
			billed('EUR', 6500, 'unpaid'),
			billed('EUR', 5500, 'unpaid'),
			billed('EUR', 60000, 'paid')
		]);

		expect(totals).toEqual([{ currency: 'EUR', outstandingCents: 12000, paidCents: 60000 }]);
	});

	it('keeps each currency apart, in the order it first appears', () => {
		const totals = invoiceTotals([
			billed('GBP', 60000, 'unpaid'),
			billed('EUR', 6500, 'unpaid'),
			billed('GBP', 1000, 'paid')
		]);

		expect(totals).toEqual([
			{ currency: 'GBP', outstandingCents: 60000, paidCents: 1000 },
			{ currency: 'EUR', outstandingCents: 6500, paidCents: 0 }
		]);
	});

	it('counts a waived, cancelled or refunded invoice towards neither total', () => {
		const totals = invoiceTotals([
			billed('EUR', 6500, 'waived'),
			billed('EUR', 6500, 'void'),
			billed('EUR', 6500, 'refunded')
		]);

		expect(totals).toEqual([{ currency: 'EUR', outstandingCents: 0, paidCents: 0 }]);
	});

	it('has nothing to say about an empty list', () => {
		expect(invoiceTotals([])).toEqual([]);
	});
});

describe('canTransitionInvoice', () => {
	/** Every status an invoice can have, in the order `06-features/fees.md` lists them. */
	const STATUSES: InvoiceStatus[] = ['unpaid', 'paid', 'waived', 'void', 'refunded'];

	/** The only four moves the feature spec allows, written as "from>to". */
	const ALLOWED_MOVES = ['unpaid>paid', 'unpaid>waived', 'unpaid>void', 'paid>refunded'];

	it('allows exactly the four moves of the feature spec, and refuses every other pair', () => {
		for (const from of STATUSES) {
			for (const to of STATUSES) {
				const isAllowed = ALLOWED_MOVES.includes(`${from}>${to}`);

				expect(canTransitionInvoice(from, to), `${from} to ${to}`).toBe(isAllowed);
			}
		}
	});

	it('does not count staying put as a move', () => {
		expect(canTransitionInvoice('unpaid', 'unpaid')).toBe(false);
	});
});

describe('conferenceInvoiceTotals', () => {
	/** One invoice with only the four fields the totals read. */
	function invoice(
		amountCents: number,
		status: InvoiceStatus,
		paidMethod: 'stripe' | 'manual' | null = null,
		platformFeeCents = 200
	) {
		return { amountCents, status, paidMethod, platformFeeCents };
	}

	it('adds the paid and the unpaid invoices up, and calls the two together invoiced', () => {
		const totals = conferenceInvoiceTotals([
			invoice(6500, 'unpaid'),
			invoice(5500, 'unpaid'),
			invoice(6500, 'paid', 'manual')
		]);

		expect(totals).toEqual({
			invoicedCents: 18500,
			paidCents: 6500,
			outstandingCents: 12000,
			outstandingCount: 2,
			waivedCents: 0,
			platformFeesCents: 0
		});
	});

	it('counts a cancelled or refunded invoice nowhere, and a waived one only as waived', () => {
		const totals = conferenceInvoiceTotals([
			invoice(6500, 'waived'),
			invoice(6500, 'void'),
			invoice(6500, 'refunded', 'stripe')
		]);

		expect(totals).toEqual({
			invoicedCents: 0,
			paidCents: 0,
			outstandingCents: 0,
			outstandingCount: 0,
			waivedCents: 6500,
			platformFeesCents: 0
		});
	});

	it('counts the platform fee of an invoice paid by card and of no other', () => {
		const totals = conferenceInvoiceTotals([
			invoice(16500, 'paid', 'stripe', 600),
			invoice(6500, 'paid', 'manual', 200),
			invoice(6500, 'unpaid', null, 200)
		]);

		expect(totals.platformFeesCents).toBe(600);
	});

	it('answers zero everywhere for a conference with no invoices', () => {
		expect(conferenceInvoiceTotals([])).toEqual({
			invoicedCents: 0,
			paidCents: 0,
			outstandingCents: 0,
			outstandingCount: 0,
			waivedCents: 0,
			platformFeesCents: 0
		});
	});
});

describe('platformFeeTakenCents', () => {
	it('is the fee of an invoice paid by card', () => {
		expect(
			platformFeeTakenCents({ platformFeeCents: 200, status: 'paid', paidMethod: 'stripe' })
		).toBe(200);
	});

	it('is nothing for an invoice paid by hand, still owed, or refunded', () => {
		expect(
			platformFeeTakenCents({ platformFeeCents: 200, status: 'paid', paidMethod: 'manual' })
		).toBeNull();
		expect(
			platformFeeTakenCents({ platformFeeCents: 200, status: 'unpaid', paidMethod: null })
		).toBeNull();
		expect(
			platformFeeTakenCents({ platformFeeCents: 200, status: 'refunded', paidMethod: 'stripe' })
		).toBeNull();
	});
});

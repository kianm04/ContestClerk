/**
 * Fees: what a conference charges, which fee a particular person pays right
 * now, and the checks the organiser's fees page runs before saving any of it.
 *
 * Nothing in here talks to Supabase or to Svelte. `$lib/server/fees.ts` reads
 * and writes the rows; the rules live here so that they can be read and tested
 * without a database. The rules come from `specs/06-features/fees.md` and the
 * wording of every message from `specs/05-pages/organiser/fees.md`.
 */

import type { Database } from '$lib/database.types';
import { dayInTimezone, formatDateRange } from '$lib/dates';
import type { InvoiceStatus } from '$lib/invoices';
import { toCents } from '$lib/money';
import { statusLabel } from '$lib/status';

/** Who a fee is for: somebody coming on their own, or a member of a school's delegation. */
export type FeeAppliesTo = Database['public']['Enums']['fee_applies_to'];

/** One fee of a conference, in the shape the pages show it. */
export type Fee = {
	id: string;
	name: string;
	/** Whole cents of the conference's currency, never a decimal. See the top of `$lib/money.ts`. */
	amountCents: number;
	appliesTo: FeeAppliesTo;
	/** ISO timestamps. null means no bound on that side. */
	validFrom: string | null;
	validUntil: string | null;
	/** Lowest first. It decides which fee wins when two windows are open at once. */
	position: number;
};

/**
 * A fee as the organiser's own page shows it: the fee itself, and how many
 * invoices already point at it. The page needs the count because a fee that
 * invoices reference cannot be deleted, and the message says how many.
 */
export type ManagedFee = Fee & { invoiceCount: number };

/**
 * How a conference collects what it charges: by card through MUNMeet, or
 * outside it. `manual` is `conferences.collects_payments_manually` being true.
 */
export type CollectionMode = 'stripe' | 'manual';

/**
 * The two ways of collecting payment, in the order the radio buttons show them.
 *
 * The description is the quiet line under each label, which `RadioGroup` draws.
 */
export const COLLECTION_MODE_OPTIONS: {
	value: CollectionMode;
	label: string;
	description: string;
}[] = [
	{
		value: 'stripe',
		label: 'By card through MUNMeet',
		description:
			'Delegates pay their invoices by card. Stripe pays the money out to your organisation.'
	},
	{
		value: 'manual',
		label: 'Outside MUNMeet',
		description: 'You tell delegates how to pay and mark each invoice paid yourself.'
	}
];

/**
 * The two kinds of person a fee can be for, in the order the dropdown shows them.
 *
 * The words come from `$lib/status`, which already has one for every value of
 * every database enum, so the dropdown and an invoice row cannot disagree.
 */
export const FEE_APPLIES_TO_OPTIONS: { value: FeeAppliesTo; label: string }[] = [
	{ value: 'individual', label: statusLabel('fee_applies_to', 'individual') },
	{ value: 'delegation_member', label: statusLabel('fee_applies_to', 'delegation_member') }
];

/** How many characters a fee's name may have. `05-pages/organiser/fees.md`. */
export const FEE_NAME_MAX_LENGTH = 80;

/**
 * How many characters the payment instructions may have. Long enough for a bank
 * account, a reference and a paragraph about when the money is expected.
 */
export const PAYMENT_INSTRUCTIONS_MAX_LENGTH = 2000;

/** Is this one of the two `fee_applies_to` values? Anyone can put anything in a form, so forms ask. */
export function isFeeAppliesTo(text: string): text is FeeAppliesTo {
	return FEE_APPLIES_TO_OPTIONS.some((option) => option.value === text);
}

/** Is this one of the two ways of collecting payment? Asked for the same reason. */
export function isCollectionMode(text: string): text is CollectionMode {
	return COLLECTION_MODE_OPTIONS.some((option) => option.value === text);
}

/**
 * Is this fee's own window open at `now`?
 *
 * A null bound means no bound on that side, the same way the application window
 * on a conference reads, so a fee with neither bound is always open. Both bounds
 * count as inside the window, which is what the database's `applicable_fee` does
 * (`valid_from <= now` and `valid_until >= now`).
 *
 * `now` is a parameter rather than read from the clock, because a pure function
 * may not read the clock.
 */
export function isFeeCurrentlyValid(fee: Fee, now: Date): boolean {
	const moment = now.getTime();

	if (fee.validFrom !== null && new Date(fee.validFrom).getTime() > moment) {
		return false;
	}

	if (fee.validUntil !== null && new Date(fee.validUntil).getTime() < moment) {
		return false;
	}

	return true;
}

/**
 * Which fee somebody of that kind pays right now: of the fees that apply to
 * them and whose window is open, the one with the lowest `position`. `null`
 * when none of them matches, and then no invoice is created at all.
 *
 * This is the same rule as the database's `applicable_fee`, and it is done here
 * rather than there on purpose: that function is revoked from `public`, `anon`
 * and `authenticated`, because a signed-in caller could otherwise ask it the
 * prices of a conference still in draft.
 *
 * The SQL breaks a tie between two fees that share a `position` by `created_at`.
 * A `Fee` has no `created_at`, so a tie keeps the order the list arrived in,
 * which is the order `listFees` read them in: `position`, then the database's
 * own order. `FeeShape` is whatever the caller has — a `Fee` or a `ManagedFee` —
 * and the same shape is handed back, so nothing is lost on the way through.
 */
export function applicableFee<FeeShape extends Fee>(
	fees: FeeShape[],
	appliesTo: FeeAppliesTo,
	now: Date
): FeeShape | null {
	const matching = fees.filter(
		(fee) => fee.appliesTo === appliesTo && isFeeCurrentlyValid(fee, now)
	);

	if (matching.length === 0) {
		return null;
	}

	let lowest = matching[0];

	// Strictly lower, so the first of two fees sharing a position keeps the place.
	for (const fee of matching) {
		if (fee.position < lowest.position) {
			lowest = fee;
		}
	}

	return lowest;
}

/**
 * A fee's validity window in words, read in the conference's own timezone:
 * "1 Nov 2026", "Until 1 Nov 2026", "1 Sep – 1 Nov 2026", or `''` for a fee
 * that is charged all the way through.
 *
 * It lives here rather than in the row that draws it, because `CLAUDE.md` keeps
 * formatting out of a component's script block, and because a fee's window
 * reads the same wherever it is shown.
 *
 * The timezone matters: a window that ends at midnight in Amsterdam is stored
 * as 23:00 the day before in UTC, and a row that said "31 Oct" for a price the
 * organiser set to run until 1 November would look like a bug. `dayInTimezone`
 * turns each moment into the day it falls on where the conference is, and
 * `formatDateRange` is what writes every other date in the app.
 */
export function feeWindowSentence(fee: Fee, timeZone: string): string {
	const fromDay = fee.validFrom === null ? null : dayInTimezone(new Date(fee.validFrom), timeZone);
	const untilDay =
		fee.validUntil === null ? null : dayInTimezone(new Date(fee.validUntil), timeZone);

	if (fromDay !== null && untilDay !== null) {
		return formatDateRange(fromDay, untilDay);
	}

	if (fromDay !== null) {
		// Handing the same day to both sides is how this repository writes a
		// single date, rather than a second formatter that could drift from it.
		return `From ${formatDateRange(fromDay, fromDay)}`;
	}

	if (untilDay !== null) {
		return `Until ${formatDateRange(untilDay, untilDay)}`;
	}

	return '';
}

/**
 * The words for who a fee applies to, such as "Individual delegates".
 *
 * A fee's `applies_to` always matches one of the two options, so the fallback
 * is only there because TypeScript cannot see that.
 */
export function feeAppliesToLabel(appliesTo: FeeAppliesTo): string {
	const option = FEE_APPLIES_TO_OPTIONS.find((candidate) => candidate.value === appliesTo);

	return option?.label ?? appliesTo;
}

/** "12 invoices", or "1 invoice" for the one fee that needs the singular. */
export function feeInvoiceCountSentence(invoiceCount: number): string {
	if (invoiceCount === 1) {
		return '1 invoice';
	}

	return `${invoiceCount} invoices`;
}

/**
 * Everything the fee form asks for.
 *
 * Every field is text, including the amount and the two dates, because that is
 * what a form sends and what an input shows. A refused form is drawn again from
 * these exact values, so the organiser sees what they typed rather than a tidied
 * version of it.
 */
export type FeeFormValues = {
	/** The fee being edited, or `''` when the form is adding a new one. */
	feeId: string;
	name: string;
	/** The amount as it was typed, such as "65" or "65.00". `toCents` turns it into cents. */
	amount: string;
	/** A `fee_applies_to` value: `individual` or `delegation_member`. */
	appliesTo: string;
	/** Optional. `YYYY-MM-DDTHH:mm` from an `<input type="datetime-local">`, or `''`. */
	validFrom: string;
	/** Optional, and the same shape as `validFrom`. */
	validUntil: string;
};

/** A message for each field that needs fixing. A field that is fine has no entry. */
export type FeeFormErrors = {
	name?: string;
	amount?: string;
	appliesTo?: string;
	validUntil?: string;
};

/**
 * What the form shows for a fee that does not exist yet.
 *
 * `appliesTo` starts on `individual` because that is what the `fees` table
 * defaults to, so a fee saved without touching the dropdown looks the same
 * whichever side filled it in. Both dates start empty, which means a fee with no
 * window: the plain price, rather than an early bird one.
 */
export const EMPTY_FEE_FORM: FeeFormValues = {
	feeId: '',
	name: '',
	amount: '',
	appliesTo: 'individual',
	validFrom: '',
	validUntil: ''
};

/** Read one text field from a submitted form, without surrounding spaces. A missing field counts as ''. */
function readText(formData: FormData, fieldName: string): string {
	return String(formData.get(fieldName) ?? '').trim();
}

/**
 * Read the fee form's fields from a submitted form.
 *
 * `feeId` is the hidden field that says which fee is being edited. It is empty
 * on the "Add fee" form, which is how the page tells the two apart.
 */
export function readFeeForm(formData: FormData): FeeFormValues {
	return {
		feeId: readText(formData, 'feeId'),
		name: readText(formData, 'name'),
		amount: readText(formData, 'amount'),
		appliesTo: readText(formData, 'appliesTo'),
		validFrom: readText(formData, 'validFrom'),
		validUntil: readText(formData, 'validUntil')
	};
}

/**
 * Check the fee form. Every problem is collected instead of stopping at the
 * first one, so the organiser sees all of them at once rather than one per attempt.
 */
export function validateFeeForm(values: FeeFormValues): FeeFormErrors {
	const errors: FeeFormErrors = {};

	if (values.name === '') {
		errors.name = 'Please name the fee.';
	} else if (values.name.length > FEE_NAME_MAX_LENGTH) {
		errors.name = `Please keep the name under ${FEE_NAME_MAX_LENGTH} characters.`;
	}

	// `toCents` already refuses anything that is not an amount, anything with
	// more than two decimals, and anything negative, so one question covers the
	// whole rule. Zero is allowed: a fee of nothing is a deliberate thing to charge.
	if (toCents(values.amount) === null) {
		errors.amount = 'Please enter an amount of 0 or more.';
	}

	// Only a hand-made request can get here with anything else in it, since the
	// dropdown offers these two values and nothing besides.
	if (!isFeeAppliesTo(values.appliesTo)) {
		errors.appliesTo = 'Please choose who this fee applies to.';
	}

	// Both bounds are `YYYY-MM-DDTHH:mm` read in the same timezone, the
	// conference's, and a date written that way sorts the same as the moment it
	// names: the year first, then the month, down to the minute. So comparing
	// them as text compares them as moments, with no dates to parse.
	const hasBothBounds = values.validFrom !== '' && values.validUntil !== '';

	if (hasBothBounds && values.validUntil <= values.validFrom) {
		errors.validUntil = 'The end must be after the start.';
	}

	return errors;
}

/** Did `validateFeeForm` find any problem at all? */
export function hasFeeErrors(errors: FeeFormErrors): boolean {
	return Object.keys(errors).length > 0;
}

/**
 * What the "How you collect payments" form asks for. Both fields are text for
 * the same reason the fee form's are.
 */
export type CollectionModeValues = {
	/** A `CollectionMode`: `stripe` or `manual`. */
	mode: string;
	/** What a delegate is told to do when the mode is `manual`. */
	paymentInstructions: string;
};

/** A message for each field that needs fixing. A field that is fine has no entry. */
export type CollectionModeErrors = {
	mode?: string;
	paymentInstructions?: string;
};

/** Read the collection mode form's two fields from a submitted form. */
export function readCollectionModeForm(formData: FormData): CollectionModeValues {
	return {
		mode: readText(formData, 'mode'),
		paymentInstructions: readText(formData, 'paymentInstructions')
	};
}

/**
 * Check the collection mode form.
 *
 * `isStripeConnected` is whether the organisation has finished its Stripe
 * onboarding, which the values themselves cannot say. Collecting by card is
 * refused until it has, because an invoice with no account behind it cannot be
 * paid; the message says so on the `mode` field, since that is the choice to
 * change.
 */
export function validateCollectionModeForm(
	values: CollectionModeValues,
	context: { isStripeConnected: boolean }
): CollectionModeErrors {
	const errors: CollectionModeErrors = {};

	// Only a hand-made request can get here with anything but the two modes in it.
	if (!isCollectionMode(values.mode)) {
		errors.mode = 'Please choose how you collect payments.';
	}

	if (values.mode === 'stripe' && !context.isStripeConnected) {
		errors.mode = 'Connect Stripe first, or choose to collect payments outside MUNMeet.';
	}

	// Instructions are only asked for in manual mode: they are the whole of what
	// a delegate is given instead of a "Pay by card" button.
	if (values.mode === 'manual' && values.paymentInstructions === '') {
		errors.paymentInstructions = 'Please tell delegates how to pay.';
	}

	// The length is checked whichever mode is chosen, because the box is sent
	// either way and whatever is in it is saved. An empty box is never too long,
	// so this can never overwrite the message above.
	if (values.paymentInstructions.length > PAYMENT_INSTRUCTIONS_MAX_LENGTH) {
		errors.paymentInstructions = `Please keep the instructions under ${PAYMENT_INSTRUCTIONS_MAX_LENGTH} characters.`;
	}

	return errors;
}

/** Did `validateCollectionModeForm` find any problem at all? */
export function hasCollectionModeErrors(errors: CollectionModeErrors): boolean {
	return Object.keys(errors).length > 0;
}

/**
 * May this conference have fees added to it yet?
 *
 * `06-features/fees.md`: a fee can only be created once the organisation's
 * Stripe onboarding is complete, unless the organiser has chosen to collect
 * payments outside MUNMeet. Either road is enough; a conference with neither has
 * no way of being paid, so it is not allowed to charge anybody.
 */
export function canAddFees(context: {
	isStripeConnected: boolean;
	collectsPaymentsManually: boolean;
}): boolean {
	return context.isStripeConnected || context.collectsPaymentsManually;
}

/**
 * What one currency's worth of invoices adds up to, for the line above the
 * list on `/invoices`.
 *
 * Totals are per currency rather than one number, because a person can hold
 * invoices from conferences that charge in different currencies and adding
 * euros to pounds gives a number that means nothing.
 */
export type InvoiceTotal = {
	/** A three-letter ISO 4217 code, such as `EUR`. */
	currency: string;
	/** Whole cents still owed: the `unpaid` invoices of this currency. */
	outstandingCents: number;
	/** Whole cents already settled: the `paid` ones. */
	paidCents: number;
};

/**
 * The outstanding and paid totals of a list of invoices, one entry per
 * currency, in the order each currency first appears in the list.
 *
 * `waived`, `void` and `refunded` count towards neither: nothing is owed on
 * them and no money is sitting with the organisers because of them. This is
 * the `invoiceTotals` `06-features/fees.md` lists among the rules with tests.
 *
 * It lives in this file rather than in `invoices.ts` because the feature spec
 * puts it here beside the other money rules, and because T33's organiser
 * totals add up the same invoices the same way.
 */
export function invoiceTotals(
	invoices: { currency: string; amountCents: number; status: InvoiceStatus }[]
): InvoiceTotal[] {
	const totals: InvoiceTotal[] = [];

	for (const invoice of invoices) {
		let total = totals.find((candidate) => candidate.currency === invoice.currency);

		if (!total) {
			total = { currency: invoice.currency, outstandingCents: 0, paidCents: 0 };
			totals.push(total);
		}

		if (invoice.status === 'unpaid') {
			total.outstandingCents += invoice.amountCents;
		}

		if (invoice.status === 'paid') {
			total.paidCents += invoice.amountCents;
		}
	}

	return totals;
}

/**
 * May an invoice move from one status to another?
 *
 * `06-features/fees.md` allows exactly four moves: an `unpaid` invoice may be
 * paid, waived or voided, and a `paid` one may be refunded. Nothing else moves
 * at all, and staying put is not a move either.
 *
 * The database's `check_invoice_transition` trigger refuses the same moves for
 * everybody, so this is not what keeps an invoice safe. It is what lets the
 * fees page offer only the buttons that can work, and answer a refused one
 * with a sentence rather than a database error.
 */
export function canTransitionInvoice(from: InvoiceStatus, to: InvoiceStatus): boolean {
	if (from === 'unpaid') {
		return to === 'paid' || to === 'waived' || to === 'void';
	}

	if (from === 'paid') {
		return to === 'refunded';
	}

	return false;
}

/**
 * The four numbers above the organiser's invoices table, in whole cents of the
 * conference's currency.
 *
 * One currency and not a list of them, unlike `InvoiceTotal` above: the
 * details editor locks a conference's currency once it has an invoice, and
 * `guard_invoice_insert` copies that currency onto every invoice, so every
 * invoice of one conference is in the same one.
 */
export type ConferenceInvoiceTotals = {
	/** What is owed or has been paid: `outstandingCents + paidCents`. */
	invoicedCents: number;
	/** The `paid` invoices. */
	paidCents: number;
	/** The `unpaid` invoices. */
	outstandingCents: number;
	/** How many invoices are `unpaid`, which the "Outstanding" figure names. */
	outstandingCount: number;
	/** The `waived` invoices: charged, then let off by the organisers. */
	waivedCents: number;
	/** What MUNMeet kept from the invoices paid by card. */
	platformFeesCents: number;
};

/**
 * The platform fee MUNMeet really kept on one invoice, or null when it kept none.
 *
 * Only an invoice paid by card has one, for the reasons under
 * `conferenceInvoiceTotals` below. The database fills `platform_fee_cents` in on
 * every invoice, so the table and the CSV ask this rather than print that
 * column, and agree with the total above them.
 */
export function platformFeeTakenCents(invoice: {
	platformFeeCents: number;
	status: InvoiceStatus;
	paidMethod: 'stripe' | 'manual' | null;
}): number | null {
	if (invoice.status === 'paid' && invoice.paidMethod === 'stripe') {
		return invoice.platformFeeCents;
	}

	return null;
}

/**
 * Add up every invoice of a conference for the totals above its table.
 *
 * The caller hands over the whole list rather than the page on screen, which is
 * what `05-pages/organiser/fees.md` asks: the totals are the conference's, not
 * the twenty-five rows that happen to be showing.
 *
 * "Invoiced" is paid plus outstanding, the way the page's wireframe adds them
 * up. A `waived` or `void` invoice is nobody's money any more, and a `refunded`
 * one went back to the payer, so none of those three counts in it. The waived
 * ones get a figure of their own, so the organiser can see what they let go.
 *
 * The platform fee is counted only on an invoice paid by card.
 * `02-architecture/payments.md` takes it from a Stripe payment as the
 * `application_fee_amount`, says no platform fee is collected on a manual
 * payment, and gives it back with a refund, so every other invoice's
 * `platform_fee_cents` is a number MUNMeet never received.
 */
export function conferenceInvoiceTotals(
	invoices: {
		amountCents: number;
		platformFeeCents: number;
		status: InvoiceStatus;
		paidMethod: 'stripe' | 'manual' | null;
	}[]
): ConferenceInvoiceTotals {
	let paidCents = 0;
	let outstandingCents = 0;
	let outstandingCount = 0;
	let waivedCents = 0;
	let platformFeesCents = 0;

	for (const invoice of invoices) {
		if (invoice.status === 'unpaid') {
			outstandingCents += invoice.amountCents;
			outstandingCount += 1;
		}

		if (invoice.status === 'paid') {
			paidCents += invoice.amountCents;
		}

		if (invoice.status === 'waived') {
			waivedCents += invoice.amountCents;
		}

		platformFeesCents += platformFeeTakenCents(invoice) ?? 0;
	}

	return {
		invoicedCents: paidCents + outstandingCents,
		paidCents,
		outstandingCents,
		outstandingCount,
		waivedCents,
		platformFeesCents
	};
}

/**
 * The `id` of the hidden form that saves a drag in the fee list. Every drag
 * handle of the list names it in its `form` attribute.
 */
export const FEE_DROP_FORM_ID = 'fee-drop-form';

/** The `id` of the sentence that tells a screen reader how to drag a fee with the keys. */
export const FEE_DROP_HINT_ID = 'fee-drop-hint';

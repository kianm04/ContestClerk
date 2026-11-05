import { fail, redirect } from '@sveltejs/kit';
import type { Conference } from '$lib/conferences';
import { instantFromLocalDateTime, localDateTimeInTimezone } from '$lib/dates';
import { readDroppedPlace } from '$lib/drag-order';
import {
	EMPTY_FEE_FORM,
	canAddFees,
	canTransitionInvoice,
	conferenceInvoiceTotals,
	feeInvoiceCountSentence,
	hasCollectionModeErrors,
	hasFeeErrors,
	isFeeAppliesTo,
	readCollectionModeForm,
	readFeeForm,
	validateCollectionModeForm,
	validateFeeForm,
	type CollectionModeErrors,
	type CollectionModeValues,
	type FeeFormErrors,
	type FeeFormValues,
	type ManagedFee
} from '$lib/fees';
import {
	INVOICE_ACTIONS,
	INVOICE_NOTE_MAX_LENGTH,
	INVOICE_NOTE_TOO_LONG,
	invoiceActionFlash,
	invoiceActionRefusal,
	pageOfInvoices,
	parseInvoiceQuery,
	readInvoiceNote,
	type InvoiceAction
} from '$lib/invoices';
import { feesAccess, feesTabForReader } from '$lib/fees-access';
import { chosenFeesTab } from '$lib/fees-tabs';
import { fromCents, toCents } from '$lib/money';
import type { Permission } from '$lib/permissions';
import { stepUrlAfter } from '$lib/setup-steps';
import { manageFeesTableUrl, manageFeesTabUrl } from '$lib/urls';
import { requireManagePage, requirePermission } from '$lib/server/access';
import {
	createFee,
	deleteFee,
	getFee,
	listFees,
	moveFee,
	readPaymentSettings,
	updateConferenceSettings,
	updateFee,
	type FeeInput
} from '$lib/server/fees';
import { setFlash } from '$lib/server/flash';
import { placeOrderedRow } from '$lib/server/ordered-rows';
import { getConferenceInvoice, listConferenceInvoices, settleInvoice } from '$lib/server/invoices';
import { getManagedOrganization } from '$lib/server/organizations';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/**
 * What every action on this page answers with when it refuses.
 *
 * One shape for all eight, so `+page.svelte` has a single thing to read rather
 * than a different answer per button. Each pair of `values` is `null` whenever
 * the refusal was not about that form, and the page then falls back to what
 * `load` read.
 */
type FeesPageResult = {
	/** What was typed into the fee form, or null when the refusal was not about it. */
	feeValues: FeeFormValues | null;
	feeErrors: FeeFormErrors;
	/** The same pair for the collection-mode form. */
	modeValues: CollectionModeValues | null;
	modeErrors: CollectionModeErrors;
	/** A problem with the whole page rather than one field, shown in a `Notice`. */
	message: string | null;
	/**
	 * A refused row action of the invoices table, shown in a `Notice` inside
	 * that section rather than at the top of the page, where the organiser who
	 * pressed a button far down the table would not see it.
	 */
	invoiceMessage: string | null;
};

/** What both "that fee is not here" refusals say. */
const NO_SUCH_FEE = 'That fee is not part of this conference.';

/**
 * The permission gate, asked again at the top of every action: `edit_conference`
 * for the fee list and how delegates pay, `manage_invoices` for the invoice
 * buttons (`docs/roles-and-permissions.md`, section 8).
 *
 * A form action is its own request and nothing `load` worked out reaches it, so
 * the check is made here rather than trusted from whenever the page was last
 * drawn.
 */
async function requireConference(event: RequestEvent, permission: Permission): Promise<Conference> {
	const { conference } = await requirePermission(
		event.locals,
		event.url,
		event.params.slug,
		permission
	);

	return conference;
}

/**
 * Has the organisation behind this conference finished Stripe onboarding?
 *
 * The layout reads the organisation for `load`, but an action cannot see what
 * the layout did, so it is read again here. A conference always belongs to an
 * organisation, so anything missing is a fault on our side and a plain `Error`
 * rather than something to tell the organiser about, exactly as the layout
 * treats it.
 */
async function readIsStripeConnected(
	event: RequestEvent,
	conference: Conference
): Promise<boolean> {
	const organizationSlug = conference.organizationSlug;

	if (!organizationSlug) {
		throw new Error(`The conference ${conference.slug} is not attached to an organisation.`);
	}

	const organization = await getManagedOrganization(event.locals.supabase, organizationSlug);

	if (!organization) {
		throw new Error(`The organisation ${organizationSlug} could not be read.`);
	}

	return organization.isStripeConnected;
}

/** Refuse with a message about the whole page, leaving both forms as the page last drew them. */
function refuse(message: string) {
	return fail(400, {
		feeValues: null,
		feeErrors: {},
		modeValues: null,
		modeErrors: {},
		message,
		invoiceMessage: null
	} satisfies FeesPageResult);
}

/** Refuse one of the invoice row actions, with the message shown beside the table. */
function refuseInvoiceAction(message: string) {
	return fail(400, {
		feeValues: null,
		feeErrors: {},
		modeValues: null,
		modeErrors: {},
		message: null,
		invoiceMessage: message
	} satisfies FeesPageResult);
}

/**
 * Refuse a fee that was typed wrongly.
 *
 * 400, because what arrived is wrong and only the person who sent it can put it
 * right. `fail` sends the page back with that status and this result as `form`,
 * so every field keeps what was typed and shows its own message at once.
 */
function refuseFeeForm(values: FeeFormValues, errors: FeeFormErrors) {
	return fail(400, {
		feeValues: values,
		feeErrors: errors,
		modeValues: null,
		modeErrors: {},
		message: null,
		invoiceMessage: null
	} satisfies FeesPageResult);
}

/** The same for the collection-mode form above it. */
function refuseCollectionMode(values: CollectionModeValues, errors: CollectionModeErrors) {
	return fail(400, {
		feeValues: null,
		feeErrors: {},
		modeValues: values,
		modeErrors: errors,
		message: null,
		invoiceMessage: null
	} satisfies FeesPageResult);
}

/** A moment as a `datetime-local` box holds it, or empty for a bound nobody set. */
function toLocalBox(moment: string | null, timezone: string): string {
	if (moment === null) {
		return '';
	}

	return localDateTimeInTimezone(new Date(moment), timezone);
}

/**
 * A saved fee as the form holds it: every field is text, because text is all an
 * `<input>` can carry.
 */
function toFeeFormValues(fee: ManagedFee, timezone: string): FeeFormValues {
	return {
		feeId: fee.id,
		name: fee.name,
		amount: fromCents(fee.amountCents),
		appliesTo: fee.appliesTo,
		validFrom: toLocalBox(fee.validFrom, timezone),
		validUntil: toLocalBox(fee.validUntil, timezone)
	};
}

/**
 * The form's text as the database takes it: whole cents, and the two bounds as
 * exact moments read in the conference's own timezone.
 *
 * `validateFeeForm` has already refused an amount `toCents` cannot read and an
 * "applies to" that is not one of the two, so neither fallback below can ever
 * reach the database. They are written out because TypeScript cannot see that
 * the check has already happened.
 */
function toFeeInput(values: FeeFormValues, timezone: string): FeeInput {
	return {
		name: values.name,
		amountCents: toCents(values.amount) ?? 0,
		appliesTo: isFeeAppliesTo(values.appliesTo) ? values.appliesTo : 'individual',
		validFrom: instantFromLocalDateTime(values.validFrom, timezone),
		validUntil: instantFromLocalDateTime(values.validUntil, timezone)
	};
}

/**
 * What a refused delete says, with the singular for a fee one invoice points at.
 *
 * `05-pages/organiser/fees.md` asks for the count, because "cannot be deleted"
 * on its own leaves an organiser with nowhere to go. The count is worded by the
 * same helper the fee's own row uses, so the page cannot say "1 invoices" in
 * one place and "1 invoice" in the other.
 */
function feeInUseMessage(invoiceCount: number): string {
	const invoices = feeInvoiceCountSentence(invoiceCount);

	return `This fee is used by ${invoices} and cannot be deleted. Set an end date instead.`;
}

/**
 * Where a saved payment setting goes next. While the conference is a draft
 * this page is step 4 of the setup, and the footer's "Save and continue"
 * moves on to the next step. The form's own "Save" button sends `stay`, and
 * stays, because fees can only be added once the setting is saved. Once the
 * conference is published there is no next step to go to.
 */
function pageAfterCollectionSave(conference: Conference, formData: FormData): string {
	const feesTab = manageFeesTabUrl(conference.slug, 'fees');
	const isStaying = formData.get('stay') !== null;

	if (conference.status !== 'draft' || isStaying) {
		return feesTab;
	}

	return stepUrlAfter(conference.slug, 'fees') ?? feesTab;
}

/**
 * Whether "Save and continue" on a draft arrived with nothing chosen, so the
 * action should move on to the next step rather than refuse.
 *
 * A free conference leaves this step alone, but while Stripe is not connected
 * its form still arrives with "By card" picked, which cannot be saved.
 * Refusing that would hold up a conference that charges nothing on a step
 * the header calls optional. A form that says something, typed instructions
 * or a switch away from collecting by hand, is checked as usual.
 */
async function isUntouchedDraftStep(
	event: RequestEvent,
	conference: Conference,
	formData: FormData,
	isStripeConnected: boolean
): Promise<boolean> {
	const values = readCollectionModeForm(formData);
	const isMovingOn = conference.status === 'draft' && formData.get('stay') === null;
	const isUnsavableCard = values.mode === 'stripe' && !isStripeConnected;

	if (!isMovingOn || !isUnsavableCard || values.paymentInstructions !== '') {
		return false;
	}

	const payment = await readPaymentSettings(event.locals.supabase, conference.id);

	return !payment.collectsPaymentsManually;
}

/** Which fee the form is posting about, or empty when the request did not say. */
function readFeeId(formData: FormData): string {
	return String(formData.get('feeId') ?? '');
}

/** What an invoice id that is not one of this conference's is told. */
const NO_SUCH_INVOICE = 'That invoice is not part of this conference.';

/** What the second of two organisers pressing buttons on the same row at once is told. */
const INVOICE_CHANGED_MEANWHILE =
	'Somebody changed this invoice a moment ago. Look at its status and try again.';

/**
 * The three invoice row actions, which differ only in the status they move
 * the invoice to and the words they use, both of which `INVOICE_ACTIONS` in
 * `$lib/invoices.ts` holds.
 *
 * The status the invoice is in now is read from the database rather than
 * trusted from the page, which may have been drawn an hour ago, and checked
 * against `canTransitionInvoice` so that the refusal can say in words what is
 * wrong. `check_invoice_transition` in the database enforces the same rule
 * underneath.
 *
 * It goes back to the table the organiser was looking at: the action's address
 * carries the search, the filter and the page (see `manageFeesActionUrl`), and
 * `#invoices` scrolls the browser down to the table rather than leaving it at
 * the top of the page.
 */
async function runInvoiceAction(event: RequestEvent, action: InvoiceAction) {
	const conference = await requireConference(event, 'manage_invoices');

	const formData = await event.request.formData();
	const invoiceId = String(formData.get('invoiceId') ?? '');

	if (invoiceId === '') {
		return refuseInvoiceAction('That request did not say which invoice to change.');
	}

	// The box stops typing at the limit, so only a request put together by hand
	// is ever refused here.
	const note = readInvoiceNote(formData, action);

	if (note !== null && note.length > INVOICE_NOTE_MAX_LENGTH) {
		return refuseInvoiceAction(INVOICE_NOTE_TOO_LONG);
	}

	const invoice = await getConferenceInvoice(event.locals.supabase, conference.id, invoiceId);

	if (!invoice) {
		return refuseInvoiceAction(NO_SUCH_INVOICE);
	}

	if (!canTransitionInvoice(invoice.status, INVOICE_ACTIONS[action].target)) {
		return refuseInvoiceAction(invoiceActionRefusal(invoice.status, action));
	}

	const hasMoved = await settleInvoice(event.locals.supabase, invoice, action, note, new Date());

	if (!hasMoved) {
		return refuseInvoiceAction(INVOICE_CHANGED_MEANWHILE);
	}

	setFlash(event.cookies, { tone: 'success', message: invoiceActionFlash(invoice.number, action) });

	const tableQuery = parseInvoiceQuery(event.url.searchParams);
	redirect(303, manageFeesTableUrl(event.params.slug, tableQuery));
}

/**
 * Everything the fees page draws, on top of what the layout above it has already
 * read.
 *
 * `parent()` is a promise for whatever the layout's own `load` returned: this
 * conference and the organisation running it. The layout let in anybody whose
 * permissions open some page of this conference, and handed those permissions
 * down; the first lines below answer a 404 unless they open this one.
 *
 * The conference the layout hands over is the public shape and carries neither
 * the currency nor the payment columns, which is what `readPaymentSettings` is
 * for.
 *
 * Files under `$lib/server` only ever run on the server, so the queries below
 * cannot reach the browser.
 */
export const load: PageServerLoad = async ({ parent, url, locals }) => {
	const { conference, permissions } = await parent();
	// A 404 unless the reader's permissions open this page, by the table in
	// `$lib/manage-pages.ts`.
	requireManagePage(permissions, 'fees');
	// Which half of the page this reader holds: the fee list, the invoices, or both.
	const access = feesAccess(permissions);

	// The invoices table's search, status filter, page and highlighted row, all
	// read from the address. `load` runs again whenever the address changes, so
	// every filter and pager link is an ordinary link.
	const invoiceQuery = parseInvoiceQuery(url.searchParams);

	// None of the three needs another's answer, so they run side by side.
	const [fees, payment, invoices] = await Promise.all([
		listFees(locals.supabase, conference.id),
		readPaymentSettings(locals.supabase, conference.id),
		// A reader who may not see invoices is not sent them at all.
		access.canReadInvoices ? listConferenceInvoices(locals.supabase, conference.id) : []
	]);

	/*
		`?editFee=<id>` is what turns the form under the list into an editor. An
		id that is not a fee of this conference is not an error: the form falls
		back to the empty one, so a link that has gone stale simply shows "Add
		fee" instead of a page that will not open.
	*/
	const requestedFeeId = url.searchParams.get('editFee');
	const feeBeingEdited = fees.find((fee) => fee.id === requestedFeeId) ?? null;

	return {
		/** "Fees" or "Invoices", the tab the address asks for (`$lib/fees-tabs.ts`). */
		tab: feesTabForReader(chosenFeesTab(url.searchParams, conference.status === 'draft'), access),
		/** Which of the fee list and the invoices this reader may read and change. */
		access,
		fees,
		payment,
		/** What the fee form shows: an empty form, or the fee named by `?editFee=`. */
		feeForm: feeBeingEdited ? toFeeFormValues(feeBeingEdited, conference.timezone) : EMPTY_FEE_FORM,
		/** The fee being edited, or null. It is what turns the form into "Save fee". */
		editFeeId: feeBeingEdited?.id ?? null,
		invoiceQuery,
		/** One page of the filtered invoices, rather than every invoice of the conference. */
		invoiceTable: pageOfInvoices(invoices, invoiceQuery),
		/**
			The totals of every invoice of the conference, whatever the filters and
			the page, so that they do not change as the organiser searches.
		*/
		invoiceTotals: conferenceInvoiceTotals(invoices),
		/*
			The currency the totals are in. Every invoice of one conference shares
			it, because the conference's currency is locked once the first invoice
			is raised; before then the conference's own is the one they will use.
		*/
		invoiceCurrency: invoices[0]?.currency ?? payment.currency,
		/** Whether the conference has any invoice at all, which decides the empty state. */
		hasInvoices: invoices.length > 0,
		/** How many invoices the conference has, whatever the filters, for the tab's label. */
		invoiceCount: invoices.length,
		/*
			The moment is read once here and handed down, rather than each component
			asking the clock for itself. A component that called `new Date()` would
			write one thing while the page is being rendered on the server and
			another a moment later in the browser, and Svelte reports that as a
			hydration mismatch. The team page passes `now` down for the same reason.
		*/
		now: new Date().toISOString()
	};
};

export const actions: Actions = {
	/** Choose between cards through Stripe and collecting the money outside MUNMeet. */
	saveCollectionMode: async (event) => {
		const conference = await requireConference(event, 'edit_conference');
		const isStripeConnected = await readIsStripeConnected(event, conference);

		const formData = await event.request.formData();

		// Nothing to save, so nothing to flash either: the draft simply moves on.
		if (await isUntouchedDraftStep(event, conference, formData, isStripeConnected)) {
			redirect(303, pageAfterCollectionSave(conference, formData));
		}

		const values = readCollectionModeForm(formData);
		const errors = validateCollectionModeForm(values, { isStripeConnected });

		if (hasCollectionModeErrors(errors)) {
			return refuseCollectionMode(values, errors);
		}

		/*
			Choosing Stripe leaves `payment_instructions` exactly as it was rather
			than clearing it. The box is always in the HTML and always carries what
			is saved, so an organiser who switches back to collecting by hand does
			not have to type their bank details out a second time.
		*/
		const paymentInstructions =
			values.paymentInstructions === '' ? null : values.paymentInstructions;

		await updateConferenceSettings(event.locals.supabase, conference.id, {
			collectsPaymentsManually: values.mode === 'manual',
			paymentInstructions
		});

		// A redirecting action cannot return anything, so the message travels in a
		// one-shot cookie that the root layout reads and throws away.
		setFlash(event.cookies, { tone: 'success', message: 'Payment collection saved.' });
		redirect(303, pageAfterCollectionSave(conference, formData));
	},

	/** Add one fee to the foot of the list. */
	addFee: async (event) => {
		const conference = await requireConference(event, 'edit_conference');
		const isStripeConnected = await readIsStripeConnected(event, conference);
		const payment = await readPaymentSettings(event.locals.supabase, conference.id);

		// `06-features/fees.md`: nothing may be charged until there is a way to
		// collect it, either by card or by hand.
		const isCollectionSet = canAddFees({
			isStripeConnected,
			collectsPaymentsManually: payment.collectsPaymentsManually
		});

		if (!isCollectionSet) {
			return refuse('Connect Stripe or choose manual collection before adding fees.');
		}

		const formData = await event.request.formData();
		const values = readFeeForm(formData);
		const errors = validateFeeForm(values);

		if (hasFeeErrors(errors)) {
			return refuseFeeForm(values, errors);
		}

		await createFee(event.locals.supabase, conference.id, toFeeInput(values, conference.timezone));

		// Every fee action goes back to the "Fees" tab by name, because a public
		// conference opens on its "Invoices" tab when no tab is named.
		setFlash(event.cookies, { tone: 'success', message: 'Fee added.' });
		redirect(303, manageFeesTabUrl(event.params.slug, 'fees'));
	},

	/** Save the fee the form is editing, named by its hidden `feeId`. */
	updateFee: async (event) => {
		const conference = await requireConference(event, 'edit_conference');

		const formData = await event.request.formData();
		const values = readFeeForm(formData);

		// The hidden field is only on the form while it is editing, so nothing but
		// a request put together by hand arrives without it. Asked before `getFee`,
		// because an empty id is not a fee the database can even look for.
		if (values.feeId === '') {
			return refuse('That request did not say which fee to save.');
		}

		// `getFee` asks inside this conference, so a `feeId` belonging to somebody
		// else's conference simply is not there.
		const fee = await getFee(event.locals.supabase, conference.id, values.feeId);

		if (!fee) {
			return refuse(NO_SUCH_FEE);
		}

		const errors = validateFeeForm(values);

		if (hasFeeErrors(errors)) {
			return refuseFeeForm(values, errors);
		}

		// The amount may change even while invoices point at this fee. Each invoice
		// keeps the amount it was written for, which `FeeForm` says on the screen.
		await updateFee(event.locals.supabase, fee.id, toFeeInput(values, conference.timezone));

		setFlash(event.cookies, { tone: 'success', message: 'Fee saved.' });
		redirect(303, manageFeesTabUrl(event.params.slug, 'fees'));
	},

	/**
	 * Swap one fee with the neighbour above or below it.
	 *
	 * Every row has a small form of its own carrying nothing but the fee's id,
	 * and the two arrows inside it post to `?/moveFee&direction=up` and
	 * `…&direction=down`. SvelteKit lets a form action carry a query string of
	 * its own, which is the trick the committees list uses: it means one small
	 * form per row instead of two, and it is an ordinary HTML form either way, so
	 * reordering works with JavaScript switched off.
	 */
	moveFee: async (event) => {
		const conference = await requireConference(event, 'edit_conference');

		const direction = event.url.searchParams.get('direction');

		if (direction !== 'up' && direction !== 'down') {
			// Only a request somebody put together by hand can get here: the two
			// buttons on every row always name one of the two directions.
			return refuse('A fee can only move up or down.');
		}

		const formData = await event.request.formData();
		const feeId = readFeeId(formData);

		if (feeId === '') {
			return refuse('That request did not say which fee to move.');
		}

		await moveFee(event.locals.supabase, conference.id, feeId, direction);

		// Straight back to the list with no flash: the fee has visibly changed
		// places, which says everything a message would.
		redirect(303, manageFeesTabUrl(event.params.slug, 'fees'));
	},

	/**
	 * Put one fee at the place it was dragged to (T132). The list's hidden drop
	 * form posts the fee's id and its new `place`, counting from 1. Dragging
	 * needs JavaScript, so the arrows of `moveFee` stay the way without it.
	 */
	moveFeeTo: async (event) => {
		const conference = await requireConference(event, 'edit_conference');

		const formData = await event.request.formData();
		const feeId = readFeeId(formData);
		const toIndex = readDroppedPlace(formData.get('place'));

		if (feeId === '' || toIndex === null) {
			return refuse('That request did not say which fee to move, or where.');
		}

		const isPlaced = await placeOrderedRow(
			event.locals.supabase,
			{ table: 'fees', ownerColumn: 'conference_id', ownerId: conference.id },
			feeId,
			toIndex
		);

		if (!isPlaced) {
			return refuse(NO_SUCH_FEE);
		}

		redirect(303, manageFeesTabUrl(event.params.slug, 'fees'));
	},

	/** Delete one fee, as long as no invoice points at it. */
	deleteFee: async (event) => {
		const conference = await requireConference(event, 'edit_conference');

		const formData = await event.request.formData();
		const feeId = readFeeId(formData);

		// Asked before `getFee`, for the reason `updateFee` gives above.
		if (feeId === '') {
			return refuse('That request did not say which fee to delete.');
		}

		const fee = await getFee(event.locals.supabase, conference.id, feeId);

		if (!fee) {
			return refuse(NO_SUCH_FEE);
		}

		const wasDeleted = await deleteFee(event.locals.supabase, fee.id);

		// Row Level Security refuses a fee an invoice was written from, and
		// answering `false` is how `$lib/server/fees.ts` reports that. The count
		// comes from the fee that was just read, so the message can say how many.
		if (!wasDeleted) {
			return refuse(feeInUseMessage(fee.invoiceCount));
		}

		setFlash(event.cookies, { tone: 'success', message: 'Fee deleted.' });
		redirect(303, manageFeesTabUrl(event.params.slug, 'fees'));
	},

	/** Mark an unpaid invoice paid, for money that arrived outside MUNMeet. */
	markPaid: async (event) => runInvoiceAction(event, 'markPaid'),

	/** Let a delegate off an unpaid invoice. */
	waive: async (event) => runInvoiceAction(event, 'waive'),

	/** Cancel an unpaid invoice, for example one raised by mistake. */
	void: async (event) => runInvoiceAction(event, 'void')
};

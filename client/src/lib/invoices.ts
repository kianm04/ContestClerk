/**
 * Invoices as the person who owes them reads them: the order the list puts
 * them in, the words under each one, and which payment section the invoice
 * page shows.
 *
 * Nothing in here talks to Supabase or to Svelte. `$lib/server/invoices.ts`
 * reads the rows; the rules live here so that they can be read and tested
 * without a database. The rules come from `specs/06-features/fees.md` and the
 * wording from `specs/05-pages/delegate/invoices.md` and
 * `specs/05-pages/delegate/invoice.md`.
 *
 * The organiser's own half of this topic — the filters, the rows, the three
 * row actions and the CSV of the invoices table on `/manage/[slug]/fees` — is
 * at the bottom of this same file, the way `applications.ts` holds both sides
 * of its route.
 */

import type { Database } from '$lib/database.types';
import { formatConferenceDay } from '$lib/conferences';
import { canTransitionInvoice, platformFeeTakenCents } from '$lib/fees';
import { fromCents } from '$lib/money';
import { statusLabel } from '$lib/status';

/**
 * `unpaid` | `paid` | `waived` | `refunded` | `void`.
 *
 * `applications.ts` names this same enum for the small invoice line on an
 * accepted application, for the reason the T27 decision gives about
 * `DelegationInvoiceStatus`: each file names the statuses its own pages show,
 * rather than importing one page's topic into another's.
 */
export type InvoiceStatus = Database['public']['Enums']['invoice_status'];

/**
 * How an invoice was paid: through Stripe Checkout, or by the organiser
 * marking it paid after money arrived some other way.
 */
export type InvoicePaidMethod = 'stripe' | 'manual';

/** The conference facts both invoice pages show about an invoice. */
export type InvoiceConference = {
	slug: string;
	name: string;
	logoPath: string | null;
	/** An IANA name such as `Europe/Amsterdam`. Every date of this invoice is read in it. */
	timezone: string;
};

/** One invoice of the reader's own, in the shape `/invoices` lists it. */
export type MyInvoice = {
	id: string;
	/** What the invoice calls itself, such as `DELFTMUN-2026-0031`. */
	number: string;
	/** "Delegate fee · DelftMUN 2026", written when the invoice was raised. */
	description: string;
	/** Whole cents of the invoice's currency. See the top of `$lib/money.ts`. */
	amountCents: number;
	/** A three-letter ISO 4217 code, such as `EUR`. */
	currency: string;
	status: InvoiceStatus;
	/** ISO timestamps. `dueAt` is null when the organisers set no date. */
	dueAt: string | null;
	paidAt: string | null;
	paidMethod: InvoicePaidMethod | null;
	createdAt: string;
	conference: InvoiceConference;
	/** The delegation this was raised for, and null for an invoice of one's own. */
	delegationName: string | null;
};

/** The invoice itself, in the shape `/invoices/[invoiceId]` shows it. */
export type InvoiceDetails = MyInvoice & {
	/** How many seats this invoice is for. 1 for an individual delegate's own. */
	quantity: number;
	/** What one of them cost. `quantity × unitAmountCents` is the total. */
	unitAmountCents: number;
	/** The moment the row last changed, which for a refunded invoice is when it was refunded. */
	updatedAt: string;
};

/** The seat an individual invoice was raised for, for the line that names it. */
export type InvoiceSeat = {
	seatName: string;
	committeeName: string;
	/**
	 * The seat's ISO two-letter country code, for drawing a flag. Null for a seat that is not a
	 * country, such as "Press".
	 */
	countryCode: string | null;
};

/**
 * Is this invoice past its due date and still to be paid?
 *
 * Only an `unpaid` invoice can be overdue: one that was waived or cancelled is
 * not owed at all, and a paid one was settled whenever it was settled.
 *
 * `now` is a parameter rather than read from the clock, because a pure
 * function may not read the clock and because the page holds one moment for
 * every row it draws.
 */
export function isInvoiceOverdue(
	invoice: { status: InvoiceStatus; dueAt: string | null },
	now: Date
): boolean {
	if (invoice.status !== 'unpaid' || invoice.dueAt === null) {
		return false;
	}

	return new Date(invoice.dueAt).getTime() < now.getTime();
}

/**
 * "Due 22 Jan 2027", or `null` for an invoice the organisers gave no date.
 *
 * The timezone matters for the same reason it does on a fee's window: a date
 * stored as 23:00 UTC is the next day in Amsterdam, and an invoice that said
 * "21 Jan" for a deadline the organiser set to 22 January would look like a
 * bug. `formatConferenceDay` is what writes every other date in the app.
 */
export function invoiceDueSentence(dueAt: string | null, timezone: string): string | null {
	if (dueAt === null) {
		return null;
	}

	return `Due ${formatConferenceDay(dueAt, timezone)}`;
}

/** "card", or "marked as paid by the organisers". Nothing at all when the method was not recorded. */
function paidMethodWords(paidMethod: InvoicePaidMethod | null): string | null {
	if (paidMethod === 'stripe') {
		return 'card';
	}

	if (paidMethod === 'manual') {
		return 'marked as paid by the organisers';
	}

	return null;
}

/**
 * "Paid 3 Sep 2026", with the method after it on the invoice page: "Paid
 * 3 Sep 2026 · card".
 *
 * `null` for an invoice that was never paid, so the caller draws nothing
 * rather than an empty line.
 *
 * `withMethod` is false on the list, where the row has no room for it, and
 * true on the invoice page, whose receipt line `05-pages/delegate/invoice.md`
 * asks to carry the date and the method.
 */
export function invoicePaidSentence(
	invoice: { paidAt: string | null; paidMethod: InvoicePaidMethod | null },
	timezone: string,
	withMethod: boolean
): string | null {
	if (invoice.paidAt === null) {
		return null;
	}

	const paidOn = `Paid ${formatConferenceDay(invoice.paidAt, timezone)}`;

	if (!withMethod) {
		return paidOn;
	}

	const method = paidMethodWords(invoice.paidMethod);

	if (method === null) {
		return paidOn;
	}

	return `${paidOn} · ${method}`;
}

/**
 * The one sentence the invoice page shows about a status that is not `unpaid`,
 * and `null` for an `unpaid` one, which says what it owes rather than what
 * happened to it.
 *
 * A refund has no column of its own — `06-features/fees.md` moves `paid` to
 * `refunded` and the row keeps the `paid_at` of the payment that was refunded
 * — so the day the refund was made is `updated_at`, the moment the status last
 * changed.
 *
 * The `switch` has no `default` on purpose: a status added to `invoice_status`
 * without a sentence here fails `pnpm check` rather than showing nothing.
 */
export function invoiceStateSentence(
	invoice: {
		status: InvoiceStatus;
		paidAt: string | null;
		paidMethod: InvoicePaidMethod | null;
		updatedAt: string;
	},
	timezone: string
): string | null {
	switch (invoice.status) {
		case 'unpaid':
			return null;
		case 'paid':
			return invoicePaidSentence(invoice, timezone, true) ?? 'This invoice has been paid.';
		case 'waived':
			return 'The organisers waived this invoice.';
		case 'void':
			return 'This invoice was cancelled.';
		case 'refunded':
			return `This invoice was refunded on ${formatConferenceDay(invoice.updatedAt, timezone)}.`;
	}
}

/** What a manual-collection conference is told to say when it left the box empty. */
export const NO_PAYMENT_INSTRUCTIONS = 'The organisers will tell you how to pay.';

/** What the invoice page says while card payment is not switched on yet. */
export const CARD_PAYMENT_NOT_READY =
	'Card payment is not available yet. The organisers are still setting it up.';

/** The organiser's own instructions, or the stand-in sentence when they wrote none. */
export function paymentInstructionsText(paymentInstructions: string | null): string {
	if (paymentInstructions === null || paymentInstructions.trim() === '') {
		return NO_PAYMENT_INSTRUCTIONS;
	}

	return paymentInstructions;
}

/**
 * Which payment section the invoice page shows under the summary:
 *
 * - `instructions`: the organiser's "How to pay" text, for a conference that
 *   collects payments outside MUNMeet.
 * - `card-not-ready`: `CARD_PAYMENT_NOT_READY`, for a conference that collects
 *   by card.
 * - `none`: nothing at all, because there is nothing left to pay.
 */
export type InvoicePaymentSection = 'instructions' | 'card-not-ready' | 'none';

/**
 * Which of the three sections above this invoice gets.
 *
 * **This is where a non-`unpaid` invoice is refused a way to pay.** Whether an
 * invoice can still be paid is the question this page is asking, so the answer
 * is given here, and T32's `pay` action calls this same function before it
 * talks to Stripe, so the button and the action cannot disagree. Nothing in
 * the database answers it for the browser: `set_invoice_checkout_session` may
 * no longer be called by a browser at all (security review 2026-10-10, L33),
 * and the `pay` action will write `stripe_checkout_session_id` with the
 * service role once Stripe has made the session, after asking `needsCheckout`
 * in `$lib/server/platform-fee.ts` whether the invoice needs one. The webhook
 * then finds the invoice by its own id in the session's metadata, never by the
 * stored session id.
 *
 * There is no `pay-by-card` answer yet, and that is not an omission. Nothing
 * writes `organizations.stripe_onboarding_completed_at` until T32 adds the
 * `account.updated` webhook (`02-architecture/payments.md` says that webhook is
 * its only writer), so today no conference can take a card payment and the
 * sentence above is true of every one of them. T32 adds the fourth answer, the
 * onboarding argument it needs, and `PayCard` beside it.
 */
export function invoicePaymentSection(context: {
	status: InvoiceStatus;
	collectsPaymentsManually: boolean;
}): InvoicePaymentSection {
	if (context.status !== 'unpaid') {
		return 'none';
	}

	if (context.collectsPaymentsManually) {
		return 'instructions';
	}

	return 'card-not-ready';
}

/**
 * The invoices of `/invoices` in the order that page shows them: everything
 * still to be paid first, then by due date, then the newest first.
 *
 * `05-pages/delegate/invoices.md` describes this as the query's own order, and
 * it is done here instead because "unpaid first" is an expression rather than a
 * column and PostgREST can only order by columns. Sorting a list this short in
 * TypeScript also means the rule can be read and tested on its own.
 *
 * An invoice with no due date sorts after every invoice that has one, because
 * a date nobody set should not jump the queue in front of one that was.
 *
 * The list is copied before it is sorted, so the caller's array is left alone.
 */
export function sortMyInvoices(invoices: MyInvoice[]): MyInvoice[] {
	return [...invoices].sort(compareMyInvoices);
}

/** What `sortMyInvoices` compares two invoices by, in the three steps above. */
function compareMyInvoices(first: MyInvoice, second: MyInvoice): number {
	const firstIsUnpaid = first.status === 'unpaid';
	const secondIsUnpaid = second.status === 'unpaid';

	if (firstIsUnpaid !== secondIsUnpaid) {
		return firstIsUnpaid ? -1 : 1;
	}

	// A missing due date sorts last. An ISO timestamp sorts the same as the
	// moment it names, so the dates are compared as text and none is parsed.
	const firstDue = first.dueAt ?? '';
	const secondDue = second.dueAt ?? '';

	if (firstDue !== secondDue) {
		if (firstDue === '') {
			return 1;
		}

		if (secondDue === '') {
			return -1;
		}

		return firstDue < secondDue ? -1 : 1;
	}

	// The newest first, which is the other way round from the two above.
	if (first.createdAt !== second.createdAt) {
		return first.createdAt < second.createdAt ? 1 : -1;
	}

	return 0;
}

/*
 * Everything below is the organiser's half: the invoices table on
 * `/manage/[slug]/fees`, what its URL may ask for, the three buttons on each
 * row, and the same rows written out as a spreadsheet.
 *
 * The wording comes from `specs/05-pages/organiser/fees.md`, and which status
 * may follow which from `canTransitionInvoice` in `$lib/fees.ts`.
 */

/** How many invoices fit on one page of the organiser's table. */
export const INVOICES_PAGE_SIZE = 25;

/** The longest note "Mark as paid" and "Waive" accept, matching the box in their dialog. */
export const INVOICE_NOTE_MAX_LENGTH = 200;

/**
 * The five statuses in the order the status filter lists them: what is still
 * owed first, then the two ways it was settled, then the two ways it ended.
 */
export const INVOICE_STATUS_FILTERS: InvoiceStatus[] = [
	'unpaid',
	'paid',
	'waived',
	'refunded',
	'void'
];

/** Is this text one of the five statuses? Used to ignore anything else typed into the URL. */
function isInvoiceStatus(text: string): text is InvoiceStatus {
	return INVOICE_STATUS_FILTERS.some((status) => status === text);
}

/**
 * The status filter's options, "Any status" first.
 *
 * The words come from `$lib/status`, so the filter and the badge on each row
 * cannot disagree about what `void` is called.
 */
export function invoiceStatusOptions(): { value: string; label: string }[] {
	const statuses = INVOICE_STATUS_FILTERS.map((status) => ({
		value: status,
		label: statusLabel('invoice_status', status)
	}));

	return [{ value: '', label: 'Any status' }, ...statuses];
}

/** Everything the invoices table reads out of the URL. */
export type InvoiceListQuery = {
	/** Text over the payer's name, the delegation's name and the invoice number. */
	q: string;
	/** One status, or '' for all of them. */
	status: InvoiceStatus | '';
	/** 1-based. */
	page: number;
	/**
	 * The invoice another page linked to, which the table highlights and shows
	 * first, or '' for none. Pages such as the delegation review link here with
	 * `manageFeesInvoiceUrl` in `$lib/urls.ts`.
	 */
	invoice: string;
};

/** The table as it opens: every invoice, first page, nothing highlighted. */
export const EMPTY_INVOICE_LIST_QUERY: InvoiceListQuery = {
	q: '',
	status: '',
	page: 1,
	invoice: ''
};

/** Fall back to the first page for anything that is not a whole number above zero. */
function readInvoicePage(value: string | null): number {
	const page = Number(value);

	return Number.isInteger(page) && page > 0 ? page : 1;
}

/**
 * Turn `?q=kowalska&status=unpaid&page=2` into an `InvoiceListQuery`.
 *
 * Takes the parameters rather than the whole URL, the way
 * `parseApplicationListQuery` in `$lib/applications.ts` does. Anything
 * unreadable falls back to its default, because the address is only text
 * somebody could have typed. The highlighted invoice is not checked here: this
 * file knows no invoices, and an id that is not one of this conference's simply
 * highlights nothing.
 */
export function parseInvoiceQuery(params: URLSearchParams): InvoiceListQuery {
	const status = params.get('status')?.trim() ?? '';

	return {
		q: params.get('q')?.trim() ?? '',
		status: isInvoiceStatus(status) ? status : '',
		page: readInvoicePage(params.get('page')),
		invoice: params.get('invoice')?.trim() ?? ''
	};
}

/** One row of the organiser's invoices table. */
export type OrganiserInvoiceRow = {
	id: string;
	number: string;
	/** The payer's name, or "Deleted account" once they closed it. */
	payerName: string;
	/** Null once the payer closed their account. The CSV looks their email up by it. */
	payerUserId: string | null;
	/** The delegation a group invoice was raised against, and null for an individual one. */
	delegationName: string | null;
	/** "UNSC · France" for an individual delegate's invoice, otherwise null. */
	seatLabel: string | null;
	description: string;
	quantity: number;
	/** Whole cents, like every amount here. See the top of `$lib/money.ts`. */
	unitAmountCents: number;
	amountCents: number;
	currency: string;
	/** MUNMeet's cut, which is only ever charged on a card payment. */
	platformFeeCents: number;
	status: InvoiceStatus;
	/** ISO timestamps. */
	paidAt: string | null;
	paidMethod: InvoicePaidMethod | null;
	createdAt: string;
	/** What the organisers wrote when they marked it paid or waived it. */
	note: string | null;
};

/** What the table calls a payer whose account no longer exists. */
export const DELETED_PAYER_NAME = 'Deleted account';

/**
 * Does this row match what the organiser typed in the search box?
 *
 * It looks at the payer's name, the delegation's name and the invoice number,
 * the three things `05-pages/organiser/fees.md` names, and ignores upper and
 * lower case. An empty search matches everything.
 */
export function matchesInvoiceSearch(invoice: OrganiserInvoiceRow, search: string): boolean {
	const needle = search.trim().toLowerCase();

	if (needle === '') {
		return true;
	}

	const haystacks = [invoice.payerName, invoice.delegationName ?? '', invoice.number];

	return haystacks.some((text) => text.toLowerCase().includes(needle));
}

/**
 * The invoices the search and the status filter leave. The page number and the
 * highlighted invoice play no part: this is the whole filtered list, which the
 * table pages through and the CSV writes out in full.
 */
export function filterInvoices(
	invoices: OrganiserInvoiceRow[],
	query: InvoiceListQuery
): OrganiserInvoiceRow[] {
	return invoices.filter((invoice) => {
		const hasStatus = query.status === '' || invoice.status === query.status;

		return hasStatus && matchesInvoiceSearch(invoice, query.q);
	});
}

/** One page of the invoices table, and what the pager needs to know about the rest. */
export type InvoiceTablePage = {
	rows: OrganiserInvoiceRow[];
	/** How many invoices the filters leave, across every page. */
	matchingCount: number;
	/** At least 1, so the pager always has a page to be on. */
	pageCount: number;
	/** The invoice the URL asked to highlight, when it is one of this conference's, or null. */
	highlightedId: string | null;
};

/**
 * The page of the table the URL asks for.
 *
 * `invoices` is every invoice of the conference, newest first. The filters are
 * applied to them here and the result cut into pages of `INVOICES_PAGE_SIZE`.
 *
 * A highlighted invoice that is not on this page is put first, on top of the
 * page's own rows, because `05-pages/organiser/fees.md` asks for a link from
 * another page to land on the invoice it names whatever page or filter the
 * table is on. It is looked for among every invoice rather than only the
 * filtered ones for the same reason. An id that is not one of this
 * conference's highlights nothing.
 */
export function pageOfInvoices(
	invoices: OrganiserInvoiceRow[],
	query: InvoiceListQuery
): InvoiceTablePage {
	const matching = filterInvoices(invoices, query);
	const pageCount = Math.max(1, Math.ceil(matching.length / INVOICES_PAGE_SIZE));
	const firstIndex = (query.page - 1) * INVOICES_PAGE_SIZE;
	const rows = matching.slice(firstIndex, firstIndex + INVOICES_PAGE_SIZE);

	const highlighted = invoices.find((invoice) => invoice.id === query.invoice);

	if (!highlighted) {
		return { rows, matchingCount: matching.length, pageCount, highlightedId: null };
	}

	const isOnThisPage = rows.some((invoice) => invoice.id === highlighted.id);
	const rowsWithHighlight = isOnThisPage ? rows : [highlighted, ...rows];

	return {
		rows: rowsWithHighlight,
		matchingCount: matching.length,
		pageCount,
		highlightedId: highlighted.id
	};
}

/**
 * "Card" or "Manual", the method column of the table and of the CSV. An
 * invoice nobody has paid has no method, and gets ''.
 */
export function invoicePaidMethodLabel(paidMethod: InvoicePaidMethod | null): string {
	if (paidMethod === 'stripe') {
		return 'Card';
	}

	if (paidMethod === 'manual') {
		return 'Manual';
	}

	return '';
}

/**
 * The three things an organiser can do to an invoice from this table. A refund
 * is the fourth in the page spec, and is T68's, because it needs Stripe.
 */
export type InvoiceAction = 'markPaid' | 'waive' | 'void';

/** Everything the page and the action need to say about one of the three. */
type InvoiceActionWords = {
	/** The status the invoice moves to. */
	target: InvoiceStatus;
	/** The button on the row. */
	label: string;
	/** The question at the top of its confirmation dialog. */
	confirmTitle: string;
	/** The sentence under it. */
	confirmText: string;
	/** "marked as paid", for the success flash and the refusal. */
	doneWords: string;
	/** Whether the dialog has a note box. `05-pages/organiser/fees.md` gives one to two of the three. */
	takesNote: boolean;
};

/**
 * The three actions in the order the row shows them, and the words of each.
 *
 * Written out as one record, rather than three `switch` statements, so that the
 * button, the dialog, the flash and the refusal of one action sit side by side.
 */
export const INVOICE_ACTIONS: Record<InvoiceAction, InvoiceActionWords> = {
	markPaid: {
		target: 'paid',
		label: 'Mark as paid',
		confirmTitle: 'Mark this invoice as paid?',
		confirmText: 'Do this once the money has arrived. The delegate will see the invoice as paid.',
		doneWords: 'marked as paid',
		takesNote: true
	},
	waive: {
		target: 'waived',
		label: 'Waive',
		confirmTitle: 'Waive this invoice?',
		confirmText: 'The delegate will no longer owe anything on it. This cannot be undone.',
		doneWords: 'waived',
		takesNote: true
	},
	void: {
		target: 'void',
		label: 'Void',
		confirmTitle: 'Void this invoice?',
		confirmText: 'The invoice will be cancelled, for example because it was raised by mistake.',
		doneWords: 'voided',
		takesNote: false
	}
};

/** The order the buttons appear in on a row. */
const INVOICE_ACTION_ORDER: InvoiceAction[] = ['markPaid', 'waive', 'void'];

/**
 * The actions an invoice in this status can take, in the row's order.
 *
 * Only an `unpaid` invoice has any today: `canTransitionInvoice` lets `paid`
 * go on to `refunded` alone, and a refund is not one of these three.
 */
export function availableInvoiceActions(status: InvoiceStatus): InvoiceAction[] {
	return INVOICE_ACTION_ORDER.filter((action) =>
		canTransitionInvoice(status, INVOICE_ACTIONS[action].target)
	);
}

/**
 * "This invoice is paid and cannot be waived.", the answer to an action its
 * status does not allow.
 *
 * The status is named the way the badge names it, so a `void` invoice "is
 * cancelled" here as it is everywhere else.
 */
export function invoiceActionRefusal(status: InvoiceStatus, action: InvoiceAction): string {
	const statusWord = statusLabel('invoice_status', status).toLowerCase();

	return `This invoice is ${statusWord} and cannot be ${INVOICE_ACTIONS[action].doneWords}.`;
}

/** "Invoice ROTTERDAMMUN-2026-0001 marked as paid.", the flash after a change. */
export function invoiceActionFlash(invoiceNumber: string, action: InvoiceAction): string {
	return `Invoice ${invoiceNumber} ${INVOICE_ACTIONS[action].doneWords}.`;
}

/**
 * The note typed into a dialog, trimmed, or `null` when the box was empty or
 * the action takes no note.
 */
export function readInvoiceNote(formData: FormData, action: InvoiceAction): string | null {
	if (!INVOICE_ACTIONS[action].takesNote) {
		return null;
	}

	const note = String(formData.get('note') ?? '').trim();

	return note === '' ? null : note;
}

/** What a note that is too long is told. The box stops typing at the limit, so only a hand-made post sees it. */
export const INVOICE_NOTE_TOO_LONG = `Please keep the note to ${INVOICE_NOTE_MAX_LENGTH} characters or fewer.`;

/** One invoice as the CSV writes it: its table row, and the payer's email beside it. */
export type InvoiceExportRow = OrganiserInvoiceRow & {
	/** Null when the payer's details could not be read, or their account is gone. */
	payerEmail: string | null;
};

/** The platform fee as the CSV writes it: the amount when one was taken, otherwise ''. */
function platformFeeCell(invoice: InvoiceExportRow): string {
	const feeCents = platformFeeTakenCents(invoice);

	return feeCents === null ? '' : fromCents(feeCents);
}

/** The first row of the CSV, in the order `05-pages/organiser/fees.md` lists the columns. */
const INVOICE_CSV_HEADINGS = [
	'Number',
	'Payer name',
	'Payer email',
	'Delegation',
	'Description',
	'Quantity',
	'Unit amount',
	'Amount',
	'Currency',
	'Platform fee',
	'Status',
	'Paid at',
	'Method',
	'Note'
];

/**
 * The whole export as a table of cells, the first row the headings.
 *
 * Amounts are written as plain numbers such as `65.00`, with the currency in a
 * column of its own, so that a spreadsheet can add them up. An empty cell is
 * '', never the word "null". Turning the cells into text is `toCsvText` in
 * `$lib/csv.ts`.
 */
export function invoiceCsvRows(invoices: InvoiceExportRow[]): string[][] {
	const rows = invoices.map((invoice) => [
		invoice.number,
		invoice.payerName,
		invoice.payerEmail ?? '',
		invoice.delegationName ?? '',
		invoice.description,
		String(invoice.quantity),
		fromCents(invoice.unitAmountCents),
		fromCents(invoice.amountCents),
		invoice.currency,
		platformFeeCell(invoice),
		statusLabel('invoice_status', invoice.status),
		invoice.paidAt ?? '',
		invoicePaidMethodLabel(invoice.paidMethod),
		invoice.note ?? ''
	]);

	return [INVOICE_CSV_HEADINGS, ...rows];
}

/**
 * What the download is called: `rotterdammun-2026-invoices-2026-09-22.csv`, the
 * name `05-pages/organiser/fees.md` gives it.
 *
 * `day` is `YYYY-MM-DD` in the conference's own timezone, as for the
 * applications export.
 */
export function invoicesCsvFileName(conferenceSlug: string, day: string): string {
	return `${conferenceSlug}-invoices-${day}.csv`;
}

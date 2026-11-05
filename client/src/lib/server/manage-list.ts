/**
 * The figures and the setup steps the rows of `/manage` are drawn from (the
 * manage redesign): how many applications, seats and paid fees each
 * conference has, and which drafts have somebody on their team.
 *
 * Files under `$lib/server` only ever run on the server. `loadManageIndex` in
 * `./manage.ts` calls these once it knows the reader's conferences, and every
 * function here asks one question about all of those conferences at once, so
 * an organiser with six conferences costs no more requests than one with one.
 * `$lib/manage-list-row.ts` turns the answers into the words of each row.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Conference } from '$lib/conferences';
import type { ConferenceFigures } from '$lib/manage';
import { publishChecklist, type PublishChecklistCounts } from '$lib/publish-checklist';
import { setupProgressFromChecklist, type SetupProgress } from '$lib/setup-steps';

/** One sent application, read only for its conference and whether it waits for a decision. */
type ApplicationRow = {
	conference_id: string;
	status: string;
};

/**
 * One seat on offer. `committees(...)` brings along the conference of the
 * committee it is in, because a seat carries no conference of its own.
 */
type SeatRow = {
	user_id: string | null;
	delegation_id: string | null;
	committees: { conference_id: string } | null;
};

/** One paid invoice, read only for its conference and its amount. */
type PaidInvoiceRow = {
	conference_id: string;
	amount_cents: number;
};

/** One conference, read only for its currency, which `Conference` does not carry. */
type CurrencyRow = {
	id: string;
	currency: string;
};

/** Throws with a readable message when a query failed, as every lookup here does. */
function throwIfFailed(error: { message: string } | null, what: string): void {
	// A failed query means a bug (a wrong column name, a missing policy), not
	// something the organiser can fix, so it shows the error page.
	if (error) {
		throw new Error(`Could not read ${what}: ${error.message}`);
	}
}

/** Every application of these conferences that has been sent. */
async function readSentApplications(
	supabase: SupabaseClient,
	conferenceIds: string[]
): Promise<ApplicationRow[]> {
	const { data, error } = await supabase
		.from('applications')
		.select('conference_id, status')
		.in('conference_id', conferenceIds)
		// A draft has not been sent to anybody yet, so it is not counted.
		.neq('status', 'draft')
		.overrideTypes<ApplicationRow[], { merge: false }>();

	throwIfFailed(error, "your conferences' applications");

	return data ?? [];
}

/**
 * Every seat on offer in these conferences, with who holds it.
 *
 * Exported for the home page: `loadHomeDashboard` in `./home.ts` counts the
 * seats held at the conference an organiser is shown first, and asking the
 * same question the same way keeps its figure and the `/manage` row equal.
 */
export async function readSeatsOnOffer(
	supabase: SupabaseClient,
	conferenceIds: string[]
): Promise<SeatRow[]> {
	// `committees!inner` is an inner join: it keeps only the seats whose
	// committee matches the filter on the next line.
	const { data, error } = await supabase
		.from('seats')
		.select('user_id, delegation_id, committees!inner(conference_id)')
		.in('committees.conference_id', conferenceIds)
		.eq('is_available', true)
		.overrideTypes<SeatRow[], { merge: false }>();

	throwIfFailed(error, "your conferences' seats");

	return data ?? [];
}

/** Every paid invoice of these conferences. */
async function readPaidInvoices(
	supabase: SupabaseClient,
	conferenceIds: string[]
): Promise<PaidInvoiceRow[]> {
	const { data, error } = await supabase
		.from('invoices')
		.select('conference_id, amount_cents')
		.in('conference_id', conferenceIds)
		.eq('status', 'paid')
		.overrideTypes<PaidInvoiceRow[], { merge: false }>();

	throwIfFailed(error, "your conferences' invoices");

	return data ?? [];
}

/** The currency of each of these conferences. */
async function readCurrencies(
	supabase: SupabaseClient,
	conferenceIds: string[]
): Promise<CurrencyRow[]> {
	const { data, error } = await supabase
		.from('conferences')
		.select('id, currency')
		.in('id', conferenceIds)
		.overrideTypes<CurrencyRow[], { merge: false }>();

	throwIfFailed(error, "your conferences' currencies");

	return data ?? [];
}

/** The figures of one conference, counted from the rows of all of them. */
function figuresOf(
	conferenceId: string,
	applications: ApplicationRow[],
	seats: SeatRow[],
	invoices: PaidInvoiceRow[] | null,
	currencies: CurrencyRow[]
): ConferenceFigures {
	const theirApplications = applications.filter((row) => row.conference_id === conferenceId);
	const toReview = theirApplications.filter((row) => row.status === 'submitted');
	const theirSeats = seats.filter((row) => row.committees?.conference_id === conferenceId);
	// A seat is held once somebody sits in it or a delegation is keeping it.
	const heldSeats = theirSeats.filter((row) => row.user_id !== null || row.delegation_id !== null);
	const currencyRow = currencies.find((row) => row.id === conferenceId);

	// `null` invoices were not read: the reader may not, and a sum of nought would be wrong.
	let feesPaidCents: number | null = null;

	if (invoices !== null) {
		feesPaidCents = 0;

		for (const invoice of invoices.filter((row) => row.conference_id === conferenceId)) {
			feesPaidCents += invoice.amount_cents;
		}
	}

	return {
		applicationCount: theirApplications.length,
		toReviewCount: toReview.length,
		seatCount: theirSeats.length,
		heldSeatCount: heldSeats.length,
		feesPaidCents,
		// The column has a default, so a missing row means the conference itself
		// could not be read. Euros are that default.
		currency: currencyRow?.currency ?? 'EUR'
	};
}

/**
 * The figures of each of these conferences, as `{ [conferenceId]: figures }`.
 *
 * Four questions, one about each kind of row, sent at once. The invoices are
 * asked about only for the conferences in `invoiceReaderIds`, where the reader
 * holds `read_invoices` or `manage_invoices`; the others get no fees figure.
 */
export async function readConferenceFigures(
	supabase: SupabaseClient,
	conferenceIds: string[],
	invoiceReaderIds: Set<string>
): Promise<Record<string, ConferenceFigures>> {
	// An empty list would have to be written as `in.()`, which PostgREST
	// refuses, and there is nothing to count anyway.
	if (conferenceIds.length === 0) {
		return {};
	}

	const invoiceConferenceIds = conferenceIds.filter((id) => invoiceReaderIds.has(id));

	const [applications, seats, invoices, currencies] = await Promise.all([
		readSentApplications(supabase, conferenceIds),
		readSeatsOnOffer(supabase, conferenceIds),
		invoiceConferenceIds.length === 0 ? [] : readPaidInvoices(supabase, invoiceConferenceIds),
		readCurrencies(supabase, conferenceIds)
	]);

	const figures: Record<string, ConferenceFigures> = {};

	for (const conferenceId of conferenceIds) {
		const readableInvoices = invoiceReaderIds.has(conferenceId) ? invoices : null;

		figures[conferenceId] = figuresOf(
			conferenceId,
			applications,
			seats,
			readableInvoices,
			currencies
		);
	}

	return figures;
}

/**
 * The ids of those of these conferences that have somebody on their team or
 * somebody invited to it, which is what ticks a draft's Team step.
 * `loadSetupProgress` in `./manage-layout.ts` asks the same about one conference.
 */
export async function readConferenceIdsWithTeam(
	supabase: SupabaseClient,
	conferenceIds: string[]
): Promise<Set<string>> {
	if (conferenceIds.length === 0) {
		return new Set();
	}

	const [staff, invites] = await Promise.all([
		supabase.from('conference_staff').select('conference_id').in('conference_id', conferenceIds),
		supabase.from('invites').select('conference_id').in('conference_id', conferenceIds)
	]);

	throwIfFailed(staff.error, 'the teams of your drafts');
	throwIfFailed(invites.error, 'the invitations to your drafts');

	const rows: { conference_id: string | null }[] = [...(staff.data ?? []), ...(invites.data ?? [])];
	const ids = new Set<string>();

	for (const row of rows) {
		if (row.conference_id !== null) {
			ids.add(row.conference_id);
		}
	}

	return ids;
}

/**
 * Which setup steps a draft has done, worked out the way the management
 * sidebar does (`loadSetupProgress` in `./manage-layout.ts`), so that the row
 * and the sidebar never disagree. `null` for a conference that is not a draft.
 *
 * `counts` is what `readChecklistCounts` in `./manage.ts` read for it, or
 * `undefined` when it has no entry, which ticks nothing.
 */
export function draftSetupProgress(
	conference: Conference,
	counts: Omit<PublishChecklistCounts, 'isStripeConnected'> | undefined,
	hasTeam: boolean,
	now: Date
): SetupProgress | null {
	if (conference.status !== 'draft') {
		return null;
	}

	if (counts === undefined) {
		return setupProgressFromChecklist([], hasTeam);
	}

	// Stripe is only ever recommended, so it ticks no step either way.
	const lines = publishChecklist(conference, { ...counts, isStripeConnected: false }, now);

	return setupProgressFromChecklist(lines, hasTeam);
}

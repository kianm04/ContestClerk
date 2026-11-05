/**
 * Where the payer's two invoice pages get their data: the list at `/invoices`
 * and the one invoice at `/invoices/[invoiceId]`.
 *
 * Files under `$lib/server` only ever run on the server, so this is where the
 * database is queried. Every function takes the Supabase client as its first
 * argument. Pages pass in `locals.supabase`, the client that knows who is
 * signed in, so the database's Row Level Security rules (see
 * `specs/02-architecture/permissions.md`) decide what each caller may read.
 *
 * Both functions take the reader's own id and use it in the question, rather
 * than leaving the answer to Row Level Security alone. The `invoices` select
 * policies are "payer; head for the delegation's invoices; org.", so an
 * organiser of the conference really can read the row — and
 * `05-pages/delegate/invoice.md` says an organiser gets a 404 here and uses
 * the fees page instead. These are the payer's pages, so they ask the payer's
 * question.
 *
 * The organiser's own invoices table on `/manage/[slug]/fees`, its CSV and
 * the status changes it makes are at the bottom of this same file. Those ask
 * the organiser's question instead: every invoice of one conference.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { readPrivateDetails } from './private-details';
import {
	DELETED_PAYER_NAME,
	INVOICE_ACTIONS,
	type InvoiceAction,
	type InvoiceConference,
	type InvoiceDetails,
	type InvoiceExportRow,
	type InvoicePaidMethod,
	type InvoiceSeat,
	type InvoiceStatus,
	type MyInvoice,
	type OrganiserInvoiceRow
} from '$lib/invoices';

/** The conference columns both pages read, under the database's own names. */
type ConferenceRow = {
	slug: string;
	name: string;
	logo_path: string | null;
	timezone: string;
};

/** One row of the list query, under the database's own names. */
type MyInvoiceRow = {
	id: string;
	number: string;
	description: string;
	amount_cents: number;
	currency: string;
	status: InvoiceStatus;
	due_at: string | null;
	paid_at: string | null;
	paid_method: InvoicePaidMethod | null;
	created_at: string;
	conferences: ConferenceRow;
	delegations: { name: string } | null;
};

/** Turn a conference as the database names it into the shape the pages read. */
function toInvoiceConference(row: ConferenceRow): InvoiceConference {
	return {
		slug: row.slug,
		name: row.name,
		logoPath: row.logo_path,
		timezone: row.timezone
	};
}

/**
 * The delegations this person is a head of.
 *
 * The list query below needs them because a head reads their delegation's
 * invoices as well as their own, and PostgREST cannot ask the database's
 * `is_delegation_head` function inside a filter. Row Level Security would let
 * those rows through by itself; this list is what keeps the *organiser's*
 * invoices, which the same policies also allow, off a page that is not theirs.
 */
async function listDelegationIdsIHead(supabase: SupabaseClient, userId: string): Promise<string[]> {
	const { data, error } = await supabase
		.from('delegation_members')
		.select('delegation_id')
		.eq('user_id', userId)
		.eq('role', 'head')
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<{ delegation_id: string }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the delegations you head: ${error.message}`);
	}

	return (data ?? []).map((row) => row.delegation_id);
}

/** The columns `/invoices` selects for each row of its list. */
const MY_INVOICE_COLUMNS =
	'id, number, description, amount_cents, currency, status, due_at, paid_at, paid_method, created_at, conferences!inner(slug, name, logo_path, timezone), delegations(name)';

/**
 * Every invoice this person pays for: their own, and the ones raised against a
 * delegation they head.
 *
 * The rows come back in no particular order; `sortMyInvoices` in
 * `$lib/invoices.ts` puts them in the order the page shows them, because
 * "unpaid first" is an expression rather than a column and PostgREST can only
 * order by columns.
 *
 * Somebody who heads no delegation is asked the simpler of the two questions.
 * PostgREST's `in.()` has no way to write an empty list, so a person with no
 * delegations would otherwise make a filter that cannot be parsed.
 */
export async function listMyInvoices(
	supabase: SupabaseClient,
	userId: string
): Promise<MyInvoice[]> {
	const delegationIds = await listDelegationIdsIHead(supabase, userId);

	const query = supabase.from('invoices').select(MY_INVOICE_COLUMNS);

	if (delegationIds.length === 0) {
		query.eq('payer_user_id', userId);
	} else {
		// `or` takes one string of PostgREST filters: "mine, or one of these
		// delegations'". The ids are uuids from the database, so there is nothing
		// in them that could end the list early.
		query.or(`payer_user_id.eq.${userId},delegation_id.in.(${delegationIds.join(',')})`);
	}

	const { data, error } = await query.overrideTypes<MyInvoiceRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read your invoices: ${error.message}`);
	}

	return (data ?? []).map((row) => ({
		id: row.id,
		number: row.number,
		description: row.description,
		amountCents: row.amount_cents,
		currency: row.currency,
		status: row.status,
		dueAt: row.due_at,
		paidAt: row.paid_at,
		paidMethod: row.paid_method,
		createdAt: row.created_at,
		conference: toInvoiceConference(row.conferences),
		delegationName: row.delegations?.name ?? null
	}));
}

/*
	`InvoiceDetails` and `InvoiceSeat` are in `$lib/invoices.ts` beside `MyInvoice`,
	and not here, because a component may not import from `$lib/server` — not even
	a type, which `pnpm house-rules` checks — and `InvoiceSummary.svelte` is typed
	by both.
*/

/** Everything `/invoices/[invoiceId]` reads in one query. */
export type InvoicePage = {
	invoice: InvoiceDetails;
	/** Whether this conference collects its money outside MUNMeet. */
	collectsPaymentsManually: boolean;
	/** What the organiser tells a delegate to do when it does. */
	paymentInstructions: string | null;
	/** The organisation behind the conference, named on the summary. */
	organisationName: string;
	seat: InvoiceSeat | null;
};

/** The one-invoice query's row, under the database's own names. */
type InvoicePageRow = MyInvoiceRow & {
	payer_user_id: string | null;
	delegation_id: string | null;
	quantity: number;
	unit_amount_cents: number;
	updated_at: string;
	conferences: ConferenceRow & {
		collects_payments_manually: boolean;
		payment_instructions: string | null;
		organizations: { name: string };
	};
	seats: {
		name: string;
		/**
		 * An ISO two-letter country code, or `null` for a seat that is not a country, such as
		 * "Press".
		 */
		country_code: string | null;
		committees: { name: string } | null;
	} | null;
};

/**
 * The columns the one-invoice query selects. It is written out in full rather
 * than built on `MY_INVOICE_COLUMNS` above, because naming `conferences` twice
 * in one select gives PostgREST two embedded resources with the same name.
 */
const INVOICE_PAGE_COLUMNS =
	'id, number, description, amount_cents, currency, status, due_at, paid_at, paid_method, created_at, payer_user_id, delegation_id, quantity, unit_amount_cents, updated_at, conferences!inner(slug, name, logo_path, timezone, collects_payments_manually, payment_instructions, organizations!inner(name)), delegations(name), seats(name, country_code, committees(name))';

/**
 * May this person open this invoice? The payer may, and so may a head of the
 * delegation it was raised against. Nobody else, which includes the organisers
 * of the conference, whose own page is `/manage/[slug]/fees`.
 *
 * The payer is answered without asking the database a second time, which is
 * every individual invoice.
 */
async function mayReadInvoice(
	supabase: SupabaseClient,
	invoice: { payer_user_id: string | null; delegation_id: string | null },
	userId: string
): Promise<boolean> {
	if (invoice.payer_user_id === userId) {
		return true;
	}

	if (invoice.delegation_id === null) {
		return false;
	}

	const delegationIds = await listDelegationIdsIHead(supabase, userId);

	return delegationIds.includes(invoice.delegation_id);
}

/**
 * One invoice with everything its page draws, or `null` when there is no such
 * invoice and when it is not this reader's to see.
 *
 * "Not this reader's" is asked here rather than left to the policies, for the
 * reason at the top of this file: the organiser of the conference can read the
 * row, and this page answers them 404.
 *
 * The seat comes with its committee so the summary can say "France, UNSC".
 * Only an individual invoice carries a seat; a group one carries the
 * delegation instead, which `invoices_one_subject` in migration 0007 enforces.
 */
export async function getInvoice(
	supabase: SupabaseClient,
	invoiceId: string,
	userId: string
): Promise<InvoicePage | null> {
	const { data, error } = await supabase
		.from('invoices')
		.select(INVOICE_PAGE_COLUMNS)
		.eq('id', invoiceId)
		// `maybeSingle` returns one row, or `null` when nothing matches, instead of a list.
		.maybeSingle()
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<InvoicePageRow, { merge: false }>();

	// A malformed id is refused by Postgres rather than simply not found. It can
	// only come from an address somebody typed or edited by hand, and it names
	// nothing, so the page answers 404 like any other id it cannot find.
	if (error?.code === INVALID_TEXT_CODE) {
		return null;
	}

	if (error) {
		throw new Error(`Could not read the invoice: ${error.message}`);
	}

	if (!data) {
		return null;
	}

	if (!(await mayReadInvoice(supabase, data, userId))) {
		return null;
	}

	const conference = data.conferences;

	return {
		invoice: {
			id: data.id,
			number: data.number,
			description: data.description,
			amountCents: data.amount_cents,
			currency: data.currency,
			status: data.status,
			dueAt: data.due_at,
			paidAt: data.paid_at,
			paidMethod: data.paid_method,
			createdAt: data.created_at,
			conference: toInvoiceConference(conference),
			delegationName: data.delegations?.name ?? null,
			quantity: data.quantity,
			unitAmountCents: data.unit_amount_cents,
			updatedAt: data.updated_at
		},
		collectsPaymentsManually: conference.collects_payments_manually,
		paymentInstructions: conference.payment_instructions,
		organisationName: conference.organizations.name,
		seat: toInvoiceSeat(data.seats)
	};
}

/** The seat line, and `null` for a group invoice or a seat the reader may not read. */
function toInvoiceSeat(seats: InvoicePageRow['seats']): InvoiceSeat | null {
	if (!seats || !seats.committees) {
		return null;
	}

	return {
		seatName: seats.name,
		committeeName: seats.committees.name,
		countryCode: seats.country_code
	};
}

/*
 * Everything below is the organiser's half, for `/manage/[slug]/fees`.
 *
 * The select policy "payer; head for the delegation's invoices; org." is what
 * lets an organiser read every invoice of their conference, and the update
 * policy "Organisers can settle an invoice" what lets them change one. The
 * database also decides which columns and which statuses they may write
 * (`protect_invoice_columns`) and which status may follow which
 * (`check_invoice_transition`), so a request put together by hand cannot do
 * more than the buttons can.
 */

/** How many invoices one query of the full list asks for. See `listConferenceInvoices`. */
const INVOICE_READ_BATCH_SIZE = 500;

/**
 * How many ids one `.in(...)` lookup asks about at a time. A hundred uuids is
 * about four kilobytes of address, which nothing objects to; every invoice in
 * one request would not be.
 */
const ID_LOOKUP_BATCH_SIZE = 100;

/** The error code Supabase sends when a window starts past the last row. */
const PAGE_OUT_OF_RANGE_CODE = 'PGRST103';

/** The error code Postgres sends when an id is not a uuid at all. */
const INVALID_TEXT_CODE = '22P02';

/** One invoice as the organiser's query gets it back, under the database's own names. */
type OrganiserInvoiceQueryRow = {
	id: string;
	number: string;
	payer_user_id: string | null;
	description: string;
	quantity: number;
	unit_amount_cents: number;
	amount_cents: number;
	currency: string;
	platform_fee_cents: number;
	status: InvoiceStatus;
	paid_at: string | null;
	paid_method: InvoicePaidMethod | null;
	created_at: string;
	/**
	 * The organisers' own note, from `invoice_internal_notes`, or `null` when
	 * none was written. It is a table of its own so that the payer, who may read
	 * the invoice, can never read it (security review 2026-10-10, L11); one row
	 * per invoice, so PostgREST hands it back as one object rather than a list.
	 */
	invoice_internal_notes: { note: string } | null;
	delegations: { name: string } | null;
	seats: { name: string; committees: { abbreviation: string } | null } | null;
};

/**
 * The columns the organiser's table and CSV read. The seat comes with its
 * committee's abbreviation so the row can say "UNSC · France", and the note
 * comes along from its own table.
 */
const ORGANISER_INVOICE_COLUMNS =
	'id, number, payer_user_id, description, quantity, unit_amount_cents, amount_cents, currency, platform_fee_cents, status, paid_at, paid_method, created_at, invoice_internal_notes(note), delegations(name), seats(name, committees(abbreviation))';

/** These ids cut into lists of at most `ID_LOOKUP_BATCH_SIZE`. An empty list gives no batches. */
function idBatches(ids: string[]): string[][] {
	const batches: string[][] = [];

	for (let firstIndex = 0; firstIndex < ids.length; firstIndex += ID_LOOKUP_BATCH_SIZE) {
		batches.push(ids.slice(firstIndex, firstIndex + ID_LOOKUP_BATCH_SIZE));
	}

	return batches;
}

/** Every payer of these invoices, each once, leaving out the ones whose account is gone. */
function payerIdsOf(rows: { payer_user_id: string | null }[]): string[] {
	const payerIds = new Set<string>();

	for (const row of rows) {
		if (row.payer_user_id !== null) {
			payerIds.add(row.payer_user_id);
		}
	}

	return [...payerIds];
}

/**
 * Every invoice of the conference, newest first, however many there are.
 *
 * PostgREST answers with at most `max_rows` rows whatever is asked of it, so
 * this asks for a window at a time and moves it along by however many rows
 * really came back, until one comes back empty — the reason
 * `readApplicationsForExport` in `./application-table.ts` gives for doing the same.
 * The id breaks ties between two invoices raised in the same instant, so that
 * the windows line up.
 */
async function readConferenceInvoiceRows(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<OrganiserInvoiceQueryRow[]> {
	const invoices: OrganiserInvoiceQueryRow[] = [];
	let firstIndex = 0;

	while (true) {
		const { data, error } = await supabase
			.from('invoices')
			.select(ORGANISER_INVOICE_COLUMNS)
			.eq('conference_id', conferenceId)
			.order('created_at', { ascending: false })
			.order('id', { ascending: false })
			.range(firstIndex, firstIndex + INVOICE_READ_BATCH_SIZE - 1)
			// Replaces Supabase's guess at the row's shape with ours. It has to come last.
			.overrideTypes<OrganiserInvoiceQueryRow[], { merge: false }>();

		// The window starts past the last row, which is the end of the list.
		if (error?.code === PAGE_OUT_OF_RANGE_CODE) {
			return invoices;
		}

		if (error) {
			throw new Error(`Could not read the invoices: ${error.message}`);
		}

		const batch = data ?? [];

		if (batch.length === 0) {
			return invoices;
		}

		invoices.push(...batch);
		firstIndex = firstIndex + batch.length;
	}
}

/**
 * What each of these payers is called, by user id.
 *
 * A query of its own because `invoices.payer_user_id` points at `auth.users`
 * rather than at `profiles`, and PostgREST can only bring along a table that a
 * foreign key of the one being read actually names. `readSeatsPageProfiles` in
 * `./delegations.ts` explains the same thing for the people in a delegation.
 */
async function readPayerNames(
	supabase: SupabaseClient,
	payerIds: string[]
): Promise<Map<string, string>> {
	const names = new Map<string, string>();

	for (const batch of idBatches(payerIds)) {
		const { data, error } = await supabase
			.from('profiles')
			.select('id, full_name')
			.in('id', batch)
			.overrideTypes<{ id: string; full_name: string }[], { merge: false }>();

		if (error) {
			throw new Error(`Could not read the payers' names: ${error.message}`);
		}

		for (const row of data ?? []) {
			names.set(row.id, row.full_name);
		}
	}

	return names;
}

/** One query row and its payer's name as a row of the table. */
function toOrganiserInvoiceRow(
	row: OrganiserInvoiceQueryRow,
	payerNames: Map<string, string>
): OrganiserInvoiceRow {
	const payerName = row.payer_user_id === null ? undefined : payerNames.get(row.payer_user_id);
	const committee = row.seats?.committees;
	const seatLabel = row.seats && committee ? `${committee.abbreviation} · ${row.seats.name}` : null;

	return {
		id: row.id,
		number: row.number,
		// A missing name is an account that has gone: `payer_user_id` is set to
		// null when it is deleted, and a profile is deleted with its account.
		payerName: payerName ?? DELETED_PAYER_NAME,
		payerUserId: row.payer_user_id,
		delegationName: row.delegations?.name ?? null,
		seatLabel,
		description: row.description,
		quantity: row.quantity,
		unitAmountCents: row.unit_amount_cents,
		amountCents: row.amount_cents,
		currency: row.currency,
		platformFeeCents: row.platform_fee_cents,
		status: row.status,
		paidAt: row.paid_at,
		paidMethod: row.paid_method,
		createdAt: row.created_at,
		note: row.invoice_internal_notes?.note ?? null
	};
}

/**
 * Every invoice of one conference, newest first, with the payer's name.
 *
 * The whole list, rather than one page of it, because the search looks at the
 * payer's name and that name is not a column of `invoices`: it arrives from a
 * second query, after the rows, so the filtering and the paging are done by
 * `pageOfInvoices` in `$lib/invoices.ts` once both are here. A conference has
 * one invoice per delegate or delegation, which is hundreds rather than
 * millions.
 */
export async function listConferenceInvoices(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<OrganiserInvoiceRow[]> {
	const rows = await readConferenceInvoiceRows(supabase, conferenceId);
	const payerNames = await readPayerNames(supabase, payerIdsOf(rows));

	return rows.map((row) => toOrganiserInvoiceRow(row, payerNames));
}

/**
 * The same invoices with each payer's email beside them, for the CSV.
 *
 * The email comes through the `staff_contact_details` view, which answers only
 * for the people the reader holds `read_contact_details` for
 * (`docs/roles-and-permissions.md`, section 5). An email it does not let
 * through is an empty cell rather than an error.
 */
export async function withPayerEmails(
	supabase: SupabaseClient,
	invoices: OrganiserInvoiceRow[]
): Promise<InvoiceExportRow[]> {
	const payerIds = payerIdsOf(invoices.map((invoice) => ({ payer_user_id: invoice.payerUserId })));
	const details = await readPrivateDetails(supabase, payerIds);

	return invoices.map((invoice) => ({
		...invoice,
		payerEmail: invoice.payerUserId ? (details.get(invoice.payerUserId)?.email ?? null) : null
	}));
}

/** The three facts a row action needs about the invoice it was posted for. */
export type InvoiceToSettle = {
	id: string;
	number: string;
	status: InvoiceStatus;
};

/**
 * One invoice of this conference, or `null` when there is no such invoice here.
 *
 * It asks inside the conference, so an `invoiceId` belonging to somebody else's
 * conference simply is not there, and an id that is not a uuid at all — only a
 * request put together by hand can send one — is answered the same way rather
 * than as a fault.
 */
export async function getConferenceInvoice(
	supabase: SupabaseClient,
	conferenceId: string,
	invoiceId: string
): Promise<InvoiceToSettle | null> {
	const { data, error } = await supabase
		.from('invoices')
		.select('id, number, status')
		.eq('conference_id', conferenceId)
		.eq('id', invoiceId)
		// `maybeSingle` returns one row, or `null` when nothing matches, instead of a list.
		.maybeSingle()
		.overrideTypes<InvoiceToSettle, { merge: false }>();

	if (error?.code === INVALID_TEXT_CODE) {
		return null;
	}

	if (error) {
		throw new Error(`Could not read the invoice: ${error.message}`);
	}

	return data ?? null;
}

/**
 * Move one invoice along one of the three row actions, and say whether it
 * moved.
 *
 * "Mark as paid" also records that the money came in by hand, and when. The
 * `protect_invoice_columns` trigger writes both of those itself from the
 * database's own clock, so what is sent here only says which transition this
 * is; a backdated moment from a browser can never land on the row (security
 * review 2026-10-10, L32).
 *
 * The update only matches while the invoice still has the status it was read
 * with. Two organisers pressing different buttons on the same row at once
 * would otherwise both succeed, the second quietly overwriting the first; this
 * way the second one changes nothing and gets `false`, and the action tells
 * them the invoice has moved on. `now` is a parameter so the tests can fix it.
 *
 * A note is written only when one was typed, so an empty box never wipes one
 * out, and only once the invoice really moved, so a note about a change that
 * did not happen is never kept. It goes into `invoice_internal_notes`, which
 * the payer can never read, rather than onto the invoice (L11).
 */
export async function settleInvoice(
	supabase: SupabaseClient,
	invoice: InvoiceToSettle,
	action: InvoiceAction,
	note: string | null,
	now: Date
): Promise<boolean> {
	const changes: {
		status: InvoiceStatus;
		paid_at?: string;
		paid_method?: InvoicePaidMethod;
	} = { status: INVOICE_ACTIONS[action].target };

	if (action === 'markPaid') {
		changes.paid_at = now.toISOString();
		changes.paid_method = 'manual';
	}

	const { data, error } = await supabase
		.from('invoices')
		.update(changes)
		.eq('id', invoice.id)
		.eq('status', invoice.status)
		// Ask for the changed rows back: an update that matched nothing is not an
		// error in PostgREST, and an empty answer is how that is told apart.
		.select('id')
		.overrideTypes<{ id: string }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not change the invoice: ${error.message}`);
	}

	const hasMoved = (data ?? []).length > 0;

	if (hasMoved && note !== null) {
		await writeInternalNote(supabase, invoice.id, note);
	}

	return hasMoved;
}

/**
 * Keep the organisers' note on an invoice, replacing any earlier one.
 *
 * `upsert` is an insert that becomes an update when the row is already there,
 * which is what one note per invoice asks for. The table's own policies decide
 * who may write it: whoever holds `manage_invoices` for the conference, the
 * same people who may settle the invoice.
 */
async function writeInternalNote(
	supabase: SupabaseClient,
	invoiceId: string,
	note: string
): Promise<void> {
	const { error } = await supabase
		.from('invoice_internal_notes')
		.upsert({ invoice_id: invoiceId, note }, { onConflict: 'invoice_id' });

	if (error) {
		throw new Error(`Could not keep the note on the invoice: ${error.message}`);
	}
}

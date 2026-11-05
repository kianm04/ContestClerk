/**
 * Where the organiser's fees page gets its data: how a conference collects the
 * money, and the fees it charges for a seat.
 *
 * Files under `$lib/server` only ever run on the server, so this is where the
 * database is queried. Every function takes the Supabase client as its first
 * argument. Pages pass in `locals.supabase`, the client that knows who is
 * signed in, so the database's Row Level Security rules (see
 * `specs/02-architecture/permissions.md`) decide what each caller may read and
 * write: anybody who may see the conference reads its fees, and only somebody
 * who can manage it adds, changes, reorders or deletes one.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Fee, FeeAppliesTo, ManagedFee } from '$lib/fees';

/** How this conference collects money, and the currency every fee of it is in. */
export type PaymentSettings = {
	/** A three-letter ISO 4217 code, such as `EUR`. */
	currency: string;
	collectsPaymentsManually: boolean;
	paymentInstructions: string | null;
};

/** The three `conferences` columns this page reads, under the database's own names. */
type PaymentSettingsRow = {
	currency: string;
	collects_payments_manually: boolean;
	payment_instructions: string | null;
};

/**
 * How this conference collects its money, and what it charges in.
 *
 * These are three columns of `conferences` that the `Conference` type does not
 * carry, and they are read in one query rather than three, the way
 * `readConferenceCurrency` in `./conferences.ts` reads the single column it
 * needs. It reads the `conferences` table rather than the
 * `conferences_with_organization` view the rest of the app reads, because none
 * of the three has anything to do with the organisation, which is all the view
 * adds.
 *
 * A conference that could not be read raises a plain error rather than
 * answering "not found": the layout above this page has already read this
 * conference, so there is no honest way for it to be missing here, and filling
 * in defaults would put a payment setting on screen that nobody chose.
 */
export async function readPaymentSettings(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<PaymentSettings> {
	const { data, error } = await supabase
		.from('conferences')
		.select('currency, collects_payments_manually, payment_instructions')
		.eq('id', conferenceId)
		// `maybeSingle` returns one row, or `null` when nothing matches, instead of a list.
		.maybeSingle()
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<PaymentSettingsRow, { merge: false }>();

	if (error) {
		throw new Error(`Could not read how this conference collects payments: ${error.message}`);
	}

	if (!data) {
		throw new Error(`Could not find the conference ${conferenceId}.`);
	}

	return {
		currency: data.currency,
		collectsPaymentsManually: data.collects_payments_manually,
		paymentInstructions: data.payment_instructions
	};
}

/**
 * Save the two columns the "How you collect payments" section owns, and nothing
 * else.
 *
 * The currency is deliberately not written, although `readPaymentSettings`
 * brings it back: the details editor at `/manage/[slug]/details` owns it, and
 * the fees page reads it only so that every amount can be shown in it.
 *
 * The `conferences` update policy asks `edit_conference`, so the database
 * refuses anybody who does not run this conference, however this is called.
 */
export async function updateConferenceSettings(
	supabase: SupabaseClient,
	conferenceId: string,
	settings: { collectsPaymentsManually: boolean; paymentInstructions: string | null }
): Promise<void> {
	const { error } = await supabase
		.from('conferences')
		.update({
			collects_payments_manually: settings.collectsPaymentsManually,
			payment_instructions: settings.paymentInstructions
		})
		.eq('id', conferenceId);

	if (error) {
		throw new Error(`Could not save how this conference collects payments: ${error.message}`);
	}
}

/** What a fee is made of, as the form hands it over. */
export type FeeInput = {
	name: string;
	amountCents: number;
	appliesTo: FeeAppliesTo;
	/** ISO timestamps, or null for no bound on that side. */
	validFrom: string | null;
	validUntil: string | null;
	/**
	 * A line for delegates, which only the creation Setup step writes. Left
	 * out, the column is left alone, so the Manage page never wipes it.
	 */
	description?: string | null;
};

/** `description` as a column to write, or nothing when the caller did not say. */
function descriptionColumn(fee: FeeInput) {
	return fee.description === undefined ? {} : { description: fee.description };
}

/** The fee columns everybody who may read the conference asks for. */
const PUBLIC_FEE_COLUMNS = 'id, name, amount_cents, applies_to, valid_from, valid_until, position';

/** One `fees` row as anybody reads it, under the database's own column names. */
type PublicFeeRow = {
	id: string;
	name: string;
	amount_cents: number;
	applies_to: FeeAppliesTo;
	/** ISO timestamps. `null` means no bound on that side of the window. */
	valid_from: string | null;
	valid_until: string | null;
	position: number;
};

/** Turn a database row (snake_case names) into the shape every page uses. */
function toFee(row: PublicFeeRow): Fee {
	return {
		id: row.id,
		name: row.name,
		amountCents: row.amount_cents,
		appliesTo: row.applies_to,
		validFrom: row.valid_from,
		validUntil: row.valid_until,
		position: row.position
	};
}

/**
 * The same, with the invoice count the team's list shows beside each fee.
 *
 * It builds on `toFee` rather than repeating it, so that a column renamed in
 * one place cannot go on being right in the other.
 */
function toManagedFee(row: PublicFeeRow, invoiceCounts: Map<string, number>): ManagedFee {
	return {
		...toFee(row),
		// A fee nobody has been charged has no entry rather than a zero.
		invoiceCount: invoiceCounts.get(row.id) ?? 0
	};
}

/**
 * How many invoices point at each fee of one conference, by the fee's id.
 *
 * Somebody who may change the fees may not always read the invoices
 * (`docs/roles-and-permissions.md`, section 8), so the count comes from the
 * database's `fee_invoice_counts`, which answers the team a number and nothing
 * else about the invoices, rather than from counting rows the reader may not see.
 */
async function readInvoiceCounts(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<Map<string, number>> {
	const { data, error } = await supabase.rpc('fee_invoice_counts', {
		conference_id: conferenceId
	});

	if (error) {
		throw new Error(`Could not count the invoices of the fees: ${error.message}`);
	}

	const rows: { fee_id: string; invoice_count: number }[] = data ?? [];

	return new Map(rows.map((row) => [row.fee_id, row.invoice_count]));
}

/**
 * Every fee of one conference, in the organiser's own order, each with the
 * number of invoices that point at it.
 *
 * The count is what the list shows beside a fee ("12 invoices") and what tells
 * the organiser why the delete button will not work: the `fees` delete policy
 * only allows a fee nobody has been charged.
 */
export async function listFees(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<ManagedFee[]> {
	// Both questions go at once; `Promise.all` waits for the two answers.
	const [{ data, error }, invoiceCounts] = await Promise.all([
		supabase
			.from('fees')
			.select(PUBLIC_FEE_COLUMNS)
			.eq('conference_id', conferenceId)
			// `position` is the order the organiser put the fees in. Two fees are
			// allowed to share one, so `id` decides between them and the list comes out
			// the same way round on every refresh, exactly as `listCommitteesForManage`
			// orders committees.
			.order('position', { ascending: true })
			.order('id', { ascending: true })
			.overrideTypes<PublicFeeRow[], { merge: false }>(),
		readInvoiceCounts(supabase, conferenceId)
	]);

	if (error) {
		throw new Error(`Could not list the fees: ${error.message}`);
	}

	const rows: PublicFeeRow[] = data ?? [];

	return rows.map((row) => toManagedFee(row, invoiceCounts));
}

/**
 * Every fee of one conference as somebody who is not an organiser reads them.
 *
 * It is the query above in the same order, without the invoice counts and
 * answering with a plain `Fee`. The apply page prints what applying costs,
 * and `specs/02-architecture/permissions.md` gives `invoices` to the payer, the
 * delegation head and the organisers, so an applicant who asked for that count
 * would be asking for something they may not read. The fees themselves are
 * readable by anybody who may read the conference.
 */
export async function listPublicFees(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<Fee[]> {
	const { data, error } = await supabase
		.from('fees')
		.select(PUBLIC_FEE_COLUMNS)
		.eq('conference_id', conferenceId)
		// The same two orders as `listFees`, so the organiser's list and the apply
		// page can never disagree about which fee comes first.
		.order('position', { ascending: true })
		.order('id', { ascending: true })
		.overrideTypes<PublicFeeRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not list the fees: ${error.message}`);
	}

	const rows: PublicFeeRow[] = data ?? [];

	return rows.map(toFee);
}

/**
 * One fee of one conference, or `null` when this conference has no fee with
 * that id.
 *
 * The conference is part of the question and not only the fee, so that a
 * `feeId` typed into somebody's address bar cannot reach a fee of another
 * conference. It is the same guard `getCommitteeForManage` in `./manage-committees.ts`
 * puts on a committee id.
 */
export async function getFee(
	supabase: SupabaseClient,
	conferenceId: string,
	feeId: string
): Promise<ManagedFee | null> {
	const [{ data, error }, invoiceCounts] = await Promise.all([
		supabase
			.from('fees')
			.select(PUBLIC_FEE_COLUMNS)
			.eq('conference_id', conferenceId)
			.eq('id', feeId)
			// `maybeSingle` returns one row, or `null` when nothing matches, instead of a list.
			.maybeSingle()
			.overrideTypes<PublicFeeRow, { merge: false }>(),
		readInvoiceCounts(supabase, conferenceId)
	]);

	if (error) {
		throw new Error(`Could not load the fee: ${error.message}`);
	}

	if (!data) {
		return null;
	}

	return toManagedFee(data, invoiceCounts);
}

/**
 * The highest position any fee of this conference has, or `null` when the
 * conference has no fee at all yet.
 *
 * It is a small query of its own rather than a count of the list the page
 * already read, because the form may be sent from a page somebody left open for
 * an hour: a new fee has to land after whatever is in the list now, not after
 * what was in it then.
 */
async function readHighestFeePosition(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<number | null> {
	const { data, error } = await supabase
		.from('fees')
		.select('position')
		.eq('conference_id', conferenceId)
		// Highest first, and only the first one is asked for.
		.order('position', { ascending: false })
		.limit(1)
		.maybeSingle()
		.overrideTypes<{ position: number }, { merge: false }>();

	if (error) {
		throw new Error(`Could not read where the new fee goes in the list: ${error.message}`);
	}

	return data?.position ?? null;
}

/**
 * Add a fee to a conference, at the end of the organiser's list.
 *
 * This is the one place `conference_id` is ever written. Migration 0011's
 * `protect_fees_columns` trigger refuses an update that moves a fee to another
 * conference, which is why `updateFee` below leaves the column alone.
 */
export async function createFee(
	supabase: SupabaseClient,
	conferenceId: string,
	fee: FeeInput
): Promise<void> {
	const highestPosition = await readHighestFeePosition(supabase, conferenceId);
	// The first fee of a conference goes at 0, and every one after it one place
	// further down the list.
	const position = highestPosition === null ? 0 : highestPosition + 1;

	const { error } = await supabase.from('fees').insert({
		...descriptionColumn(fee),
		conference_id: conferenceId,
		name: fee.name,
		amount_cents: fee.amountCents,
		applies_to: fee.appliesTo,
		valid_from: fee.validFrom,
		valid_until: fee.validUntil,
		position
	});

	if (error) {
		throw new Error(`Could not create the fee: ${error.message}`);
	}
}

/**
 * Save every column the fee form can change.
 *
 * Two columns of the table are deliberately missing. `conference_id` is not
 * written because a fee never moves between conferences: migration 0011's
 * `protect_fees_columns` trigger refuses an update that moves one, so sending
 * even the conference it already belongs to would be asking for trouble.
 * `position` is not written because `moveFee` below owns it, and the arrows on
 * the list are the only thing that changes it.
 *
 * The amount may change even while invoices point at the fee. An invoice keeps
 * the `unit_amount_cents` it was written with, because it is a record of what
 * was agreed (`specs/06-features/fees.md`), so a new price only reaches the
 * people invoiced from now on.
 */
export async function updateFee(
	supabase: SupabaseClient,
	feeId: string,
	fee: FeeInput
): Promise<void> {
	const { error } = await supabase
		.from('fees')
		.update({
			...descriptionColumn(fee),
			name: fee.name,
			amount_cents: fee.amountCents,
			applies_to: fee.appliesTo,
			valid_from: fee.validFrom,
			valid_until: fee.validUntil
		})
		.eq('id', feeId);

	if (error) {
		throw new Error(`Could not save the fee: ${error.message}`);
	}
}

/** One `fees` row while it is being moved: only where it sits in the list matters. */
type FeePositionRow = {
	id: string;
	position: number;
};

/**
 * Where this fee sits in its conference's list, or `null` when that conference
 * has no fee with that id.
 *
 * The conference is part of the question for the same reason it is in `getFee`:
 * an id from somebody else's conference must move nothing.
 */
async function readFeePosition(
	supabase: SupabaseClient,
	conferenceId: string,
	feeId: string
): Promise<FeePositionRow | null> {
	const { data, error } = await supabase
		.from('fees')
		.select('id, position')
		.eq('conference_id', conferenceId)
		.eq('id', feeId)
		.maybeSingle()
		.overrideTypes<FeePositionRow, { merge: false }>();

	if (error) {
		throw new Error(`Could not read the fee's place in the list: ${error.message}`);
	}

	return data ?? null;
}

/**
 * The fee just above or just below this one in the same conference, or `null`
 * when this one is already at the end it is being moved towards.
 *
 * Up the list is towards the lower positions, so the neighbour above is the one
 * with the highest position below this one, and the neighbour below is the
 * other way round. Two fees are allowed to share a position, so `id` decides
 * between them here as well, which is the tie-break `listFees` puts the list in
 * order by.
 */
async function readFeeNeighbour(
	supabase: SupabaseClient,
	conferenceId: string,
	position: number,
	direction: 'up' | 'down'
): Promise<FeePositionRow | null> {
	let query = supabase.from('fees').select('id, position').eq('conference_id', conferenceId);

	if (direction === 'up') {
		query = query
			.lt('position', position)
			.order('position', { ascending: false })
			.order('id', { ascending: false });
	} else {
		query = query
			.gt('position', position)
			.order('position', { ascending: true })
			.order('id', { ascending: true });
	}

	const { data, error } = await query
		.limit(1)
		.maybeSingle()
		.overrideTypes<FeePositionRow, { merge: false }>();

	if (error) {
		throw new Error(`Could not find the fee to swap with: ${error.message}`);
	}

	return data ?? null;
}

/** Write one fee's place in the organiser's list. */
async function setFeePosition(
	supabase: SupabaseClient,
	feeId: string,
	position: number
): Promise<void> {
	const { error } = await supabase.from('fees').update({ position }).eq('id', feeId);

	if (error) {
		throw new Error(`Could not move the fee: ${error.message}`);
	}
}

/**
 * Move a fee one place up or down the organiser's list.
 *
 * It is a swap: the fee and its neighbour trade positions, which is one pair of
 * statements and leaves every other fee alone. A fee already at the end it is
 * being moved towards has no neighbour, and then nothing happens at all, which
 * is what the arrow at the end of the list does. This is `moveCommittee` in
 * `./manage-committees.ts` doing the same job on the same shape.
 */
export async function moveFee(
	supabase: SupabaseClient,
	conferenceId: string,
	feeId: string,
	direction: 'up' | 'down'
): Promise<void> {
	const fee = await readFeePosition(supabase, conferenceId, feeId);

	if (!fee) {
		return;
	}

	const neighbour = await readFeeNeighbour(supabase, conferenceId, fee.position, direction);

	if (!neighbour) {
		return;
	}

	// Neither update needs the other's answer, so both start at once.
	await Promise.all([
		setFeePosition(supabase, fee.id, neighbour.position),
		setFeePosition(supabase, neighbour.id, fee.position)
	]);
}

/**
 * Delete a fee, and answer whether it went.
 *
 * `false` means Row Level Security refused, which it does for a fee an invoice
 * points at: a price somebody has been charged is part of their invoice's
 * history (`specs/02-architecture/permissions.md`). A refused delete is not an
 * error, because the policy hides the row, so nothing matches, nothing is
 * deleted and no message comes back. Asking for the ids of what was deleted
 * with `.select('id')` is what tells the two apart, the way `deleteCommittee`
 * in `./manage-committees.ts` does. The page turns `false` into "this fee is used by
 * {n} invoices and cannot be deleted".
 */
export async function deleteFee(supabase: SupabaseClient, feeId: string): Promise<boolean> {
	const { data, error } = await supabase
		.from('fees')
		.delete()
		.eq('id', feeId)
		.select('id')
		.overrideTypes<{ id: string }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not delete the fee: ${error.message}`);
	}

	const deleted: { id: string }[] = data ?? [];

	return deleted.length > 0;
}

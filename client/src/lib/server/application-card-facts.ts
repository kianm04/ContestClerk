/**
 * The facts the cards at `/applications` show beyond what the list itself
 * reads: where each conference is and what it asks for, the reader's seats and
 * whether their position papers are in, the reader's invoices, and when each
 * of their delegations was sent.
 *
 * Files under `$lib/server` only ever run on the server, so none of these
 * queries can reach the browser. Row Level Security still decides what each
 * one may read: a published conference, the reader's own seats and the papers
 * for them, the invoices they pay, and the delegations they belong to.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	ApplicationCardFacts,
	CardConferenceFacts,
	CardDelegationFacts,
	CardInvoiceFacts,
	CardSeatFacts
} from '$lib/application-cards';
import type { InvoiceStatus } from '$lib/invoices';

/**
 * How many ids one lookup asks about at a time, the way the list's own seat
 * lookup in `./applications.ts` asks. Each id matches at most a handful of
 * rows, so a batch never meets `max_rows`, and the address stays a length the
 * server takes.
 */
const ID_LOOKUP_BATCH_SIZE = 100;

/** One `conferences` row as the place lookup reads it. */
type ConferenceFactsRow = {
	id: string;
	// Both are null for an online conference, or a draft whose city is not set yet.
	city: string | null;
	country_code: string | null;
	position_paper_required: boolean;
	position_paper_deadline: string | null;
};

/** One of the reader's seats, with the committee it is in brought along. */
type MySeatRow = {
	id: string;
	committees: { slug: string; conference_id: string };
};

/** One invoice the reader pays. */
type MyInvoiceRow = {
	id: string;
	conference_id: string;
	status: InvoiceStatus;
	created_at: string;
};

/** One delegation's dates. */
type DelegationDatesRow = {
	id: string;
	submitted_at: string | null;
	updated_at: string;
};

/** These ids cut into lists of at most `ID_LOOKUP_BATCH_SIZE`. An empty list gives no batches. */
function idBatches(ids: string[]): string[][] {
	const batches: string[][] = [];

	for (let firstIndex = 0; firstIndex < ids.length; firstIndex += ID_LOOKUP_BATCH_SIZE) {
		batches.push(ids.slice(firstIndex, firstIndex + ID_LOOKUP_BATCH_SIZE));
	}

	return batches;
}

/** Where each of these conferences is, and what it asks of a delegate's position paper. */
async function readConferenceFacts(
	supabase: SupabaseClient,
	conferenceIds: string[]
): Promise<CardConferenceFacts[]> {
	const facts: CardConferenceFacts[] = [];

	for (const batch of idBatches(conferenceIds)) {
		const { data, error } = await supabase
			.from('conferences')
			.select('id, city, country_code, position_paper_required, position_paper_deadline')
			.in('id', batch)
			.overrideTypes<ConferenceFactsRow[], { merge: false }>();

		if (error) {
			throw new Error(`Could not read your conferences: ${error.message}`);
		}

		for (const row of data ?? []) {
			facts.push({
				conferenceId: row.id,
				city: row.city,
				countryCode: row.country_code,
				isPositionPaperRequired: row.position_paper_required,
				positionPaperDeadline: row.position_paper_deadline
			});
		}
	}

	return facts;
}

/** The ids of the seats among these that already have a position paper. */
async function readSeatIdsWithPositionPapers(
	supabase: SupabaseClient,
	seatIds: string[]
): Promise<Set<string>> {
	const withPapers = new Set<string>();

	for (const batch of idBatches(seatIds)) {
		const { data, error } = await supabase
			.from('documents')
			.select('seat_id')
			.eq('kind', 'position_paper')
			.in('seat_id', batch)
			.overrideTypes<{ seat_id: string | null }[], { merge: false }>();

		if (error) {
			throw new Error(`Could not read your position papers: ${error.message}`);
		}

		for (const row of data ?? []) {
			if (row.seat_id !== null) {
				withPapers.add(row.seat_id);
			}
		}
	}

	return withPapers;
}

/** The seats this person holds, and whether each one's position paper is in. */
async function readMySeatFacts(supabase: SupabaseClient, userId: string): Promise<CardSeatFacts[]> {
	const { data, error } = await supabase
		.from('seats')
		.select('id, committees!inner(slug, conference_id)')
		// Written by hand rather than left to Row Level Security: an organiser may
		// read every seat of their conference, and only the reader's own count here.
		.eq('user_id', userId)
		.overrideTypes<MySeatRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read your seats: ${error.message}`);
	}

	const seats: MySeatRow[] = data ?? [];
	const seatIds = seats.map((seat) => seat.id);
	const withPapers = await readSeatIdsWithPositionPapers(supabase, seatIds);

	return seats.map((seat) => ({
		conferenceId: seat.committees.conference_id,
		committeeSlug: seat.committees.slug,
		hasPositionPaper: withPapers.has(seat.id)
	}));
}

/** The invoices this person pays, leaving out the cancelled ones. */
async function readMyInvoiceFacts(
	supabase: SupabaseClient,
	userId: string
): Promise<CardInvoiceFacts[]> {
	const { data, error } = await supabase
		.from('invoices')
		.select('id, conference_id, status, created_at')
		.eq('payer_user_id', userId)
		.neq('status', 'void')
		.overrideTypes<MyInvoiceRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not list your invoices: ${error.message}`);
	}

	const rows: MyInvoiceRow[] = data ?? [];

	return rows.map((row) => ({
		id: row.id,
		conferenceId: row.conference_id,
		status: row.status,
		createdAt: row.created_at
	}));
}

/** When each of these delegations was sent and last changed. */
async function readDelegationFacts(
	supabase: SupabaseClient,
	delegationIds: string[]
): Promise<CardDelegationFacts[]> {
	const facts: CardDelegationFacts[] = [];

	for (const batch of idBatches(delegationIds)) {
		const { data, error } = await supabase
			.from('delegations')
			.select('id, submitted_at, updated_at')
			.in('id', batch)
			.overrideTypes<DelegationDatesRow[], { merge: false }>();

		if (error) {
			throw new Error(`Could not read your delegations: ${error.message}`);
		}

		for (const row of data ?? []) {
			facts.push({
				delegationId: row.id,
				submittedAt: row.submitted_at,
				updatedAt: row.updated_at
			});
		}
	}

	return facts;
}

/**
 * Everything the cards need beyond the list, for these conferences and
 * delegations. The four lookups do not need each other's answers, so they are
 * sent at once and the page waits for the slowest rather than for the sum.
 */
export async function readApplicationCardFacts(
	supabase: SupabaseClient,
	userId: string,
	conferenceIds: string[],
	delegationIds: string[]
): Promise<ApplicationCardFacts> {
	const [conferences, seats, invoices, delegations] = await Promise.all([
		readConferenceFacts(supabase, conferenceIds),
		readMySeatFacts(supabase, userId),
		readMyInvoiceFacts(supabase, userId),
		readDelegationFacts(supabase, delegationIds)
	]);

	return { conferences, seats, invoices, delegations };
}

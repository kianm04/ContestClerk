import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	createServiceRoleClient,
	createSignedInClient,
	type SignedInClient
} from './supabase-test-client';
import {
	addApplication,
	addCommittee,
	addDelegation,
	addFee,
	addSeat,
	createOpenConferenceOwnedByMe,
	type ConferenceFixture,
	whileTheConferenceIsJoinable
} from './conference-fixtures';

// The money half of task T17: the invoices the four allocation functions write
// now that migration 0007 has replaced them, the seat an invoice follows when
// move_delegate moves its delegate, and the two helpers they lean on.
// `applicable_fee` picks the price and `invoice_due_at` picks the deadline, and
// no role a browser can be may call either, so neither is called from here. They
// are proved through the invoices the four functions write, which is the only
// place their answers become visible.
//
// The seat half of the same five functions is allocation.test.ts, beside this
// file, and nothing here repeats it: every test below reads an invoice.
//
// specs/06-features/fees.md has the rules in words, under "When invoices are
// created".

// Every fixture conference runs 2020-03-01 to 2020-03-03 (see
// FIXTURE_START_DATE and FIXTURE_END_DATE in conference-fixtures.ts), which is
// in the past. `check_seat_allocation` reads that as "the conference has
// started" and stops a delegation head from seating anybody, so the tests below
// where a head is meant to succeed have to push both dates forward first; end
// has to move with start, because conferences_end_after_start requires
// end_date >= start_date. The dates themselves are never the point here, so one
// push, far enough out to never be "today", is enough.
//
// A published conference that has not finished is one the /conferences page
// lists, and the browser tests count what is on that page, which is the reason
// conference-fixtures.ts dates everything 2020 in the first place. So
// createReservedSeatsForNewDelegation archives the conference as its last step,
// exactly as allocation.test.ts does, and nothing below this line asks the
// database whether the conference is published.
const FAR_FUTURE_START_DATE = '2099-01-01';
const FAR_FUTURE_END_DATE = '2099-01-03';

// The name conference-fixtures.ts gives every conference it makes. An invoice
// description has to carry it, so that somebody who owes two conferences can
// tell their invoices apart.
const FIXTURE_CONFERENCE_NAME = 'Fixture Conference';

// The fees these tests charge. Every amount differs from every other on
// purpose, so that an invoice written at the wrong price cannot pass by
// accident.
const INDIVIDUAL_FEE_NAME = 'Delegate fee';
const INDIVIDUAL_FEE_CENTS = 6500;
const EARLY_BIRD_FEE_NAME = 'Early bird delegate fee';
const EARLY_BIRD_FEE_CENTS = 5500;
const LATE_FEE_NAME = 'Late fee';
const LATE_FEE_CENTS = 9500;
const DELEGATION_FEE_NAME = 'School delegate fee';
const DELEGATION_FEE_CENTS = 5000;

// What MUNMeet keeps from each delegate seat. The database writes it down in
// platform_fee_per_delegate_cents(); this is the third copy, and it is here
// rather than imported so that a test fails when the number moves without
// everybody agreeing to move it.
const PLATFORM_FEE_PER_DELEGATE_CENTS = 200;

// An invoice falls due fourteen days after it is written, unless applications
// close before that. specs/06-features/fees.md.
const INVOICE_DUE_AFTER_DAYS = 14;
const ONE_DAY_IN_MS = 86_400_000;
// How far a measured due date may sit from the one a test works out. The
// database stamps it with its own clock, a moment after the test read the time.
const DUE_DATE_TOLERANCE_MS = 60_000;

// How many seats the group tests reserve in one go. Three rather than two, so
// that giving one back still leaves a count that is neither zero nor one, which
// are the two cases remove_delegation_seat treats differently.
const RESERVED_SEAT_COUNT = 3;
// How many more seats the "added later" test hands the same delegation.
const EXTRA_SEAT_COUNT = 2;

// `seats` is unique on (committee_id, name), so a committee that needs several
// seats takes them from this list in order. Which countries they are never
// matters below.
const SEAT_COUNTRIES = [
	{ name: 'France', code: 'FR' },
	{ name: 'Japan', code: 'JP' },
	{ name: 'Brazil', code: 'BR' },
	{ name: 'Kenya', code: 'KE' },
	{ name: 'Peru', code: 'PE' }
];

/**
 * The invoice columns these tests read back. The test client is deliberately
 * untyped, the way every file in this folder builds it, so naming the columns
 * once here is what keeps the assertions type-checked.
 */
type InvoiceRow = {
	id: string;
	payer_user_id: string | null;
	delegation_id: string | null;
	seat_id: string | null;
	fee_id: string | null;
	description: string;
	quantity: number;
	unit_amount_cents: number;
	amount_cents: number;
	platform_fee_cents: number;
	currency: string;
	status: string;
	due_at: string | null;
};

/**
 * Several free seats in one committee, through the organiser's own client.
 * `startingFrom` skips the countries an earlier call already used, so that a
 * second allocation to the same committee does not collide with the first.
 */
async function addSeats(
	organiser: SupabaseClient,
	committeeId: string,
	howMany: number,
	startingFrom = 0
): Promise<string[]> {
	const seatIds: string[] = [];

	for (const country of SEAT_COUNTRIES.slice(startingFrom, startingFrom + howMany)) {
		seatIds.push(await addSeat(organiser, committeeId, country.name, country.code));
	}

	return seatIds;
}

/**
 * A conference open for applications, with one committee holding one free seat.
 * `addApplication` needs the applications window open, which
 * `createOpenConferenceOwnedByMe` sets up.
 */
async function createOpenSeat() {
	const fixture = await createOpenConferenceOwnedByMe();
	const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
	const seatId = await addSeat(fixture.supabase, committeeId, 'France', 'FR');

	return { ...fixture, committeeId, seatId };
}

/**
 * One free seat with one submitted application waiting for it. Every
 * `accept_application` test starts here and then decides what the conference
 * charges, because the fee only has to exist by the time the seat is given out.
 */
async function createSeatAndApplication() {
	const conference = await createOpenSeat();
	const applicant = await createSignedInClient('Ana Silva');
	const applicationId = await addApplication(applicant.supabase, conference.conferenceId, {
		committeePreferences: [conference.committeeId]
	});

	return { ...conference, applicant, applicationId };
}

/**
 * A submitted delegation with `seatCount` seats reserved for it, through
 * `allocate_delegation_seats`, the way the organiser's own review page does it.
 * Nobody sits in any of them yet.
 *
 * The group invoice is written by that call, so a test that wants one has to
 * put the fee on the conference before this runs.
 *
 * The conference's start date is pushed into the future first, so that a head
 * seating one of their own members afterwards is not refused simply for being
 * late, and the conference is archived again at the end; see the comment beside
 * FAR_FUTURE_START_DATE for both.
 */
async function createReservedSeatsForNewDelegation(
	conference: ConferenceFixture,
	seatCount: number
) {
	const { error: dateError } = await conference.supabase
		.from('conferences')
		.update({ start_date: FAR_FUTURE_START_DATE, end_date: FAR_FUTURE_END_DATE })
		.eq('id', conference.conferenceId);

	if (dateError) {
		throw new Error(`Could not move the fixture conference's dates: ${dateError.message}`);
	}

	const committeeId = await addCommittee(conference.supabase, conference.conferenceId);
	const seatIds = await addSeats(conference.supabase, committeeId, seatCount);
	const head = await createSignedInClient('Amelie Dubois');
	const delegationId = await addDelegation(head.supabase, conference.conferenceId);

	await head.supabase.from('delegations').update({ status: 'submitted' }).eq('id', delegationId);

	const { error } = await conference.supabase.rpc('allocate_delegation_seats', {
		delegation_id: delegationId,
		seat_ids: seatIds
	});

	if (error) {
		throw new Error(`Could not reserve the fixture seats: ${error.message}`);
	}

	const { error: archiveError } = await conference.supabase
		.from('conferences')
		.update({ status: 'archived' })
		.eq('id', conference.conferenceId);

	if (archiveError) {
		throw new Error(`Could not archive the fixture conference: ${archiveError.message}`);
	}

	return { committeeId, seatIds, delegationId, head };
}

/**
 * Signs up a new person and has them join a delegation with its join code.
 *
 * `whileTheConferenceIsJoinable` is there because `join_delegation` refuses a
 * conference that is archived or whose last day has passed, and the fixture
 * above is both: it dates the conference 2099 and then archives it, purely to
 * keep it out of the `/conferences` directory. Neither says this conference is
 * really over, so both are lifted for the one call and put straight back.
 */
async function joinDelegation(
	conference: ConferenceFixture,
	delegationId: string,
	head: SignedInClient,
	fullName = 'Luca Rossi'
): Promise<SignedInClient> {
	const { data: delegation } = await head.supabase
		.from('delegations')
		.select('join_code')
		.eq('id', delegationId)
		.single();

	const member = await createSignedInClient(fullName);

	const { error } = await whileTheConferenceIsJoinable(conference, () =>
		member.supabase.rpc('join_delegation', { code: delegation?.join_code })
	);

	if (error) {
		throw new Error(`Could not join the fixture delegation: ${error.message}`);
	}

	return member;
}

/**
 * Moves the conference's application deadline, which is one of the two dates
 * `invoice_due_at` chooses between.
 */
async function setApplicationsCloseAt(
	organiser: SupabaseClient,
	conferenceId: string,
	closesAt: Date
): Promise<void> {
	const { error } = await organiser
		.from('conferences')
		.update({ applications_close_at: closesAt.toISOString() })
		.eq('id', conferenceId);

	if (error) {
		throw new Error(`Could not move the application deadline: ${error.message}`);
	}
}

/**
 * Every invoice of a conference, oldest first, read as the organiser, who is
 * the one person allowed to see all of them.
 *
 * The order is by invoice number rather than by `created_at`, because
 * `next_invoice_number` hands the numbers out one at a time and two invoices
 * written moments apart could otherwise come back either way round.
 */
async function readInvoices(
	organiser: SupabaseClient,
	conferenceId: string
): Promise<InvoiceRow[]> {
	const { data, error } = await organiser
		.from('invoices')
		.select('*')
		.eq('conference_id', conferenceId)
		.order('number');

	if (error) {
		throw new Error(`Could not read the invoices: ${error.message}`);
	}

	return (data ?? []) as InvoiceRow[];
}

/**
 * Accepts an application into a seat and hands back the one invoice that wrote,
 * or `undefined` when the conference charged nothing.
 *
 * `applicable_fee` cannot be called from a test at all, so this is how its
 * choice is read: whichever fee it picked is the one on that invoice.
 */
async function acceptAndReadInvoice(
	organiser: SupabaseClient,
	conferenceId: string,
	applicationId: string,
	seatId: string
): Promise<InvoiceRow | undefined> {
	const { error } = await organiser.rpc('accept_application', {
		application_id: applicationId,
		seat_id: seatId
	});

	if (error) {
		throw new Error(`Could not accept the fixture application: ${error.message}`);
	}

	const invoices = await readInvoices(organiser, conferenceId);

	return invoices[0];
}

/**
 * Settles an invoice the way the organiser's "Mark as paid" button does: the
 * three columns `protect_invoice_columns` lets them write, and no others.
 */
async function markInvoicePaid(organiser: SupabaseClient, invoiceId: string): Promise<void> {
	const { error } = await organiser
		.from('invoices')
		.update({ status: 'paid', paid_method: 'manual', paid_at: new Date().toISOString() })
		.eq('id', invoiceId);

	if (error) {
		throw new Error(`Could not mark the fixture invoice paid: ${error.message}`);
	}
}

/** How long from now an invoice falls due, in milliseconds. */
function millisecondsUntilDue(dueAt: string | null): number {
	if (dueAt === null) {
		throw new Error('That invoice has no due date at all.');
	}

	return new Date(dueAt).getTime() - Date.now();
}

/**
 * What a group invoice for `quantity` seats is described as, for example
 * "3 × School delegate fee · Fixture Conference".
 *
 * The middle dot and the multiplication sign are the characters
 * specs/06-features/fees.md asks for, and `remove_delegation_seat` rewrites the
 * count in front of the "×" when a seat is given back, so both are spelled out
 * here rather than matched loosely.
 */
function groupDescription(quantity: number): string {
	return `${quantity} × ${DELEGATION_FEE_NAME} · ${FIXTURE_CONFERENCE_NAME}`;
}

// Which of a conference's fees an acceptance charges, which is `applicable_fee`
// being proved through its effect. No role a browser can be may call it: its
// only callers are the four allocation functions, which run as the owner, and a
// signed-in user who could call it would learn the prices of a conference still
// in draft. The invoice is therefore the one place its choice can be seen from
// outside the database.
describe('the fee an acceptance charges', () => {
	it('picks the lowest position when two fees are open at once', async () => {
		const { supabase, conferenceId, seatId, applicationId } = await createSeatAndApplication();
		const earlyBirdId = await addFee(
			supabase,
			conferenceId,
			EARLY_BIRD_FEE_NAME,
			EARLY_BIRD_FEE_CENTS,
			{ position: 0 }
		);
		await addFee(supabase, conferenceId, INDIVIDUAL_FEE_NAME, INDIVIDUAL_FEE_CENTS, {
			position: 1
		});

		const invoice = await acceptAndReadInvoice(supabase, conferenceId, applicationId, seatId);

		expect(invoice?.fee_id).toBe(earlyBirdId);
		expect(invoice?.unit_amount_cents).toBe(EARLY_BIRD_FEE_CENTS);
	});

	it('skips a fee whose window has already closed', async () => {
		const { supabase, conferenceId, seatId, applicationId } = await createSeatAndApplication();
		const yesterday = new Date(Date.now() - ONE_DAY_IN_MS).toISOString();

		// The early bird price is first in the list and would win on position
		// alone, which is the point: its window is what takes it out of the running.
		await addFee(supabase, conferenceId, EARLY_BIRD_FEE_NAME, EARLY_BIRD_FEE_CENTS, {
			position: 0,
			validUntil: yesterday
		});
		const fullPriceId = await addFee(
			supabase,
			conferenceId,
			INDIVIDUAL_FEE_NAME,
			INDIVIDUAL_FEE_CENTS,
			{ position: 1 }
		);

		const invoice = await acceptAndReadInvoice(supabase, conferenceId, applicationId, seatId);

		expect(invoice?.fee_id).toBe(fullPriceId);
		expect(invoice?.unit_amount_cents).toBe(INDIVIDUAL_FEE_CENTS);
	});

	it('skips a fee whose window has not opened yet', async () => {
		const { supabase, conferenceId, seatId, applicationId } = await createSeatAndApplication();
		const tomorrow = new Date(Date.now() + ONE_DAY_IN_MS).toISOString();

		await addFee(supabase, conferenceId, LATE_FEE_NAME, LATE_FEE_CENTS, {
			position: 0,
			validFrom: tomorrow
		});
		const todaysPriceId = await addFee(
			supabase,
			conferenceId,
			INDIVIDUAL_FEE_NAME,
			INDIVIDUAL_FEE_CENTS,
			{ position: 1 }
		);

		const invoice = await acceptAndReadInvoice(supabase, conferenceId, applicationId, seatId);

		expect(invoice?.fee_id).toBe(todaysPriceId);
		expect(invoice?.unit_amount_cents).toBe(INDIVIDUAL_FEE_CENTS);
	});
});

describe('accept_application', () => {
	it('writes one invoice to the applicant, at the individual fee that is open', async () => {
		const { supabase, conferenceId, seatId, applicant, applicationId } =
			await createSeatAndApplication();
		const feeId = await addFee(supabase, conferenceId, INDIVIDUAL_FEE_NAME, INDIVIDUAL_FEE_CENTS);

		const { error } = await supabase.rpc('accept_application', {
			application_id: applicationId,
			seat_id: seatId
		});
		expect(error).toBeNull();

		const invoices = await readInvoices(supabase, conferenceId);
		expect(invoices).toHaveLength(1);

		const [invoice] = invoices;
		expect(invoice.payer_user_id).toBe(applicant.userId);
		expect(invoice.seat_id).toBe(seatId);
		// An individual invoice is for one chair, so it carries no delegation.
		expect(invoice.delegation_id).toBeNull();
		expect(invoice.fee_id).toBe(feeId);
		expect(invoice.quantity).toBe(1);
		expect(invoice.unit_amount_cents).toBe(INDIVIDUAL_FEE_CENTS);
		expect(invoice.amount_cents).toBe(INDIVIDUAL_FEE_CENTS);
		expect(invoice.platform_fee_cents).toBe(PLATFORM_FEE_PER_DELEGATE_CENTS);
		expect(invoice.status).toBe('unpaid');
		// The fee's own name, then the conference, joined by the middle dot
		// specs/06-features/fees.md asks for.
		expect(invoice.description).toBe(`${INDIVIDUAL_FEE_NAME} · ${FIXTURE_CONFERENCE_NAME}`);

		// The currency is the conference's own and is never sent in by the caller.
		const { data: conference } = await supabase
			.from('conferences')
			.select('currency')
			.eq('id', conferenceId)
			.single();
		expect(invoice.currency).toBe(conference?.currency);
	});

	it('makes the invoice due in fourteen days when applications close after that', async () => {
		const { supabase, conferenceId, seatId, applicationId } = await createSeatAndApplication();
		await addFee(supabase, conferenceId, INDIVIDUAL_FEE_NAME, INDIVIDUAL_FEE_CENTS);

		// The fixture closes applications tomorrow. A conference still taking
		// applications for another month is the case where the fourteen days win.
		const inAMonth = new Date(Date.now() + 30 * ONE_DAY_IN_MS);
		await setApplicationsCloseAt(supabase, conferenceId, inAMonth);

		await supabase.rpc('accept_application', {
			application_id: applicationId,
			seat_id: seatId
		});

		const [invoice] = await readInvoices(supabase, conferenceId);
		const dueInMilliseconds = millisecondsUntilDue(invoice.due_at);
		const fourteenDaysInMilliseconds = INVOICE_DUE_AFTER_DAYS * ONE_DAY_IN_MS;

		expect(Math.abs(dueInMilliseconds - fourteenDaysInMilliseconds)).toBeLessThan(
			DUE_DATE_TOLERANCE_MS
		);
	});

	it('makes the invoice due when applications close, if that comes first', async () => {
		// The fixture's window closes tomorrow, well inside the fourteen days, so
		// nothing has to be moved for this one.
		const { supabase, conferenceId, seatId, applicationId } = await createSeatAndApplication();
		await addFee(supabase, conferenceId, INDIVIDUAL_FEE_NAME, INDIVIDUAL_FEE_CENTS);

		await supabase.rpc('accept_application', {
			application_id: applicationId,
			seat_id: seatId
		});

		const { data: conference } = await supabase
			.from('conferences')
			.select('applications_close_at')
			.eq('id', conferenceId)
			.single();
		const [invoice] = await readInvoices(supabase, conferenceId);

		expect(millisecondsUntilDue(invoice.due_at)).toBeLessThan(ONE_DAY_IN_MS);
		expect(new Date(String(invoice.due_at)).getTime()).toBe(
			new Date(String(conference?.applications_close_at)).getTime()
		);
	});

	it('ignores a deadline that has already passed, rather than writing an overdue invoice', async () => {
		const { supabase, conferenceId, seatId, applicationId } = await createSeatAndApplication();
		await addFee(supabase, conferenceId, INDIVIDUAL_FEE_NAME, INDIVIDUAL_FEE_CENTS);

		// This is the ordinary case, not an edge one: organisers read the pile of
		// applications and decide after the window has shut. Taking the deadline
		// whenever it is the earlier of the two would stamp every real invoice
		// overdue on the day it was written, which is why invoice_due_at only
		// looks at a deadline still ahead of it. 06-features/fees.md.
		const lastWeek = new Date(Date.now() - 7 * ONE_DAY_IN_MS);
		await setApplicationsCloseAt(supabase, conferenceId, lastWeek);

		await supabase.rpc('accept_application', {
			application_id: applicationId,
			seat_id: seatId
		});

		const [invoice] = await readInvoices(supabase, conferenceId);
		const dueInMilliseconds = millisecondsUntilDue(invoice.due_at);

		expect(dueInMilliseconds).toBeGreaterThan(0);
		expect(Math.abs(dueInMilliseconds - INVOICE_DUE_AFTER_DAYS * ONE_DAY_IN_MS)).toBeLessThan(
			DUE_DATE_TOLERANCE_MS
		);
	});

	it('writes no invoice when the conference charges nothing, and still fills the seat', async () => {
		const { supabase, conferenceId, seatId, applicant, applicationId } =
			await createSeatAndApplication();

		const { error } = await supabase.rpc('accept_application', {
			application_id: applicationId,
			seat_id: seatId
		});
		expect(error).toBeNull();

		expect(await readInvoices(supabase, conferenceId)).toEqual([]);

		const { data: seat } = await supabase.from('seats').select('user_id').eq('id', seatId).single();
		expect(seat?.user_id).toBe(applicant.userId);
	});

	it('does not charge somebody applying on their own the delegation fee', async () => {
		const { supabase, conferenceId, seatId, applicationId } = await createSeatAndApplication();
		await addFee(supabase, conferenceId, DELEGATION_FEE_NAME, DELEGATION_FEE_CENTS, {
			appliesTo: 'delegation_member'
		});

		const { error } = await supabase.rpc('accept_application', {
			application_id: applicationId,
			seat_id: seatId
		});
		expect(error).toBeNull();

		expect(await readInvoices(supabase, conferenceId)).toEqual([]);
	});
});

describe('allocate_delegation_seats', () => {
	it('writes one group invoice to the head, for every seat in the allocation', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const feeId = await addFee(
			conference.supabase,
			conference.conferenceId,
			DELEGATION_FEE_NAME,
			DELEGATION_FEE_CENTS,
			{ appliesTo: 'delegation_member' }
		);
		const { delegationId, head } = await createReservedSeatsForNewDelegation(
			conference,
			RESERVED_SEAT_COUNT
		);

		const invoices = await readInvoices(conference.supabase, conference.conferenceId);
		expect(invoices).toHaveLength(1);

		const [invoice] = invoices;
		// The head who registered the school is the one who pays, even though
		// every head of it may read the invoice.
		expect(invoice.payer_user_id).toBe(head.userId);
		expect(invoice.delegation_id).toBe(delegationId);
		// A group invoice is for the reservation, not for one chair in it.
		expect(invoice.seat_id).toBeNull();
		expect(invoice.fee_id).toBe(feeId);
		expect(invoice.quantity).toBe(RESERVED_SEAT_COUNT);
		expect(invoice.unit_amount_cents).toBe(DELEGATION_FEE_CENTS);
		expect(invoice.amount_cents).toBe(RESERVED_SEAT_COUNT * DELEGATION_FEE_CENTS);
		expect(invoice.platform_fee_cents).toBe(RESERVED_SEAT_COUNT * PLATFORM_FEE_PER_DELEGATE_CENTS);
		expect(invoice.status).toBe('unpaid');
		expect(invoice.description).toBe(groupDescription(RESERVED_SEAT_COUNT));
	});

	it('writes a second invoice for seats added later, and leaves the first alone', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		await addFee(
			conference.supabase,
			conference.conferenceId,
			DELEGATION_FEE_NAME,
			DELEGATION_FEE_CENTS,
			{ appliesTo: 'delegation_member' }
		);
		const { committeeId, delegationId } = await createReservedSeatsForNewDelegation(
			conference,
			RESERVED_SEAT_COUNT
		);
		const extraSeatIds = await addSeats(
			conference.supabase,
			committeeId,
			EXTRA_SEAT_COUNT,
			RESERVED_SEAT_COUNT
		);

		const { error } = await conference.supabase.rpc('allocate_delegation_seats', {
			delegation_id: delegationId,
			seat_ids: extraSeatIds
		});
		expect(error).toBeNull();

		const invoices = await readInvoices(conference.supabase, conference.conferenceId);
		expect(invoices).toHaveLength(2);

		const [first, second] = invoices;
		// A school given more seats next week gets a second invoice for those
		// seats, rather than a rewritten first one.
		expect(first.quantity).toBe(RESERVED_SEAT_COUNT);
		expect(first.status).toBe('unpaid');
		expect(first.amount_cents).toBe(RESERVED_SEAT_COUNT * DELEGATION_FEE_CENTS);

		expect(second.quantity).toBe(EXTRA_SEAT_COUNT);
		expect(second.delegation_id).toBe(delegationId);
		expect(second.amount_cents).toBe(EXTRA_SEAT_COUNT * DELEGATION_FEE_CENTS);
		expect(second.platform_fee_cents).toBe(EXTRA_SEAT_COUNT * PLATFORM_FEE_PER_DELEGATE_CENTS);
	});

	it('writes no invoice when the conference has no delegation fee', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		// The individual fee is put on the conference to show it is not reached
		// for: a school pays the delegation_member rate or nothing at all.
		await addFee(
			conference.supabase,
			conference.conferenceId,
			INDIVIDUAL_FEE_NAME,
			INDIVIDUAL_FEE_CENTS
		);

		await createReservedSeatsForNewDelegation(conference, RESERVED_SEAT_COUNT);

		expect(await readInvoices(conference.supabase, conference.conferenceId)).toEqual([]);
	});
});

describe('allocate_delegation_seats, a tick list with the same seat twice', () => {
	it('bills for the seats it reserved, not for the length of the list', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		await addFee(
			conference.supabase,
			conference.conferenceId,
			DELEGATION_FEE_NAME,
			DELEGATION_FEE_CENTS,
			{ appliesTo: 'delegation_member' }
		);
		const committeeId = await addCommittee(conference.supabase, conference.conferenceId);
		const [seatId] = await addSeats(conference.supabase, committeeId, 1);
		const head = await createSignedInClient('Amelie Dubois');
		const delegationId = await addDelegation(head.supabase, conference.conferenceId);
		await head.supabase.from('delegations').update({ status: 'submitted' }).eq('id', delegationId);

		// The same seat twice. "= any (array)" is a set, so one seat is
		// reserved; the check that every seat is free asks each element on its
		// own and a duplicate answers yes twice, so nothing upstream sees it.
		const { error } = await conference.supabase.rpc('allocate_delegation_seats', {
			delegation_id: delegationId,
			seat_ids: [seatId, seatId]
		});
		expect(error).toBeNull();

		const invoices = await readInvoices(conference.supabase, conference.conferenceId);
		expect(invoices).toHaveLength(1);

		// Billing the length of the list would have charged the school twice for
		// one seat, told them so, and doubled MUNMeet's own cut with it.
		const [invoice] = invoices;
		expect(invoice.quantity).toBe(1);
		expect(invoice.amount_cents).toBe(DELEGATION_FEE_CENTS);
		expect(invoice.platform_fee_cents).toBe(PLATFORM_FEE_PER_DELEGATE_CENTS);
		expect(invoice.description).toBe(groupDescription(1));
	});
});

describe('remove_delegation_seat', () => {
	it('voids the unpaid group invoice and reissues it for the seats that are left', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		await addFee(
			conference.supabase,
			conference.conferenceId,
			DELEGATION_FEE_NAME,
			DELEGATION_FEE_CENTS,
			{ appliesTo: 'delegation_member' }
		);
		const { seatIds } = await createReservedSeatsForNewDelegation(conference, RESERVED_SEAT_COUNT);

		const { error } = await conference.supabase.rpc('remove_delegation_seat', {
			seat_id: seatIds[0]
		});
		expect(error).toBeNull();

		const invoices = await readInvoices(conference.supabase, conference.conferenceId);
		expect(invoices).toHaveLength(2);

		const [original, replacement] = invoices;
		// An invoice cannot be made smaller, because its total and its platform fee
		// were agreed at one number, so the first one goes whole.
		expect(original.status).toBe('void');
		expect(original.quantity).toBe(RESERVED_SEAT_COUNT);

		const remainingSeats = RESERVED_SEAT_COUNT - 1;
		expect(replacement.status).toBe('unpaid');
		expect(replacement.quantity).toBe(remainingSeats);
		// The price the school already agreed to is carried over rather than looked
		// up again, so a fee that changed in between does not move the bill.
		expect(replacement.unit_amount_cents).toBe(DELEGATION_FEE_CENTS);
		expect(replacement.amount_cents).toBe(remainingSeats * DELEGATION_FEE_CENTS);
		expect(replacement.platform_fee_cents).toBe(remainingSeats * PLATFORM_FEE_PER_DELEGATE_CENTS);
		// The replacement is described the same way, with the new count in front,
		// so the two read as one story on the organiser's fees page.
		expect(replacement.description).toBe(groupDescription(remainingSeats));
		// And it keeps the original's deadline rather than taking a fresh
		// fourteen days. Giving one seat of three back is not a new bill, and a
		// school that has had the invoice for a week should not get another week
		// for the same seats by asking for one fewer.
		expect(replacement.due_at).toBe(original.due_at);
	});

	it('reissues an invoice whose payer has closed their account, and tells nobody', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		await addFee(
			conference.supabase,
			conference.conferenceId,
			DELEGATION_FEE_NAME,
			DELEGATION_FEE_CENTS,
			{ appliesTo: 'delegation_member' }
		);
		const { seatIds, delegationId, head } = await createReservedSeatsForNewDelegation(
			conference,
			RESERVED_SEAT_COUNT
		);

		// Somebody else takes the delegation over before its first head leaves,
		// because prevent_last_delegation_head_removal refuses to let the last
		// one go. The school still owes for the seats it keeps, so the invoice
		// outlives the person and its payer_user_id is set to null.
		const secondHead = await joinDelegation(conference, delegationId, head, 'Nadia Haddad');
		await head.supabase
			.from('delegation_members')
			.update({ role: 'head' })
			.eq('delegation_id', delegationId)
			.eq('user_id', secondHead.userId);
		const { error: deleteError } = await head.supabase.rpc('delete_my_account');
		expect(deleteError).toBeNull();

		const { error } = await conference.supabase.rpc('remove_delegation_seat', {
			seat_id: seatIds[0]
		});
		// Until notify_invoice_created learned to say nothing when there is
		// nobody left to tell, this whole call rolled back on notifications.user_id
		// being not null: the seat stayed reserved and the bill stayed as it was.
		expect(error).toBeNull();

		const invoices = await readInvoices(conference.supabase, conference.conferenceId);
		expect(invoices).toHaveLength(2);

		const [original, replacement] = invoices;
		expect(original.status).toBe('void');
		expect(replacement.status).toBe('unpaid');
		expect(replacement.quantity).toBe(RESERVED_SEAT_COUNT - 1);
		expect(replacement.payer_user_id).toBeNull();

		// And nobody was told. The service role client is reading here only to
		// show that a row does not exist, which no ordinary client could do: the
		// person it would have been addressed to is gone. The delegation's
		// remaining heads still read the invoice itself on their own page.
		const admin = createServiceRoleClient();
		const { data: notifications } = await admin
			.from('notifications')
			.select('id')
			.eq('link_path', `/invoices/${replacement.id}`);
		expect(notifications).toEqual([]);
	});

	it('puts the new count on a hand-raised invoice that never had one', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		await addFee(
			conference.supabase,
			conference.conferenceId,
			DELEGATION_FEE_NAME,
			DELEGATION_FEE_CENTS,
			{ appliesTo: 'delegation_member' }
		);
		const { seatIds, delegationId, head } = await createReservedSeatsForNewDelegation(
			conference,
			RESERVED_SEAT_COUNT
		);

		// An invoice the organiser raised by hand, for a group rate agreed over
		// email. It is newer than the one the allocation wrote, so it is the one
		// remove_delegation_seat reaches for, and its description opens with words
		// rather than with a count.
		// It carries no number: guard_invoice_insert writes that itself, from
		// next_invoice_number, whatever the caller sent.
		const agreedByHand = 'Agreed by email for the Rotterdam group';
		await conference.supabase.from('invoices').insert({
			conference_id: conference.conferenceId,
			payer_user_id: head.userId,
			delegation_id: delegationId,
			description: agreedByHand,
			quantity: RESERVED_SEAT_COUNT,
			unit_amount_cents: DELEGATION_FEE_CENTS,
			currency: 'EUR'
		});

		const { error } = await conference.supabase.rpc('remove_delegation_seat', {
			seat_id: seatIds[0]
		});
		expect(error).toBeNull();

		const invoices = await readInvoices(conference.supabase, conference.conferenceId);
		const replacement = invoices[invoices.length - 1];

		// Leaving the description alone would have left a row saying three seats
		// while charging for two.
		expect(replacement.quantity).toBe(RESERVED_SEAT_COUNT - 1);
		expect(replacement.description).toBe(`${RESERVED_SEAT_COUNT - 1} × ${agreedByHand}`);
	});

	it('voids the invoice and writes no replacement when it covered one seat', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		await addFee(
			conference.supabase,
			conference.conferenceId,
			DELEGATION_FEE_NAME,
			DELEGATION_FEE_CENTS,
			{ appliesTo: 'delegation_member' }
		);
		const { seatIds } = await createReservedSeatsForNewDelegation(conference, 1);

		const { error } = await conference.supabase.rpc('remove_delegation_seat', {
			seat_id: seatIds[0]
		});
		expect(error).toBeNull();

		const invoices = await readInvoices(conference.supabase, conference.conferenceId);
		// Reissuing for nothing would be an invoice for no seats at all.
		expect(invoices).toHaveLength(1);
		expect(invoices[0].status).toBe('void');
	});

	it('leaves a paid group invoice exactly as it is, and still frees the seat', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		await addFee(
			conference.supabase,
			conference.conferenceId,
			DELEGATION_FEE_NAME,
			DELEGATION_FEE_CENTS,
			{ appliesTo: 'delegation_member' }
		);
		const { seatIds } = await createReservedSeatsForNewDelegation(conference, RESERVED_SEAT_COUNT);
		const [groupInvoice] = await readInvoices(conference.supabase, conference.conferenceId);
		await markInvoicePaid(conference.supabase, groupInvoice.id);

		const { error } = await conference.supabase.rpc('remove_delegation_seat', {
			seat_id: seatIds[0]
		});
		expect(error).toBeNull();

		const invoices = await readInvoices(conference.supabase, conference.conferenceId);
		// The money has arrived, so giving it back is a refund a person decides on.
		expect(invoices).toHaveLength(1);
		expect(invoices[0].status).toBe('paid');
		expect(invoices[0].quantity).toBe(RESERVED_SEAT_COUNT);

		// The seat goes back all the same: the refund is a separate question.
		const { data: seat } = await conference.supabase
			.from('seats')
			.select('delegation_id')
			.eq('id', seatIds[0])
			.single();
		expect(seat?.delegation_id).toBeNull();
	});
});

describe('move_delegate', () => {
	it('carries the unpaid invoice to the new seat, so revoking that seat still voids it', async () => {
		const { supabase, conferenceId, committeeId, seatId, applicationId } =
			await createSeatAndApplication();
		await addFee(supabase, conferenceId, INDIVIDUAL_FEE_NAME, INDIVIDUAL_FEE_CENTS);
		await supabase.rpc('accept_application', {
			application_id: applicationId,
			seat_id: seatId
		});
		const toSeatId = await addSeat(supabase, committeeId, 'Japan', 'JP');

		const { error: moveError } = await supabase.rpc('move_delegate', {
			from_seat_id: seatId,
			to_seat_id: toSeatId
		});
		expect(moveError).toBeNull();

		// The bill itself does not change: the person is still coming and the fee
		// did not move because the room did. What moves is the seat it is written
		// for, so that whatever happens to the new seat happens to the invoice.
		const [afterMove] = await readInvoices(supabase, conferenceId);
		expect(afterMove.seat_id).toBe(toSeatId);
		expect(afterMove.status).toBe('unpaid');
		expect(afterMove.amount_cents).toBe(INDIVIDUAL_FEE_CENTS);

		const { error } = await supabase.rpc('revoke_seat', { seat_id: toSeatId });
		expect(error).toBeNull();

		// Without the line that moves it, revoke_seat would be looking for an
		// invoice on the seat they left, and a rejected applicant would keep a
		// live bill that notify_invoice_created had already told them to pay.
		const [afterRevoke] = await readInvoices(supabase, conferenceId);
		expect(afterRevoke.status).toBe('void');
	});

	it('leaves a paid invoice on the seat it was written for', async () => {
		const { supabase, conferenceId, committeeId, seatId, applicationId } =
			await createSeatAndApplication();
		await addFee(supabase, conferenceId, INDIVIDUAL_FEE_NAME, INDIVIDUAL_FEE_CENTS);
		await supabase.rpc('accept_application', {
			application_id: applicationId,
			seat_id: seatId
		});
		const [invoice] = await readInvoices(supabase, conferenceId);
		await markInvoicePaid(supabase, invoice.id);
		const toSeatId = await addSeat(supabase, committeeId, 'Japan', 'JP');

		const { error } = await supabase.rpc('move_delegate', {
			from_seat_id: seatId,
			to_seat_id: toSeatId
		});
		expect(error).toBeNull();

		// Only an unpaid invoice follows somebody, and that is not a narrower
		// rule than the question. An unpaid invoice on a seat can only be the
		// person sitting in it, because the two ways of leaving a seat are this
		// function, which carries it along, and revoke_seat, which voids it. A
		// paid one may be an earlier occupant's, and dragging that across would
		// move a settled bill to a seat its payer never sat in.
		const [afterMove] = await readInvoices(supabase, conferenceId);
		expect(afterMove.seat_id).toBe(seatId);
		expect(afterMove.status).toBe('paid');
	});
});

describe('revoke_seat', () => {
	it('voids the unpaid invoice written for that seat', async () => {
		const { supabase, conferenceId, seatId, applicationId } = await createSeatAndApplication();
		await addFee(supabase, conferenceId, INDIVIDUAL_FEE_NAME, INDIVIDUAL_FEE_CENTS);
		await supabase.rpc('accept_application', {
			application_id: applicationId,
			seat_id: seatId
		});

		const { error } = await supabase.rpc('revoke_seat', { seat_id: seatId });
		expect(error).toBeNull();

		const invoices = await readInvoices(supabase, conferenceId);
		expect(invoices).toHaveLength(1);
		expect(invoices[0].status).toBe('void');
	});

	it('leaves a paid invoice alone', async () => {
		const { supabase, conferenceId, seatId, applicationId } = await createSeatAndApplication();
		await addFee(supabase, conferenceId, INDIVIDUAL_FEE_NAME, INDIVIDUAL_FEE_CENTS);
		await supabase.rpc('accept_application', {
			application_id: applicationId,
			seat_id: seatId
		});
		const [invoice] = await readInvoices(supabase, conferenceId);
		await markInvoicePaid(supabase, invoice.id);

		const { error } = await supabase.rpc('revoke_seat', { seat_id: seatId });
		expect(error).toBeNull();

		const invoices = await readInvoices(supabase, conferenceId);
		expect(invoices).toHaveLength(1);
		// Voiding an invoice somebody has already paid would say the money was
		// never owed. The organiser refunds it by hand instead.
		expect(invoices[0].status).toBe('paid');
	});

	it('leaves the group invoice alone when a member is taken out of a delegation seat', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		await addFee(
			conference.supabase,
			conference.conferenceId,
			DELEGATION_FEE_NAME,
			DELEGATION_FEE_CENTS,
			{ appliesTo: 'delegation_member' }
		);
		const { seatIds, delegationId, head } = await createReservedSeatsForNewDelegation(
			conference,
			RESERVED_SEAT_COUNT
		);
		const member = await joinDelegation(conference, delegationId, head);
		await head.supabase.from('seats').update({ user_id: member.userId }).eq('id', seatIds[0]);

		const { error } = await conference.supabase.rpc('revoke_seat', { seat_id: seatIds[0] });
		expect(error).toBeNull();

		const invoices = await readInvoices(conference.supabase, conference.conferenceId);
		expect(invoices).toHaveLength(1);
		// The delegation keeps the reservation and still owes for it, so the only
		// invoice revoke_seat can void is one written for this very seat, and a
		// group invoice carries no seat at all.
		expect(invoices[0].status).toBe('unpaid');
		expect(invoices[0].quantity).toBe(RESERVED_SEAT_COUNT);
		expect(invoices[0].seat_id).toBeNull();
	});
});

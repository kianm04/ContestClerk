import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	createServiceRoleClient,
	createSignedInClient,
	type SignedInClient
} from './supabase-test-client';
import {
	addCommittee,
	addDelegation,
	addFee,
	addSeat,
	createConferenceOwnedByMe,
	createOpenConferenceOwnedByMe,
	giveSeatTo,
	whileTheConferenceIsJoinable,
	type ConferenceFixture
} from './conference-fixtures';

// The `invoices` half of task T17: the five policies on the table, the two
// guards on an update (check_invoice_transition and protect_invoice_columns),
// compute_invoice_amount, next_invoice_number, set_invoice_checkout_session,
// the invoices_set_updated_at trigger and the two notification triggers.
//
// specs/06-features/fees.md has the rules in words, the `invoices` row of
// specs/02-architecture/permissions.md has the policies, and
// specs/02-architecture/notifications.md has the two lines the triggers send.
//
// The invoices that accept_application, allocate_delegation_seats,
// remove_delegation_seat and revoke_seat write when somebody is given or loses
// a seat are not here. They are in invoice-allocation.test.ts.
//
// Every invoice below is raised by the organiser by hand, which is the policy
// "Organisers can raise an invoice": the late delegate agreed over email. It is
// also the only way to make one through an ordinary signed-in client, and a
// fixture that cheated with the service role client would hide the very rules
// these tests are checking.

// The fixture fee: €65.00 for one seat. Money is always whole cents, never a
// decimal; see the comment at the top of client/src/lib/money.ts.
const FIXTURE_UNIT_AMOUNT_CENTS = 6500;

// What MUNMeet keeps from each seat, which platform_fee_per_delegate_cents()
// returns inside the database. It is written out again here on purpose: a test
// that read the number back out of the database would agree with itself
// whatever that number became.
const PLATFORM_FEE_PER_SEAT_CENTS = 200;

/** The five statuses of `public.invoice_status`, in the order fees.md lists them. */
type InvoiceStatus = 'unpaid' | 'paid' | 'waived' | 'void' | 'refunded';

/** What `raiseInvoice` may be told to do differently. */
type InvoiceOptions = {
	/** Set on a group invoice, which is the one a delegation's head owes. */
	delegationId?: string;
	/** One seat, unless a test is checking the arithmetic. */
	quantity?: number;
	/**
	 * A total to send with the row, for the tests that prove
	 * compute_invoice_amount works it out again. Zero otherwise, which is both
	 * the column's default and what the app sends.
	 */
	amountCents?: number;
};

/** An invoice the organiser has just raised: enough to find it again. */
type RaisedInvoice = {
	id: string;
	number: string;
};

/**
 * One invoice, raised by the organiser through their own client so that the
 * `invoices` insert policy has to allow it.
 *
 * The number comes from `next_invoice_number`, because `invoices.number` is
 * unique and that function is the only thing that should ever fill it.
 */
async function raiseInvoice(
	organiser: SupabaseClient,
	conferenceId: string,
	payerUserId: string,
	options: InvoiceOptions = {}
): Promise<RaisedInvoice> {
	const number = await nextInvoiceNumber(organiser, conferenceId);

	const { data, error } = await organiser
		.from('invoices')
		.insert({
			conference_id: conferenceId,
			number,
			payer_user_id: payerUserId,
			delegation_id: options.delegationId ?? null,
			description: 'Delegate fee · Fixture Conference',
			quantity: options.quantity ?? 1,
			unit_amount_cents: FIXTURE_UNIT_AMOUNT_CENTS,
			amount_cents: options.amountCents ?? 0,
			currency: 'EUR'
		})
		.select('id, number')
		.single();

	if (error || !data) {
		throw new Error(`Could not raise the fixture invoice: ${error?.message}`);
	}

	return { id: data.id, number: data.number };
}

/** The next invoice number of a conference, through the function that makes it. */
async function nextInvoiceNumber(organiser: SupabaseClient, conferenceId: string): Promise<string> {
	const { data, error } = await organiser.rpc('next_invoice_number', {
		conference_id: conferenceId
	});

	if (error || !data) {
		throw new Error(`Could not number the fixture invoice: ${error?.message}`);
	}

	return data;
}

/**
 * A new person holding a seat in a new committee of the conference, seated by
 * the organiser.
 *
 * Since finding M10 of the October security review, `guard_invoice_insert`
 * refuses an invoice against anybody with no part in the conference, so the
 * late delegate every invoice below is raised against has to be in a seat
 * before the organiser can bill them.
 */
async function seatNewPayer(
	organiser: ConferenceFixture,
	fullName = 'Ana Silva'
): Promise<SignedInClient> {
	const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
	const seatId = await addSeat(organiser.supabase, committeeId);
	const payer = await createSignedInClient(fullName);

	await giveSeatTo(organiser.supabase, seatId, payer.userId);

	return payer;
}

/**
 * A draft conference with one invoice on it, owed by a brand-new account that
 * holds a seat there. Most of the tests below need exactly this and nothing
 * else.
 *
 * The conference is never published, because nothing here asks it to be: an
 * invoice is raised by the organiser, and raising one only needs
 * `has_permission(id, 'administrator')`.
 */
async function createInvoiceOwedByNewPayer() {
	const organiser = await createConferenceOwnedByMe();
	const payer = await seatNewPayer(organiser);
	const invoice = await raiseInvoice(organiser.supabase, organiser.conferenceId, payer.userId);

	return { organiser, payer, invoice };
}

/**
 * Turns a second person into a head of an existing delegation, the way a real
 * co-head is added: they join with the code, and a head who is already in
 * promotes them. participant-notifications.test.ts has the same pair of helpers
 * for the same reason.
 */
async function addSecondHead(
	conference: ConferenceFixture,
	firstHead: SignedInClient,
	delegationId: string
): Promise<SignedInClient> {
	const secondHead = await addMember(conference, firstHead, delegationId);

	await firstHead.supabase
		.from('delegation_members')
		.update({ role: 'head' })
		.eq('delegation_id', delegationId)
		.eq('user_id', secondHead.userId);

	return secondHead;
}

/** Adds a new person to a delegation as an ordinary member, through the join code. */
async function addMember(
	conference: ConferenceFixture,
	head: SignedInClient,
	delegationId: string
): Promise<SignedInClient> {
	const { data, error } = await head.supabase
		.from('delegations')
		.select('join_code')
		.eq('id', delegationId)
		.single();

	if (error || !data) {
		throw new Error(`Could not read the fixture delegation's join code: ${error?.message}`);
	}

	const member = await createSignedInClient();

	// Every fixture conference is dated 2020, which `join_delegation` now reads
	// as "already taken place"; `whileTheConferenceIsJoinable` lifts that for
	// this one call and puts it straight back.
	const { error: joinError } = await whileTheConferenceIsJoinable(conference, () =>
		member.supabase.rpc('join_delegation', { code: data.join_code })
	);

	if (joinError) {
		throw new Error(`Could not join the fixture delegation: ${joinError.message}`);
	}

	return member;
}

/**
 * A delegation with two heads, one ordinary member, and a group invoice the
 * first head owes. `create_delegation` needs a published conference whose
 * application window is open, which `createOpenConferenceOwnedByMe` sets up.
 */
async function createDelegationInvoice() {
	const organiser = await createOpenConferenceOwnedByMe();
	const firstHead = await createSignedInClient('Amelie Dubois');
	const delegationId = await addDelegation(firstHead.supabase, organiser.conferenceId);
	const secondHead = await addSecondHead(organiser, firstHead, delegationId);
	const member = await addMember(organiser, firstHead, delegationId);

	const invoice = await raiseInvoice(organiser.supabase, organiser.conferenceId, firstHead.userId, {
		delegationId,
		quantity: 4
	});

	return { organiser, firstHead, secondHead, member, delegationId, invoice };
}

/** Moves a fresh invoice once, as the organiser, and says where it ended up. */
async function moveInvoiceAsOrganiser(to: InvoiceStatus): Promise<string | undefined> {
	const { organiser, invoice } = await createInvoiceOwedByNewPayer();

	const { data } = await organiser.supabase
		.from('invoices')
		.update({ status: to })
		.eq('id', invoice.id)
		.select('status')
		.single();

	return data?.status;
}

/**
 * Moves a fresh invoice to `from` as the organiser, which is always a step the
 * status machine allows, and then tries to move it on to `to` as the server
 * itself. It gives back what the server was told and where the invoice really
 * ended up.
 */
async function moveInvoiceAsTheServer(from: InvoiceStatus, to: InvoiceStatus) {
	const { organiser, invoice } = await createInvoiceOwedByNewPayer();
	await organiser.supabase.from('invoices').update({ status: from }).eq('id', invoice.id);

	const admin = createServiceRoleClient();
	const { error } = await admin.from('invoices').update({ status: to }).eq('id', invoice.id);

	const { data } = await organiser.supabase
		.from('invoices')
		.select('status')
		.eq('id', invoice.id)
		.single();

	return { error, statusNow: data?.status };
}

describe('invoices, the payer reading their own', () => {
	it('shows the payer the invoice they owe', async () => {
		const { payer, invoice } = await createInvoiceOwedByNewPayer();

		const { data, error } = await payer.supabase.from('invoices').select('number, amount_cents');

		expect(error).toBeNull();
		expect(data).toEqual([{ number: invoice.number, amount_cents: FIXTURE_UNIT_AMOUNT_CENTS }]);
	});

	it('shows a signed-in stranger nothing', async () => {
		await createInvoiceOwedByNewPayer();
		const stranger = await createSignedInClient();

		const { data } = await stranger.supabase.from('invoices').select('number');

		expect(data).toEqual([]);
	});
});

describe("invoices, a delegation head reading the group's", () => {
	it('shows a head the group invoice, even though somebody else is the payer', async () => {
		const { secondHead, invoice } = await createDelegationInvoice();

		// The second head is not `payer_user_id`, so the only policy that can be
		// letting them in is "Delegation heads can read their delegation's
		// invoices". A school that sends two teachers expects either of them to be
		// able to answer the bursar.
		const { data } = await secondHead.supabase.from('invoices').select('number');

		expect(data).toEqual([{ number: invoice.number }]);
	});

	it('hides the group invoice from an ordinary member of the same delegation', async () => {
		const { member } = await createDelegationInvoice();

		const { data } = await member.supabase.from('invoices').select('number');

		expect(data).toEqual([]);
	});
});

describe("invoices, the organiser reading their conference's", () => {
	it('shows the organiser an invoice somebody else owes', async () => {
		const { organiser, invoice } = await createInvoiceOwedByNewPayer();

		const { data } = await organiser.supabase.from('invoices').select('number');

		expect(data).toEqual([{ number: invoice.number }]);
	});

	it('hides it from the organiser of another conference', async () => {
		await createInvoiceOwedByNewPayer();
		const otherOrganiser = await createConferenceOwnedByMe();

		const { data } = await otherOrganiser.supabase.from('invoices').select('number');

		expect(data).toEqual([]);
	});
});

describe('invoices, raising one by hand', () => {
	it('lets the organiser raise one, for the late delegate agreed over email', async () => {
		const { invoice, payer } = await createInvoiceOwedByNewPayer();

		const { data } = await payer.supabase
			.from('invoices')
			.select('status, currency')
			.eq('id', invoice.id)
			.single();

		expect(data).toEqual({ status: 'unpaid', currency: 'EUR' });
	});

	it('refuses a signed-in stranger', async () => {
		const organiser = await createConferenceOwnedByMe();
		const payer = await createSignedInClient('Ana Silva');
		const stranger = await createSignedInClient();

		// The organiser makes the number first, so that the only thing left for
		// the policy to refuse is the insert itself; a stranger cannot call
		// next_invoice_number either, which the test further down proves.
		const number = await nextInvoiceNumber(organiser.supabase, organiser.conferenceId);

		const { error } = await stranger.supabase.from('invoices').insert({
			conference_id: organiser.conferenceId,
			number,
			payer_user_id: payer.userId,
			description: 'An invoice nobody asked for',
			quantity: 1,
			unit_amount_cents: FIXTURE_UNIT_AMOUNT_CENTS,
			currency: 'EUR'
		});

		expect(error).not.toBeNull();
	});

	it('refuses the payer raising their own', async () => {
		const organiser = await createConferenceOwnedByMe();
		const payer = await createSignedInClient('Ana Silva');
		const number = await nextInvoiceNumber(organiser.supabase, organiser.conferenceId);

		const { error } = await payer.supabase.from('invoices').insert({
			conference_id: organiser.conferenceId,
			number,
			payer_user_id: payer.userId,
			description: 'A fee I decided to owe',
			quantity: 1,
			unit_amount_cents: 1,
			currency: 'EUR'
		});

		expect(error).not.toBeNull();
	});
});

describe('invoices, settling one', () => {
	it('lets the organiser mark an invoice as paid', async () => {
		const { organiser, invoice } = await createInvoiceOwedByNewPayer();

		const { data, error } = await organiser.supabase
			.from('invoices')
			.update({ status: 'paid', paid_at: new Date().toISOString(), paid_method: 'manual' })
			.eq('id', invoice.id)
			.select('status, paid_method');

		expect(error).toBeNull();
		expect(data).toEqual([{ status: 'paid', paid_method: 'manual' }]);
	});

	it('refuses the payer marking their own invoice as paid', async () => {
		const { payer, invoice, organiser } = await createInvoiceOwedByNewPayer();

		// The payer may read this row but no policy lets them update it, so no row
		// is matched at all, which is an empty `data` rather than an error.
		const { data } = await payer.supabase
			.from('invoices')
			.update({ status: 'paid' })
			.eq('id', invoice.id)
			.select('id');

		expect(data).toEqual([]);

		const { data: stillUnpaid } = await organiser.supabase
			.from('invoices')
			.select('status')
			.eq('id', invoice.id)
			.single();

		expect(stillUnpaid?.status).toBe('unpaid');
	});
});

describe('invoices, deleting', () => {
	it('refuses even the organiser, because an invoice is a record', async () => {
		const { organiser, invoice } = await createInvoiceOwedByNewPayer();

		// There is no delete policy on the table at all, so nothing matches and
		// nothing is deleted. The way to undo an invoice is to void it.
		const { data, error } = await organiser.supabase
			.from('invoices')
			.delete()
			.eq('id', invoice.id)
			.select('id');

		expect(error).toBeNull();
		expect(data).toEqual([]);

		const { data: stillThere } = await organiser.supabase
			.from('invoices')
			.select('id')
			.eq('id', invoice.id)
			.single();

		expect(stillThere?.id).toBe(invoice.id);
	});
});

describe('compute_invoice_amount, the invoices_compute_amount trigger', () => {
	it('multiplies the quantity by the unit price, and by the platform fee', async () => {
		const organiser = await createConferenceOwnedByMe();
		const payer = await seatNewPayer(organiser, 'Amelie Dubois');
		const invoice = await raiseInvoice(organiser.supabase, organiser.conferenceId, payer.userId, {
			quantity: 4
		});

		const { data } = await organiser.supabase
			.from('invoices')
			.select('amount_cents, platform_fee_cents')
			.eq('id', invoice.id)
			.single();

		expect(data).toEqual({
			amount_cents: 4 * FIXTURE_UNIT_AMOUNT_CENTS,
			platform_fee_cents: 4 * PLATFORM_FEE_PER_SEAT_CENTS
		});
	});

	it('ignores a total that does not add up, and stores the one that does', async () => {
		const organiser = await createConferenceOwnedByMe();
		const payer = await seatNewPayer(organiser, 'Amelie Dubois');
		const invoice = await raiseInvoice(organiser.supabase, organiser.conferenceId, payer.userId, {
			quantity: 3,
			amountCents: 1
		});

		const { data } = await organiser.supabase
			.from('invoices')
			.select('amount_cents, platform_fee_cents')
			.eq('id', invoice.id)
			.single();

		expect(data).toEqual({
			amount_cents: 3 * FIXTURE_UNIT_AMOUNT_CENTS,
			platform_fee_cents: 3 * PLATFORM_FEE_PER_SEAT_CENTS
		});
	});

	it('works both out again when the quantity changes', async () => {
		const organiser = await createConferenceOwnedByMe();
		const payer = await seatNewPayer(organiser, 'Amelie Dubois');
		const invoice = await raiseInvoice(organiser.supabase, organiser.conferenceId, payer.userId, {
			quantity: 2
		});

		// protect_invoice_columns refuses a browser writing `quantity`, so the
		// service role client stands in for the database's own writers, which are
		// the only things that ever change one. What is being proved here is the
		// trigger's arithmetic on an update, not that anybody is allowed to do it.
		const admin = createServiceRoleClient();
		const { error } = await admin.from('invoices').update({ quantity: 5 }).eq('id', invoice.id);

		expect(error).toBeNull();

		const { data } = await organiser.supabase
			.from('invoices')
			.select('amount_cents, platform_fee_cents')
			.eq('id', invoice.id)
			.single();

		expect(data).toEqual({
			amount_cents: 5 * FIXTURE_UNIT_AMOUNT_CENTS,
			platform_fee_cents: 5 * PLATFORM_FEE_PER_SEAT_CENTS
		});
	});
});

describe('next_invoice_number', () => {
	it('numbers the first invoice of a conference 0001 and the second 0002', async () => {
		const organiser = await createConferenceOwnedByMe();
		const payer = await seatNewPayer(organiser);

		const first = await raiseInvoice(organiser.supabase, organiser.conferenceId, payer.userId);
		const second = await raiseInvoice(organiser.supabase, organiser.conferenceId, payer.userId);

		expect(first.number).toBe(`${organiser.conferenceSlug}-0001`);
		expect(second.number).toBe(`${organiser.conferenceSlug}-0002`);
	});

	it('counts from the digits at the end, not from a dash in the slug', async () => {
		const organiser = await createConferenceOwnedByMe();
		const payer = await seatNewPayer(organiser);

		// A slug with dashes all through it and a year on the end, which is what
		// real ones look like. The year is the trap: the function reads the digits
		// at the end of an invoice number, so it has to find the 0001 and not the
		// 2027 in front of it. The random middle keeps `conferences.slug` unique,
		// which it is across the whole table.
		const dashedSlug = `mun-${crypto.randomUUID().slice(0, 8)}-in-the-hague-2027`;
		await organiser.supabase
			.from('conferences')
			.update({ slug: dashedSlug })
			.eq('id', organiser.conferenceId);

		const first = await raiseInvoice(organiser.supabase, organiser.conferenceId, payer.userId);
		const second = await raiseInvoice(organiser.supabase, organiser.conferenceId, payer.userId);

		expect(first.number).toBe(`${dashedSlug}-0001`);
		expect(second.number).toBe(`${dashedSlug}-0002`);
	});

	it('refuses a signed-in person who does not run the conference', async () => {
		const organiser = await createConferenceOwnedByMe();
		const stranger = await createSignedInClient();

		const { error } = await stranger.supabase.rpc('next_invoice_number', {
			conference_id: organiser.conferenceId
		});

		expect(error?.message).toContain('Only the organisers');
	});
});

describe('applicable_fee and invoice_due_at, the two helpers no browser may call', () => {
	// Both are called from inside the allocation functions and from nowhere
	// else, so public, anon and authenticated are all revoked. service_role
	// keeps the right Supabase gives every function in this schema, which is
	// how the first half of each test below can ask at all. applicable_fee is
	// the one that matters: a signed-in caller could otherwise ask it the prices
	// of a conference still in draft, which is what the migration's comment says
	// the missing grant prevents. These two tests are what holds that claim up.

	it('answers the server which fee applies, and refuses a signed-in stranger', async () => {
		const organiser = await createConferenceOwnedByMe();
		await addFee(organiser.supabase, organiser.conferenceId, 'Delegate fee');
		const stranger = await createSignedInClient();

		// The server is asked first, and the answer is what makes the refusal
		// below mean something: a call that came back with the fee on it cannot
		// have been refused for a misspelled parameter.
		const admin = createServiceRoleClient();
		const { data: asTheServer } = await admin.rpc('applicable_fee', {
			conference_id: organiser.conferenceId,
			applies_to: 'individual'
		});
		expect(asTheServer?.name).toBe('Delegate fee');

		const { data, error } = await stranger.supabase.rpc('applicable_fee', {
			conference_id: organiser.conferenceId,
			applies_to: 'individual'
		});

		expect(error).not.toBeNull();
		expect(data).toBeNull();
	});

	it('answers the server when an invoice would fall due, and refuses even the organiser', async () => {
		const organiser = await createConferenceOwnedByMe();

		const admin = createServiceRoleClient();
		const { data: asTheServer } = await admin.rpc('invoice_due_at', {
			conference_id: organiser.conferenceId
		});
		expect(asTheServer).not.toBeNull();

		const { data, error } = await organiser.supabase.rpc('invoice_due_at', {
			conference_id: organiser.conferenceId
		});

		expect(error).not.toBeNull();
		expect(data).toBeNull();
	});
});

describe('check_invoice_transition, the invoices_check_transition trigger', () => {
	it('lets an unpaid invoice be paid', async () => {
		const status = await moveInvoiceAsOrganiser('paid');

		expect(status).toBe('paid');
	});

	it('lets an unpaid invoice be waived', async () => {
		const status = await moveInvoiceAsOrganiser('waived');

		expect(status).toBe('waived');
	});

	it('lets an unpaid invoice be voided', async () => {
		const status = await moveInvoiceAsOrganiser('void');

		expect(status).toBe('void');
	});

	// The three moves above are the organiser's own, so they are made through
	// their client. This fourth one is not: a refund happens at Stripe and the
	// webhook writes it, so the allowed case runs as the server. An organiser
	// trying the same thing from the browser is refused, and that test lives
	// with protect_invoice_columns below, which is the guard that refuses it.
	it('lets the server refund a paid invoice', async () => {
		const attempt = await moveInvoiceAsTheServer('paid', 'refunded');

		expect(attempt.error).toBeNull();
		expect(attempt.statusNow).toBe('refunded');
	});

	// The three refusals below go through the service role client, which Row
	// Level Security does not limit and which protect_invoice_columns lets
	// straight past. That is the point of them: this guard is about which
	// statuses exist and not about who is asking, so a webhook or a function
	// running as the server has to be refused the same way a browser is.

	it('refuses an invoice that is already paid being voided', async () => {
		const attempt = await moveInvoiceAsTheServer('paid', 'void');

		expect(attempt.error?.message).toContain('cannot go from paid to void');
		expect(attempt.statusNow).toBe('paid');
	});

	it('refuses a voided invoice being paid', async () => {
		const attempt = await moveInvoiceAsTheServer('void', 'paid');

		expect(attempt.error?.message).toContain('cannot go from void to paid');
		expect(attempt.statusNow).toBe('void');
	});

	it('refuses a waived invoice going back to unpaid', async () => {
		const attempt = await moveInvoiceAsTheServer('waived', 'unpaid');

		expect(attempt.error?.message).toContain('cannot go from waived to unpaid');
		expect(attempt.statusNow).toBe('waived');
	});
});

describe('protect_invoice_columns, the invoices_protect_columns trigger', () => {
	it('lets the organiser write the status, the due date and the payment details', async () => {
		const { organiser, invoice } = await createInvoiceOwedByNewPayer();
		const before = Date.now();
		const dueAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

		// The note is no longer a column here: since migration 20261022130000 it
		// lives in invoice_internal_notes, which security-stripe-organizations.test.ts
		// covers. The same migration has the trigger stamp paid_at itself.
		const { data, error } = await organiser.supabase
			.from('invoices')
			.update({
				status: 'paid',
				due_at: dueAt,
				paid_at: new Date().toISOString(),
				paid_method: 'manual'
			})
			.eq('id', invoice.id)
			.select('status, due_at, paid_at, paid_method');

		expect(error).toBeNull();

		const saved = data?.[0];
		expect(saved?.status).toBe('paid');
		expect(saved?.paid_method).toBe('manual');

		// The due date is compared as a moment and not as text, because Postgres
		// ends a timestamptz with "+00:00" where JavaScript writes "Z". paid_at is
		// the database's own clock, so it can only be checked for being recent.
		expect(new Date(saved?.due_at).toISOString()).toBe(dueAt);
		expect(new Date(saved?.paid_at).getTime()).toBeGreaterThanOrEqual(before - 60_000);
	});

	it('refuses an organiser who changes the quantity', async () => {
		const { organiser, invoice } = await createInvoiceOwedByNewPayer();

		const { error } = await organiser.supabase
			.from('invoices')
			.update({ quantity: 10 })
			.eq('id', invoice.id);

		expect(error?.message).toContain('Only the status, the due date and the payment details');
	});

	it('refuses an organiser who renumbers an invoice', async () => {
		const { organiser, invoice } = await createInvoiceOwedByNewPayer();

		const { error } = await organiser.supabase
			.from('invoices')
			.update({ number: 'a-number-of-my-own-0001' })
			.eq('id', invoice.id);

		expect(error?.message).toContain('Only the status, the due date and the payment details');
	});

	it('refuses an organiser who changes who owes it', async () => {
		const { organiser, invoice } = await createInvoiceOwedByNewPayer();
		const somebodyElse = await createSignedInClient('Luca Rossi');

		const { error } = await organiser.supabase
			.from('invoices')
			.update({ payer_user_id: somebodyElse.userId })
			.eq('id', invoice.id);

		expect(error?.message).toContain('Only the status, the due date and the payment details');
	});

	it('refuses an organiser who writes a Stripe payment intent id', async () => {
		const { organiser, invoice } = await createInvoiceOwedByNewPayer();

		const { error } = await organiser.supabase
			.from('invoices')
			.update({ stripe_payment_intent_id: 'pi_an_id_i_made_up' })
			.eq('id', invoice.id);

		expect(error?.message).toContain('Only the status, the due date and the payment details');
	});

	it('refuses an organiser who marks a paid invoice refunded', async () => {
		const { organiser, invoice } = await createInvoiceOwedByNewPayer();
		await organiser.supabase
			.from('invoices')
			.update({ status: 'paid', paid_method: 'manual', paid_at: new Date().toISOString() })
			.eq('id', invoice.id);

		// A refund is money going back, and only Stripe can send it back: the
		// webhook writes stripe_refund_id together with the status. An invoice a
		// browser could mark refunded would tell the payer their money had been
		// returned when nothing had been returned at all, and leave nothing to
		// reconcile the row against.
		const { error } = await organiser.supabase
			.from('invoices')
			.update({ status: 'refunded' })
			.eq('id', invoice.id);

		expect(error?.message).toContain('Only a refund at Stripe');

		const { data } = await organiser.supabase
			.from('invoices')
			.select('status, stripe_refund_id')
			.eq('id', invoice.id)
			.single();

		expect(data).toEqual({ status: 'paid', stripe_refund_id: null });
	});

	it('refuses an organiser who marks an invoice paid by card', async () => {
		const { organiser, invoice } = await createInvoiceOwedByNewPayer();

		// "Mark as paid" is the manual kind, which is what
		// specs/02-architecture/payments.md gives the organiser. A card payment
		// arrives from the webhook with a payment intent id beside it, and a row
		// claiming one with no Stripe id on it is a row the fees page and
		// Stripe's own dashboard can never be made to agree about.
		const { error } = await organiser.supabase
			.from('invoices')
			.update({ status: 'paid', paid_method: 'stripe', paid_at: new Date().toISOString() })
			.eq('id', invoice.id);

		expect(error?.message).toContain('Only a payment through Stripe');
	});

	it('keeps the amount an organiser tries to rewrite', async () => {
		const { organiser, invoice } = await createInvoiceOwedByNewPayer();

		// This one is not refused with a message, and that is worth knowing:
		// compute_invoice_amount runs first (triggers on the same event run in
		// name order, and `invoices_compute_amount` sorts before
		// `invoices_protect_columns`) and has already put the computed total back,
		// so the two rows protect_invoice_columns compares are identical and it
		// has nothing to complain about. The amount is unchangeable either way,
		// which is the promise the payer actually cares about.
		await organiser.supabase.from('invoices').update({ amount_cents: 1 }).eq('id', invoice.id);

		const { data } = await organiser.supabase
			.from('invoices')
			.select('amount_cents')
			.eq('id', invoice.id)
			.single();

		expect(data?.amount_cents).toBe(FIXTURE_UNIT_AMOUNT_CENTS);
	});
});

describe('invoices_set_updated_at', () => {
	it('stamps updated_at itself, whatever the organiser sends', async () => {
		const { organiser, invoice } = await createInvoiceOwedByNewPayer();

		const { data: before } = await organiser.supabase
			.from('invoices')
			.select('updated_at')
			.eq('id', invoice.id)
			.single();

		// A backdated updated_at travels with a due date, to show the trigger
		// overwrites it a moment later. protect_invoice_columns lets the column
		// through for exactly that reason, so this trigger is the only thing
		// standing between an organiser and a rewritten history.
		await organiser.supabase
			.from('invoices')
			.update({
				due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
				updated_at: '2000-01-01T00:00:00.000Z'
			})
			.eq('id', invoice.id);

		const { data: after } = await organiser.supabase
			.from('invoices')
			.select('updated_at')
			.eq('id', invoice.id)
			.single();

		expect(new Date(after?.updated_at).getTime()).toBeGreaterThan(
			new Date(before?.updated_at).getTime()
		);
	});
});

describe('set_invoice_checkout_session', () => {
	// Since migration 20261022130000 (security review L33) no browser role may
	// call this at all: a payer who could store any text as the session id of
	// an invoice of theirs could point the webhook coming back at the wrong
	// payment. The server writes the column with the service role once Stripe
	// has made the session; security-stripe-organizations.test.ts shows that.
	it('refuses the payer, who used to be able to store the checkout they were sent to', async () => {
		const { payer, invoice } = await createInvoiceOwedByNewPayer();

		const { error } = await payer.supabase.rpc('set_invoice_checkout_session', {
			invoice_id: invoice.id,
			session_id: 'cs_test_fixture_session'
		});

		expect(error?.message).toContain('permission denied for function set_invoice_checkout_session');

		const { data } = await payer.supabase
			.from('invoices')
			.select('stripe_checkout_session_id')
			.eq('id', invoice.id)
			.single();

		expect(data?.stripe_checkout_session_id).toBeNull();
	});

	it('refuses the organiser of the conference', async () => {
		const { organiser, invoice } = await createInvoiceOwedByNewPayer();

		const { error } = await organiser.supabase.rpc('set_invoice_checkout_session', {
			invoice_id: invoice.id,
			session_id: 'cs_test_the_organisers_session'
		});

		expect(error?.message).toContain('permission denied for function set_invoice_checkout_session');
	});

	it('refuses a signed-in stranger', async () => {
		const { invoice } = await createInvoiceOwedByNewPayer();
		const stranger = await createSignedInClient();

		const { error } = await stranger.supabase.rpc('set_invoice_checkout_session', {
			invoice_id: invoice.id,
			session_id: 'cs_test_a_strangers_session'
		});

		expect(error?.message).toContain('permission denied for function set_invoice_checkout_session');
	});
});

describe('notify_invoice_created, the invoices_notify_created trigger', () => {
	it('tells the payer, with the number and the amount in the line', async () => {
		const { payer, invoice } = await createInvoiceOwedByNewPayer();

		// The payer is a brand-new account with one seat, so the only other
		// notification they can have is the seat's, which is left out here.
		const { data } = await payer.supabase
			.from('notifications')
			.select('kind, title, link_path')
			.eq('kind', 'invoice_created');

		expect(data).toEqual([
			{
				kind: 'invoice_created',
				title: `Invoice ${invoice.number}: 65.00 EUR for Fixture Conference`,
				link_path: `/invoices/${invoice.id}`
			}
		]);
	});
});

describe('notify_invoice_paid, the invoices_notify_paid trigger', () => {
	it('tells the payer their invoice was settled', async () => {
		const { organiser, payer, invoice } = await createInvoiceOwedByNewPayer();

		await organiser.supabase.from('invoices').update({ status: 'paid' }).eq('id', invoice.id);

		const { data } = await payer.supabase
			.from('notifications')
			.select('title, link_path')
			.eq('kind', 'invoice_paid');

		expect(data).toEqual([
			{
				title: `Payment received for ${invoice.number}`,
				link_path: `/invoices/${invoice.id}`
			}
		]);
	});

	it('sends nothing when an update leaves the status alone', async () => {
		const { organiser, payer, invoice } = await createInvoiceOwedByNewPayer();

		// The status is sent with the update, unchanged, so the trigger really
		// fires and it is the function itself that decides to keep quiet.
		await organiser.supabase
			.from('invoices')
			.update({
				status: 'unpaid',
				due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
			})
			.eq('id', invoice.id);

		// Only the invoice notifications: the seat the fixture gave the payer
		// told them about itself too, and that is not what this test is about.
		const { data } = await payer.supabase
			.from('notifications')
			.select('kind')
			.in('kind', ['invoice_created', 'invoice_paid']);

		expect(data).toEqual([{ kind: 'invoice_created' }]);
	});
});

describe('invoices_one_subject', () => {
	it('refuses an invoice that is for a seat and for a delegation at once', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const seatId = await addSeat(organiser.supabase, committeeId, 'France', 'FR');
		const head = await createSignedInClient('Amelie Dubois');
		const delegationId = await addDelegation(head.supabase, organiser.conferenceId);
		const number = await nextInvoiceNumber(organiser.supabase, organiser.conferenceId);

		// revoke_seat voids "the invoice for this seat" and remove_delegation_seat
		// reissues "the delegation's invoice", so a row that was both would be
		// picked up by each of them and voided twice.
		const { error } = await organiser.supabase.from('invoices').insert({
			conference_id: organiser.conferenceId,
			number,
			payer_user_id: head.userId,
			seat_id: seatId,
			delegation_id: delegationId,
			description: 'An invoice that cannot decide what it is for',
			quantity: 1,
			unit_amount_cents: FIXTURE_UNIT_AMOUNT_CENTS,
			currency: 'EUR'
		});

		expect(error?.message).toContain('invoices_one_subject');
	});

	it('accepts one that is for neither, which is the late delegate agreed over email', async () => {
		const { invoice, organiser } = await createInvoiceOwedByNewPayer();

		const { data } = await organiser.supabase
			.from('invoices')
			.select('seat_id, delegation_id')
			.eq('id', invoice.id)
			.single();

		expect(data).toEqual({ seat_id: null, delegation_id: null });
	});
});

describe('guard_invoice_insert, the invoices_guard_insert trigger', () => {
	it('lets an organiser raise an ordinary invoice', async () => {
		const { organiser, invoice, payer } = await createInvoiceOwedByNewPayer();

		const { data } = await organiser.supabase
			.from('invoices')
			.select('status, paid_at, paid_method, payer_user_id')
			.eq('id', invoice.id)
			.single();

		expect(data).toEqual({
			status: 'unpaid',
			paid_at: null,
			paid_method: null,
			payer_user_id: payer.userId
		});
	});

	it('refuses an invoice born paid, with somebody else’s payment beside it', async () => {
		const organiser = await createConferenceOwnedByMe();
		const payer = await createSignedInClient('Ana Silva');
		const number = await nextInvoiceNumber(organiser.supabase, organiser.conferenceId);

		// Everything protect_invoice_columns refuses on an update could be chosen
		// on the way in until this guard existed: an invoice that says it was paid
		// by card, and a payer told so by notify_invoice_created.
		const { error } = await organiser.supabase.from('invoices').insert({
			conference_id: organiser.conferenceId,
			number,
			payer_user_id: payer.userId,
			description: 'A bill that pays itself',
			quantity: 1,
			unit_amount_cents: FIXTURE_UNIT_AMOUNT_CENTS,
			currency: 'EUR',
			status: 'paid',
			paid_at: new Date().toISOString(),
			paid_method: 'stripe',
			stripe_payment_intent_id: 'pi_someone_elses_payment'
		});

		expect(error?.message).toContain('Only a payment marks an invoice paid');
	});

	it('numbers the invoice itself, whatever number the caller typed', async () => {
		const organiser = await createConferenceOwnedByMe();
		const payer = await seatNewPayer(organiser);

		// A hand-typed number ending in digits would otherwise move where
		// next_invoice_number counts from, renumbering every invoice after it.
		const { data } = await organiser.supabase
			.from('invoices')
			.insert({
				conference_id: organiser.conferenceId,
				number: 'a-number-of-my-own-9999',
				payer_user_id: payer.userId,
				description: 'Delegate fee · Fixture Conference',
				quantity: 1,
				unit_amount_cents: FIXTURE_UNIT_AMOUNT_CENTS,
				currency: 'EUR'
			})
			.select('number')
			.single();

		expect(data?.number).toBe(`${organiser.conferenceSlug}-0001`);
	});

	it('copies the conference’s currency over the one the caller sent', async () => {
		const organiser = await createConferenceOwnedByMe();
		const payer = await seatNewPayer(organiser);
		await organiser.supabase
			.from('conferences')
			.update({ currency: 'GBP' })
			.eq('id', organiser.conferenceId);

		// Stripe Checkout is created in the invoice's own currency, so an
		// invoice in yen on a conference charging pounds would send the payer to
		// a payment page for an amount nobody had agreed to.
		// specs/02-architecture/data-model.md: "Copied from the conference."
		const { data } = await organiser.supabase
			.from('invoices')
			.insert({
				conference_id: organiser.conferenceId,
				payer_user_id: payer.userId,
				description: 'Delegate fee · Fixture Conference',
				quantity: 1,
				unit_amount_cents: FIXTURE_UNIT_AMOUNT_CENTS,
				currency: 'JPY'
			})
			.select('currency')
			.single();

		expect(data?.currency).toBe('GBP');
	});

	it('refuses an invoice raised against another conference’s seat', async () => {
		const organiser = await createConferenceOwnedByMe();
		const payer = await createSignedInClient('Ana Silva');
		const otherConference = await createConferenceOwnedByMe();
		const otherCommitteeId = await addCommittee(
			otherConference.supabase,
			otherConference.conferenceId
		);
		const otherSeatId = await addSeat(otherConference.supabase, otherCommitteeId, 'France', 'FR');

		// revoke_seat voids "the unpaid invoice carrying that seat_id", so an
		// invoice pointing at a seat in somebody else's conference would be
		// voided by an organiser who cannot even read it.
		const { error } = await organiser.supabase.from('invoices').insert({
			conference_id: organiser.conferenceId,
			payer_user_id: payer.userId,
			seat_id: otherSeatId,
			description: 'Delegate fee · Fixture Conference',
			quantity: 1,
			unit_amount_cents: FIXTURE_UNIT_AMOUNT_CENTS,
			currency: 'EUR'
		});

		expect(error?.message).toContain('That seat is not part of this conference');
	});

	it('refuses an invoice raised against another conference’s delegation', async () => {
		const organiser = await createConferenceOwnedByMe();
		const payer = await createSignedInClient('Ana Silva');
		const otherConference = await createOpenConferenceOwnedByMe();
		const otherHead = await createSignedInClient('Amelie Dubois');
		const otherDelegationId = await addDelegation(otherHead.supabase, otherConference.conferenceId);

		// A delegation's heads read every invoice it carries, so this one would
		// show a school a bill from a conference they never applied to, and
		// remove_delegation_seat would reach for it.
		const { error } = await organiser.supabase.from('invoices').insert({
			conference_id: organiser.conferenceId,
			payer_user_id: payer.userId,
			delegation_id: otherDelegationId,
			description: 'Delegate fee · Fixture Conference',
			quantity: 1,
			unit_amount_cents: FIXTURE_UNIT_AMOUNT_CENTS,
			currency: 'EUR'
		});

		expect(error?.message).toContain('That delegation is not part of this conference');
	});

	it('refuses an invoice that says nobody owes it', async () => {
		const organiser = await createConferenceOwnedByMe();

		// The column is nullable, but only so that a paid invoice can outlive
		// the account that owed it. One is never born without a payer.
		const { error } = await organiser.supabase.from('invoices').insert({
			conference_id: organiser.conferenceId,
			description: 'Delegate fee · Fixture Conference',
			quantity: 1,
			unit_amount_cents: FIXTURE_UNIT_AMOUNT_CENTS,
			currency: 'EUR'
		});

		expect(error?.message).toContain('An invoice has to say who owes it');
	});

	it('refuses an invoice raised against another conference’s fee', async () => {
		const organiser = await createConferenceOwnedByMe();
		const payer = await createSignedInClient('Ana Silva');
		const otherConference = await createConferenceOwnedByMe();
		const otherFeeId = await addFee(
			otherConference.supabase,
			otherConference.conferenceId,
			'Somebody else’s delegate fee'
		);
		const number = await nextInvoiceNumber(organiser.supabase, organiser.conferenceId);

		// An invoice pointing at another conference's fee would also freeze that
		// fee for its own organiser, because the fees delete policy asks only
		// whether any invoice points at the row.
		const { error } = await organiser.supabase.from('invoices').insert({
			conference_id: organiser.conferenceId,
			number,
			payer_user_id: payer.userId,
			fee_id: otherFeeId,
			description: 'Delegate fee · Fixture Conference',
			quantity: 1,
			unit_amount_cents: FIXTURE_UNIT_AMOUNT_CENTS,
			currency: 'EUR'
		});

		expect(error?.message).toContain('That fee is not part of this conference');
	});
});

describe('invoices, when the payer deletes their account', () => {
	it('keeps the invoice and forgets the person', async () => {
		const { organiser, payer, invoice } = await createInvoiceOwedByNewPayer();

		// The money really moved, so the organiser's totals must not change
		// because somebody closed their account afterwards. Migration 0002 makes
		// this promise above delete_my_account, and seats.user_id already keeps it.
		await organiser.supabase
			.from('invoices')
			.update({ status: 'paid', paid_method: 'manual', paid_at: new Date().toISOString() })
			.eq('id', invoice.id);

		const { error } = await payer.supabase.rpc('delete_my_account');
		expect(error).toBeNull();

		const { data } = await organiser.supabase
			.from('invoices')
			.select('status, amount_cents, payer_user_id')
			.eq('id', invoice.id)
			.single();

		expect(data).toEqual({
			status: 'paid',
			amount_cents: FIXTURE_UNIT_AMOUNT_CENTS,
			payer_user_id: null
		});
	});
});

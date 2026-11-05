import { describe, expect, it } from 'vitest';
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
	addRole,
	addSeat,
	addStaff,
	createConferenceOwnedByMe,
	createOpenConferenceOwnedByMe,
	giveRole,
	giveSeatTo,
	type ConferenceFixture
} from './conference-fixtures';

// Findings M10, L30, L31, L34, L35, L12 and L13 of
// docs/security-review-2026-10-10.md, closed by migration
// 20261022131000_money_races_and_invoice_payers.
//
// Two kinds of hole. The first is who money may be asked of, and who may ask
// about it. The invoices insert policy asked only that the caller manages
// invoices, so a manager could bill any account on the platform; now
// guard_invoice_insert asks invoice_payer_takes_part whether the payer has any
// part in the conference (M10). fee_has_invoices answered anybody who typed a
// fee id, and fee_invoice_counts answered the whole team; they now answer the
// conference's staff and its invoice readers only (L12, L13).
//
// The second is the allocation functions, which read a seat, decided it was
// free, and then wrote it, so two requests arriving together could both win
// the same seat and both write an invoice (L30, L34, L35), and two removals
// could void one group invoice and reissue it twice (L31). They now lock what
// they are about to change and repeat the state they saw in every update's
// where clause, raising when the row has moved on. A test suite that talks to
// PostgREST cannot hold two transactions open at once, so the tests below call
// each function twice in a row and prove the second call is refused, which is
// the same predicate the concurrent case now fails on.

/** The amount every fee here charges. Only ever the point when counting invoices. */
const FEE_CENTS = 5000;

/** Seat names for one committee. `seats` is unique on (committee_id, name). */
const SEAT_NAMES = ['France', 'Japan', 'Brazil', 'Kenya'];

/** What a test asks the organiser's client to write for an invoice raised by hand. */
type InvoiceDraft = {
	payerUserId: string;
	seatId?: string;
	delegationId?: string;
};

/**
 * Raises one invoice by hand through the organiser's own client, so that the
 * insert policy and guard_invoice_insert both have their say. Answers the
 * error, because half the tests here expect one. The number is left out:
 * guard_invoice_insert writes it itself.
 */
async function raiseInvoice(organiser: ConferenceFixture, draft: InvoiceDraft) {
	const { error } = await organiser.supabase.from('invoices').insert({
		conference_id: organiser.conferenceId,
		payer_user_id: draft.payerUserId,
		seat_id: draft.seatId ?? null,
		delegation_id: draft.delegationId ?? null,
		description: 'Delegate fee · Fixture Conference',
		quantity: 1,
		unit_amount_cents: FEE_CENTS,
		currency: 'EUR'
	});

	return error;
}

/** A new person holding a seat in a new committee of the conference, seated by the organiser. */
async function seatNewPerson(
	organiser: ConferenceFixture,
	fullName: string
): Promise<SignedInClient & { seatId: string }> {
	const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
	const seatId = await addSeat(organiser.supabase, committeeId);
	const person = await createSignedInClient(fullName);

	await giveSeatTo(organiser.supabase, seatId, person.userId);

	return { ...person, seatId };
}

/** A new team member holding one conference-wide role with these permissions. */
async function teamMemberWith(
	conference: ConferenceFixture,
	permissions: string[]
): Promise<SignedInClient> {
	const person = await createSignedInClient('Team Member');
	const roleId = await addRole(conference.supabase, conference.conferenceId, {
		name: `Role ${crypto.randomUUID().slice(0, 8)}`,
		permissions
	});

	await giveRole(conference.supabase, conference.conferenceId, person.userId, roleId);

	return person;
}

/** The invoices of one conference, read past every policy, oldest first. */
async function readInvoices(conferenceId: string) {
	const { data, error } = await createServiceRoleClient()
		.from('invoices')
		.select('payer_user_id, delegation_id, seat_id, quantity, status')
		.eq('conference_id', conferenceId)
		.order('created_at')
		.order('number');

	if (error) {
		throw new Error(`Could not read the invoices: ${error.message}`);
	}

	return data;
}

/** One seat's holder and reservation, read past every policy. */
async function readSeat(seatId: string) {
	const { data, error } = await createServiceRoleClient()
		.from('seats')
		.select('user_id, delegation_id')
		.eq('id', seatId)
		.single();

	if (error) {
		throw new Error(`Could not read the seat: ${error.message}`);
	}

	return data;
}

/**
 * An open conference charging one fee, with one committee of `seatCount` free
 * seats: the stage for every allocation test below.
 */
async function createConferenceWithSeats(
	seatCount: number,
	appliesTo: 'individual' | 'delegation_member'
) {
	const organiser = await createOpenConferenceOwnedByMe();
	await addFee(organiser.supabase, organiser.conferenceId, 'Delegate fee', FEE_CENTS, {
		appliesTo
	});
	const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
	const seatIds: string[] = [];

	for (const name of SEAT_NAMES.slice(0, seatCount)) {
		seatIds.push(await addSeat(organiser.supabase, committeeId, name, 'FR'));
	}

	return { organiser, committeeId, seatIds };
}

/** A submitted application from a new person who asked for `committeeId`. */
async function addApplicant(organiser: ConferenceFixture, committeeId: string, fullName: string) {
	const applicant = await createSignedInClient(fullName);
	const applicationId = await addApplication(applicant.supabase, organiser.conferenceId, {
		committeePreferences: [committeeId]
	});

	return { applicant, applicationId };
}

/** A submitted delegation of the conference, headed by a new person. */
async function addSubmittedDelegation(organiser: ConferenceFixture, headName: string) {
	const head = await createSignedInClient(headName);
	const delegationId = await addDelegation(
		head.supabase,
		organiser.conferenceId,
		`Delegation ${crypto.randomUUID().slice(0, 8)}`
	);
	const { error } = await head.supabase
		.from('delegations')
		.update({ status: 'submitted' })
		.eq('id', delegationId);

	if (error) {
		throw new Error(`Could not submit the fixture delegation: ${error.message}`);
	}

	return { head, delegationId };
}

/** Seats one applicant through accept_application, the way the organiser's page does. */
async function accept(organiser: ConferenceFixture, applicationId: string, seatId: string) {
	const { error } = await organiser.supabase.rpc('accept_application', {
		application_id: applicationId,
		seat_id: seatId
	});

	return error;
}

/** Reserves seats for a delegation through allocate_delegation_seats. */
async function allocate(organiser: ConferenceFixture, delegationId: string, seatIds: string[]) {
	const { error } = await organiser.supabase.rpc('allocate_delegation_seats', {
		delegation_id: delegationId,
		seat_ids: seatIds
	});

	return error;
}

/**
 * An open conference with an individual fee and one invoice for it, written by
 * accepting one applicant. What the two fee helpers are asked about.
 */
async function createChargedConference() {
	const { organiser, committeeId, seatIds } = await createConferenceWithSeats(1, 'individual');
	const { applicationId } = await addApplicant(organiser, committeeId, 'Anna Applicant');
	const error = await accept(organiser, applicationId, seatIds[0]);

	if (error) {
		throw new Error(`Could not accept the fixture application: ${error.message}`);
	}

	const { data: fee } = await organiser.supabase
		.from('fees')
		.select('id')
		.eq('conference_id', organiser.conferenceId)
		.single();

	if (!fee) {
		throw new Error('The fixture conference has no fee');
	}

	return { organiser, feeId: fee.id };
}

describe('M10: guard_invoice_insert, who an invoice may be raised against', () => {
	it('refuses an invoice against somebody with no part in the conference', async () => {
		const organiser = await createConferenceOwnedByMe();
		const stranger = await createSignedInClient('Nobody Here');

		const error = await raiseInvoice(organiser, { payerUserId: stranger.userId });

		expect(error?.message).toContain('taking part in this conference');
		expect(await readInvoices(organiser.conferenceId)).toEqual([]);
	});

	it('lets a delegate holding a seat be invoiced', async () => {
		const organiser = await createConferenceOwnedByMe();
		const delegate = await seatNewPerson(organiser, 'Ana Silva');

		const error = await raiseInvoice(organiser, { payerUserId: delegate.userId });

		expect(error).toBeNull();
	});

	it('lets a submitted applicant be invoiced, and not one whose application is a draft', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const applicant = await createSignedInClient('Beatriz Costa');
		const drafter = await createSignedInClient('Carla Mendes');
		await addApplication(applicant.supabase, organiser.conferenceId, {
			committeePreferences: [committeeId]
		});
		await addApplication(drafter.supabase, organiser.conferenceId, { status: 'draft' });

		const forApplicant = await raiseInvoice(organiser, { payerUserId: applicant.userId });
		const forDrafter = await raiseInvoice(organiser, { payerUserId: drafter.userId });

		expect(forApplicant).toBeNull();
		// A draft is private to the person writing it; nobody else knows it exists.
		expect(forDrafter?.message).toContain('taking part in this conference');
	});

	it('lets the head of a delegation be invoiced for it', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const head = await createSignedInClient('Amelie Dubois');
		const delegationId = await addDelegation(head.supabase, organiser.conferenceId);

		const error = await raiseInvoice(organiser, { payerUserId: head.userId, delegationId });

		expect(error).toBeNull();
	});

	it('answers invoice_payer_takes_part to the invoice managers of the conference only', async () => {
		const organiser = await createConferenceOwnedByMe();
		const delegate = await seatNewPerson(organiser, 'Ana Silva');
		const stranger = await createSignedInClient('Nobody Here');
		const manager = await teamMemberWith(organiser, ['read_invoices', 'manage_invoices']);
		const question = { conference_id: organiser.conferenceId, payer_user_id: delegate.userId };

		const forOrganiser = await organiser.supabase.rpc('invoice_payer_takes_part', question);
		const forManager = await manager.supabase.rpc('invoice_payer_takes_part', question);
		const aboutStranger = await organiser.supabase.rpc('invoice_payer_takes_part', {
			conference_id: organiser.conferenceId,
			payer_user_id: stranger.userId
		});
		// Somebody who may not raise invoices gets no answer at all, so the
		// function cannot be used to find out who is going to a conference.
		const forStranger = await stranger.supabase.rpc('invoice_payer_takes_part', question);

		expect(forOrganiser.data).toBe(true);
		expect(forManager.data).toBe(true);
		expect(aboutStranger.data).toBe(false);
		expect(forStranger.data).toBe(false);
	});
});

describe('L30: allocate_delegation_seats, the same seat reserved twice', () => {
	it('refuses the second allocation of a seat and bills for it once', async () => {
		const { organiser, seatIds } = await createConferenceWithSeats(1, 'delegation_member');
		const first = await addSubmittedDelegation(organiser, 'Amelie Dubois');
		const second = await addSubmittedDelegation(organiser, 'Hugo Martin');

		const firstError = await allocate(organiser, first.delegationId, seatIds);
		const again = await allocate(organiser, first.delegationId, seatIds);
		const bySecond = await allocate(organiser, second.delegationId, seatIds);

		expect(firstError).toBeNull();
		expect(again?.message).toContain('One of those seats is taken');
		expect(bySecond?.message).toContain('One of those seats is taken');
		expect((await readSeat(seatIds[0])).delegation_id).toBe(first.delegationId);

		// One invoice, for the one delegation that holds the seat. The second
		// delegation was never accepted, so it was never billed either.
		const invoices = await readInvoices(organiser.conferenceId);
		expect(invoices).toEqual([
			{
				payer_user_id: first.head.userId,
				delegation_id: first.delegationId,
				seat_id: null,
				quantity: 1,
				status: 'unpaid'
			}
		]);
	});

	it('reserves nothing when one seat of the list is already taken', async () => {
		const { organiser, seatIds } = await createConferenceWithSeats(2, 'delegation_member');
		const first = await addSubmittedDelegation(organiser, 'Amelie Dubois');
		const second = await addSubmittedDelegation(organiser, 'Hugo Martin');

		await allocate(organiser, first.delegationId, [seatIds[0]]);
		const error = await allocate(organiser, second.delegationId, seatIds);

		expect(error?.message).toContain('One of those seats is taken');
		expect((await readSeat(seatIds[1])).delegation_id).toBeNull();
		expect(await readInvoices(organiser.conferenceId)).toHaveLength(1);
	});
});

describe('L34: accept_application, accepted twice', () => {
	it('refuses accepting the same application a second time and writes one invoice', async () => {
		const { organiser, committeeId, seatIds } = await createConferenceWithSeats(2, 'individual');
		const { applicant, applicationId } = await addApplicant(organiser, committeeId, 'Ana Silva');

		const firstError = await accept(organiser, applicationId, seatIds[0]);
		const secondError = await accept(organiser, applicationId, seatIds[1]);

		expect(firstError).toBeNull();
		expect(secondError?.message).toContain('Only a submitted or waitlisted application');
		expect((await readSeat(seatIds[1])).user_id).toBeNull();

		const invoices = await readInvoices(organiser.conferenceId);
		expect(invoices).toHaveLength(1);
		expect(invoices[0]).toMatchObject({ payer_user_id: applicant.userId, seat_id: seatIds[0] });
	});

	it('refuses a second applicant into a seat the first was given', async () => {
		const { organiser, committeeId, seatIds } = await createConferenceWithSeats(1, 'individual');
		const ana = await addApplicant(organiser, committeeId, 'Ana Silva');
		const beatriz = await addApplicant(organiser, committeeId, 'Beatriz Costa');

		await accept(organiser, ana.applicationId, seatIds[0]);
		const error = await accept(organiser, beatriz.applicationId, seatIds[0]);

		expect(error?.message).toContain('That seat is not free');
		expect((await readSeat(seatIds[0])).user_id).toBe(ana.applicant.userId);

		const { data: application } = await createServiceRoleClient()
			.from('applications')
			.select('status')
			.eq('id', beatriz.applicationId)
			.single();
		expect(application?.status).toBe('submitted');
		expect(await readInvoices(organiser.conferenceId)).toHaveLength(1);
	});
});

describe('L35: move_delegate and swap_delegates, two moves into one free seat', () => {
	it('moves the first delegate and refuses the second', async () => {
		const { organiser, committeeId, seatIds } = await createConferenceWithSeats(3, 'individual');
		const [anaSeat, beatrizSeat, freeSeat] = seatIds;
		const ana = await addApplicant(organiser, committeeId, 'Ana Silva');
		const beatriz = await addApplicant(organiser, committeeId, 'Beatriz Costa');
		await accept(organiser, ana.applicationId, anaSeat);
		await accept(organiser, beatriz.applicationId, beatrizSeat);

		const firstMove = await organiser.supabase.rpc('move_delegate', {
			from_seat_id: anaSeat,
			to_seat_id: freeSeat
		});
		const secondMove = await organiser.supabase.rpc('move_delegate', {
			from_seat_id: beatrizSeat,
			to_seat_id: freeSeat
		});

		expect(firstMove.error).toBeNull();
		expect(secondMove.error?.message).toContain('That seat is not free');
		expect((await readSeat(freeSeat)).user_id).toBe(ana.applicant.userId);
		expect((await readSeat(beatrizSeat)).user_id).toBe(beatriz.applicant.userId);

		// Each unpaid invoice still names the seat its delegate is really in.
		const invoices = await readInvoices(organiser.conferenceId);
		expect(invoices).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ payer_user_id: ana.applicant.userId, seat_id: freeSeat }),
				expect.objectContaining({ payer_user_id: beatriz.applicant.userId, seat_id: beatrizSeat })
			])
		);
	});

	it('refuses a swap once one of the two seats has been emptied', async () => {
		const { organiser, committeeId, seatIds } = await createConferenceWithSeats(3, 'individual');
		const [anaSeat, beatrizSeat, freeSeat] = seatIds;
		const ana = await addApplicant(organiser, committeeId, 'Ana Silva');
		const beatriz = await addApplicant(organiser, committeeId, 'Beatriz Costa');
		await accept(organiser, ana.applicationId, anaSeat);
		await accept(organiser, beatriz.applicationId, beatrizSeat);

		await organiser.supabase.rpc('move_delegate', { from_seat_id: anaSeat, to_seat_id: freeSeat });
		const { error } = await organiser.supabase.rpc('swap_delegates', {
			first_seat_id: anaSeat,
			second_seat_id: beatrizSeat
		});

		expect(error?.message).toContain('Nobody is sitting in that seat');
		expect((await readSeat(beatrizSeat)).user_id).toBe(beatriz.applicant.userId);
		expect((await readSeat(anaSeat)).user_id).toBeNull();
	});
});

describe('L31: remove_delegation_seat, two removals one after the other', () => {
	it('leaves one unpaid group invoice, for the seats the delegation still holds', async () => {
		const { organiser, seatIds } = await createConferenceWithSeats(3, 'delegation_member');
		const { delegationId } = await addSubmittedDelegation(organiser, 'Amelie Dubois');
		await allocate(organiser, delegationId, seatIds);

		const first = await organiser.supabase.rpc('remove_delegation_seat', { seat_id: seatIds[0] });
		const second = await organiser.supabase.rpc('remove_delegation_seat', { seat_id: seatIds[1] });
		const again = await organiser.supabase.rpc('remove_delegation_seat', { seat_id: seatIds[1] });

		expect(first.error).toBeNull();
		expect(second.error).toBeNull();
		expect(again.error?.message).toContain('not reserved for a delegation');

		// Three seats, then two, then one: each removal voids the invoice before it
		// and reissues it for what is left, so exactly one is still owed.
		const invoices = await readInvoices(organiser.conferenceId);
		expect(invoices.map((invoice) => [invoice.quantity, invoice.status])).toEqual([
			[3, 'void'],
			[2, 'void'],
			[1, 'unpaid']
		]);
	});
});

describe('L12 and L13: fee_has_invoices and fee_invoice_counts', () => {
	it('fee_has_invoices answers the team, and tells a stranger nothing', async () => {
		const { organiser, feeId } = await createChargedConference();
		const volunteer = await createSignedInClient('Volunteer');
		await addStaff(organiser.supabase, organiser.conferenceId, volunteer.userId);
		const stranger = await createSignedInClient('Stranger');

		const forOrganiser = await organiser.supabase.rpc('fee_has_invoices', { fee_id: feeId });
		const forVolunteer = await volunteer.supabase.rpc('fee_has_invoices', { fee_id: feeId });
		const forStranger = await stranger.supabase.rpc('fee_has_invoices', { fee_id: feeId });

		expect(forOrganiser.data).toBe(true);
		// A team member with no role at all is still on the team, and
		// is_conference_staff is the gate the review asked for.
		expect(forVolunteer.data).toBe(true);
		expect(forStranger.data).toBe(false);
	});

	it('fee_invoice_counts answers conference editors and invoice readers, and nobody else', async () => {
		const { organiser, feeId } = await createChargedConference();
		const editor = await teamMemberWith(organiser, ['edit_conference']);
		const reader = await teamMemberWith(organiser, ['read_invoices']);
		const manager = await teamMemberWith(organiser, ['manage_invoices']);
		const teamManager = await teamMemberWith(organiser, ['manage_team']);
		const volunteer = await createSignedInClient('Volunteer');
		await addStaff(organiser.supabase, organiser.conferenceId, volunteer.userId);
		const stranger = await createSignedInClient('Stranger');
		const question = { conference_id: organiser.conferenceId };
		const counts = [{ fee_id: feeId, invoice_count: 1 }];

		expect((await editor.supabase.rpc('fee_invoice_counts', question)).data).toEqual(counts);
		expect((await reader.supabase.rpc('fee_invoice_counts', question)).data).toEqual(counts);
		expect((await manager.supabase.rpc('fee_invoice_counts', question)).data).toEqual(counts);
		// A plain team member, and one who holds a permission that is not about
		// the money or the conference row, learn nothing about the invoices.
		expect((await teamManager.supabase.rpc('fee_invoice_counts', question)).data).toEqual([]);
		expect((await volunteer.supabase.rpc('fee_invoice_counts', question)).data).toEqual([]);
		expect((await stranger.supabase.rpc('fee_invoice_counts', question)).data).toEqual([]);
	});
});

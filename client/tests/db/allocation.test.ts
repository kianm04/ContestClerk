import { describe, expect, it } from 'vitest';
import { canMoveInto, type GridSeat } from '$lib/allocation';
import { dayInTimezone } from '$lib/dates';
import { freeSeat, listSeatsWithHolders } from '$lib/server/allocation-grid';
import {
	createServiceRoleClient,
	createSignedInClient,
	type SignedInClient
} from './supabase-test-client';
import {
	addApplication,
	addCommittee,
	addDelegation,
	addSeat,
	createOpenConferenceOwnedByMe,
	type ConferenceFixture,
	whileTheConferenceIsJoinable
} from './conference-fixtures';

// The allocation half of task T16: the five functions that move somebody into,
// between or out of a seat (`accept_application`, `move_delegate`,
// `allocate_delegation_seats`, `remove_delegation_seat`, `revoke_seat`), the
// rewritten `check_seat_allocation` trigger, and the two `seats` policies the
// same migration changed. `is_conference_participant` is what the seats select
// policy calls, and is exercised throughout this file.
//
// specs/06-features/allocation.md has the rules in words.

// Every fixture conference runs 2020-03-01 to 2020-03-03 (see
// FIXTURE_START_DATE and FIXTURE_END_DATE in conference-fixtures.ts), which is
// in the past. check_seat_allocation reads that as "the conference has
// started" and stops a delegation head from seating anyone, so any test where
// a head is meant to succeed has to push both dates forward first; end has to
// move with start, because conferences_end_after_start requires end_date >=
// start_date. The dates themselves are never the point of those tests, so one
// push, far enough out to never be "today", is enough.
//
// A published conference that has not finished is one the /conferences page
// lists, and the browser tests count what is on that page, which is the reason
// conference-fixtures.ts dates everything 2020 in the first place. A fixture
// dated 2099 would sit in the directory until the next `pnpm db:reset` and make
// those tests fail for a reason that has nothing to do with them. So
// createReservedSeatForNewDelegation archives the conference as its last step:
// the directory lists published conferences only, and nothing below this line
// asks the database whether the conference is published.
const FAR_FUTURE_START_DATE = '2099-01-01';
const FAR_FUTURE_END_DATE = '2099-01-03';

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
 * A submitted delegation with one seat reserved for it, through
 * `allocate_delegation_seats`, the way the organiser's own review page does it.
 * Nobody sits in the seat yet. The conference's start date is pushed into the
 * future, so that a head seating one of their own members afterwards is not
 * refused simply for being late; see FAR_FUTURE_START_DATE above.
 *
 * It then archives the conference, for the reason given up there as well.
 * Anything a test needs that only a published conference allows — a new
 * application, a second delegation — has to be made before this helper runs.
 */
async function createReservedSeatForNewDelegation(conference: ConferenceFixture) {
	const { error: dateError } = await conference.supabase
		.from('conferences')
		.update({ start_date: FAR_FUTURE_START_DATE, end_date: FAR_FUTURE_END_DATE })
		.eq('id', conference.conferenceId);

	if (dateError) {
		throw new Error(`Could not move the fixture conference's dates: ${dateError.message}`);
	}

	const committeeId = await addCommittee(conference.supabase, conference.conferenceId);
	const seatId = await addSeat(conference.supabase, committeeId, 'France', 'FR');
	const head = await createSignedInClient('Amelie Dubois');
	const delegationId = await addDelegation(head.supabase, conference.conferenceId);

	await head.supabase.from('delegations').update({ status: 'submitted' }).eq('id', delegationId);

	const { error } = await conference.supabase.rpc('allocate_delegation_seats', {
		delegation_id: delegationId,
		seat_ids: [seatId]
	});

	if (error) {
		throw new Error(`Could not reserve the fixture seat: ${error.message}`);
	}

	const { error: archiveError } = await conference.supabase
		.from('conferences')
		.update({ status: 'archived' })
		.eq('id', conference.conferenceId);

	if (archiveError) {
		throw new Error(`Could not archive the fixture conference: ${archiveError.message}`);
	}

	return { committeeId, seatId, delegationId, head };
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
 * One seat of the conference as the allocation grid reads it, through
 * `listSeatsWithHolders`, the grid's own read. The two tests at the foot of
 * `move_delegate` and in `freeSeat` below start from it so that the seat they
 * hand on is the one the page would have drawn, not one written by hand here.
 */
async function readGridSeat(conference: ConferenceFixture, seatId: string): Promise<GridSeat> {
	const seats = await listSeatsWithHolders(conference.supabase, conference.conferenceId);
	const seat = seats.find((candidate) => candidate.id === seatId);

	if (seat === undefined) {
		throw new Error(`The allocation grid did not read the seat ${seatId}.`);
	}

	return seat;
}

describe('accept_application', () => {
	it('seats the applicant and accepts the application, in one go', async () => {
		const { supabase, userId, conferenceId, committeeId, seatId } = await createOpenSeat();
		const applicant = await createSignedInClient('Ana Silva');
		const applicationId = await addApplication(applicant.supabase, conferenceId, {
			committeePreferences: [committeeId]
		});

		const { error } = await supabase.rpc('accept_application', {
			application_id: applicationId,
			seat_id: seatId
		});
		expect(error).toBeNull();

		const { data: seat } = await supabase
			.from('seats')
			.select('user_id, application_id, allocated_at')
			.eq('id', seatId)
			.single();
		expect(seat?.user_id).toBe(applicant.userId);
		expect(seat?.application_id).toBe(applicationId);
		expect(seat?.allocated_at).not.toBeNull();

		const { data: application } = await supabase
			.from('applications')
			.select('status, decided_at')
			.eq('id', applicationId)
			.single();
		expect(application?.status).toBe('accepted');
		expect(application?.decided_at).not.toBeNull();

		// Who decided is kept from the applicant, so even the organiser reads it
		// through the view made for them (20261022132000_internal_notes_grants.sql).
		const { data: decider } = await supabase
			.from('staff_application_deciders')
			.select('decided_by')
			.eq('application_id', applicationId)
			.single();
		expect(decider?.decided_by).toBe(userId);
	});

	it('refuses somebody who does not run the conference', async () => {
		const { conferenceId, committeeId, seatId } = await createOpenSeat();
		const applicant = await createSignedInClient('Ana Silva');
		const applicationId = await addApplication(applicant.supabase, conferenceId, {
			committeePreferences: [committeeId]
		});
		const stranger = await createSignedInClient();

		const { error } = await stranger.supabase.rpc('accept_application', {
			application_id: applicationId,
			seat_id: seatId
		});
		expect(error?.message).toContain('Only the organisers');
	});

	it('refuses an application that is still a draft', async () => {
		const { supabase, conferenceId, seatId } = await createOpenSeat();
		const applicant = await createSignedInClient('Ana Silva');
		const applicationId = await addApplication(applicant.supabase, conferenceId, {
			status: 'draft'
		});

		const { error } = await supabase.rpc('accept_application', {
			application_id: applicationId,
			seat_id: seatId
		});
		expect(error?.message).toContain('submitted or waitlisted');
	});

	it('refuses a seat that already has somebody in it', async () => {
		const { supabase, conferenceId, committeeId, seatId } = await createOpenSeat();
		const first = await createSignedInClient('Ana Silva');
		const firstApplicationId = await addApplication(first.supabase, conferenceId, {
			committeePreferences: [committeeId]
		});
		await supabase.rpc('accept_application', {
			application_id: firstApplicationId,
			seat_id: seatId
		});

		const second = await createSignedInClient('Beatriz Costa');
		const secondApplicationId = await addApplication(second.supabase, conferenceId, {
			committeePreferences: [committeeId]
		});

		const { error } = await supabase.rpc('accept_application', {
			application_id: secondApplicationId,
			seat_id: seatId
		});
		expect(error?.message).toContain('not free');
	});

	it('refuses a seat reserved for a delegation', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		// The application is made first, because applying needs a published
		// conference and createReservedSeatForNewDelegation archives it.
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
		const applicant = await createSignedInClient('Ana Silva');
		const applicationId = await addApplication(applicant.supabase, fixture.conferenceId, {
			committeePreferences: [committeeId]
		});
		const { seatId } = await createReservedSeatForNewDelegation(fixture);

		const { error } = await fixture.supabase.rpc('accept_application', {
			application_id: applicationId,
			seat_id: seatId
		});
		expect(error?.message).toContain('not free');
	});

	it('refuses a seat belonging to another conference', async () => {
		const { supabase, conferenceId, committeeId } = await createOpenSeat();
		const applicant = await createSignedInClient('Ana Silva');
		const applicationId = await addApplication(applicant.supabase, conferenceId, {
			committeePreferences: [committeeId]
		});

		// A second, unrelated conference, still run by the same organiser, so the
		// only reason this call can fail is the seat being in the wrong place.
		const other = await createOpenSeat();

		const { error } = await supabase.rpc('accept_application', {
			application_id: applicationId,
			seat_id: other.seatId
		});
		expect(error?.message).toContain('not part of this conference');
	});
});

describe('move_delegate', () => {
	it('frees the old seat and fills the new one with the same person', async () => {
		const { supabase, conferenceId, committeeId, seatId: fromSeatId } = await createOpenSeat();
		const toSeatId = await addSeat(supabase, committeeId, 'Japan', 'JP');
		const applicant = await createSignedInClient('Ana Silva');
		const applicationId = await addApplication(applicant.supabase, conferenceId, {
			committeePreferences: [committeeId]
		});
		await supabase.rpc('accept_application', {
			application_id: applicationId,
			seat_id: fromSeatId
		});

		const { error } = await supabase.rpc('move_delegate', {
			from_seat_id: fromSeatId,
			to_seat_id: toSeatId
		});
		expect(error).toBeNull();

		const { data: fromSeat } = await supabase
			.from('seats')
			.select('user_id, application_id, allocated_at')
			.eq('id', fromSeatId)
			.single();
		expect(fromSeat).toEqual({ user_id: null, application_id: null, allocated_at: null });

		const { data: toSeat } = await supabase
			.from('seats')
			.select('user_id, application_id, allocated_at')
			.eq('id', toSeatId)
			.single();
		expect(toSeat?.user_id).toBe(applicant.userId);
		expect(toSeat?.application_id).toBe(applicationId);
		expect(toSeat?.allocated_at).not.toBeNull();
	});

	it('refuses somebody who does not run the conference', async () => {
		const { supabase, committeeId, seatId } = await createOpenSeat();
		const toSeatId = await addSeat(supabase, committeeId, 'Japan', 'JP');
		const stranger = await createSignedInClient();

		const { error } = await stranger.supabase.rpc('move_delegate', {
			from_seat_id: seatId,
			to_seat_id: toSeatId
		});
		expect(error?.message).toContain('Only the organisers');
	});

	it('refuses a seat nobody sits in', async () => {
		const { supabase, committeeId, seatId } = await createOpenSeat();
		const toSeatId = await addSeat(supabase, committeeId, 'Japan', 'JP');

		const { error } = await supabase.rpc('move_delegate', {
			from_seat_id: seatId,
			to_seat_id: toSeatId
		});
		expect(error?.message).toContain('Nobody is sitting in that seat');
	});

	it('refuses a target seat that is already taken', async () => {
		const { supabase, conferenceId, committeeId, seatId: seatOne } = await createOpenSeat();
		const seatTwo = await addSeat(supabase, committeeId, 'Japan', 'JP');
		const delegateOne = await createSignedInClient('Ana Silva');
		const delegateTwo = await createSignedInClient('Beatriz Costa');
		const applicationOne = await addApplication(delegateOne.supabase, conferenceId, {
			committeePreferences: [committeeId]
		});
		const applicationTwo = await addApplication(delegateTwo.supabase, conferenceId, {
			committeePreferences: [committeeId]
		});
		await supabase.rpc('accept_application', { application_id: applicationOne, seat_id: seatOne });
		await supabase.rpc('accept_application', { application_id: applicationTwo, seat_id: seatTwo });

		const { error } = await supabase.rpc('move_delegate', {
			from_seat_id: seatOne,
			to_seat_id: seatTwo
		});
		expect(error?.message).toContain('not free');
	});

	it('refuses a target seat in another conference', async () => {
		const { supabase, conferenceId, committeeId, seatId } = await createOpenSeat();
		const applicant = await createSignedInClient('Ana Silva');
		const applicationId = await addApplication(applicant.supabase, conferenceId, {
			committeePreferences: [committeeId]
		});
		await supabase.rpc('accept_application', { application_id: applicationId, seat_id: seatId });

		const other = await createOpenSeat();

		const { error } = await supabase.rpc('move_delegate', {
			from_seat_id: seatId,
			to_seat_id: other.seatId
		});
		expect(error?.message).toContain('not part of this conference');
	});

	// Moving a delegation's member is only allowed into another seat held for
	// the same delegation (`canMoveInto` in src/lib/allocation.ts), because
	// `move_delegate` leaves `delegation_id` where it is. The database allows it
	// only because the function empties the old seat in one statement before it
	// fills the new one, so rule 1 of `check_seat_allocation`, one seat per person
	// per conference, never sees the member in two seats at once. Nothing else
	// moves a real delegation's member, so this is what would notice either
	// function starting to refuse the one move the grid offers them.
	it("moves a delegation's member into another seat held for their delegation", async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const {
			committeeId,
			seatId: fromSeatId,
			delegationId,
			head
		} = await createReservedSeatForNewDelegation(fixture);
		const toSeatId = await addSeat(fixture.supabase, committeeId, 'Japan', 'JP');
		const { error: allocationError } = await fixture.supabase.rpc('allocate_delegation_seats', {
			delegation_id: delegationId,
			seat_ids: [toSeatId]
		});
		expect(allocationError).toBeNull();

		const member = await joinDelegation(fixture, delegationId, head);
		await head.supabase.from('seats').update({ user_id: member.userId }).eq('id', fromSeatId);

		// The grid would offer this move: without it the test could pass on a move
		// the page never lets an organiser make.
		const fromSeat = await readGridSeat(fixture, fromSeatId);
		const toSeat = await readGridSeat(fixture, toSeatId);
		expect(canMoveInto(fromSeat, toSeat)).toBe(true);

		const { error } = await fixture.supabase.rpc('move_delegate', {
			from_seat_id: fromSeatId,
			to_seat_id: toSeatId
		});
		expect(error).toBeNull();

		// Both seats stay reserved for the delegation; only the person moved.
		const { data: seats } = await fixture.supabase
			.from('seats')
			.select('id, user_id, delegation_id')
			.in('id', [fromSeatId, toSeatId]);
		const oldSeat = seats?.find((seat) => seat.id === fromSeatId);
		const newSeat = seats?.find((seat) => seat.id === toSeatId);
		expect(oldSeat).toEqual({ id: fromSeatId, user_id: null, delegation_id: delegationId });
		expect(newSeat).toEqual({ id: toSeatId, user_id: member.userId, delegation_id: delegationId });
	});
});

describe('allocate_delegation_seats', () => {
	it('reserves every seat in the list and accepts a submitted delegation', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
		const seatOne = await addSeat(fixture.supabase, committeeId, 'France', 'FR');
		const seatTwo = await addSeat(fixture.supabase, committeeId, 'Japan', 'JP');
		const head = await createSignedInClient('Amelie Dubois');
		const delegationId = await addDelegation(head.supabase, fixture.conferenceId);
		await head.supabase.from('delegations').update({ status: 'submitted' }).eq('id', delegationId);

		const { error } = await fixture.supabase.rpc('allocate_delegation_seats', {
			delegation_id: delegationId,
			seat_ids: [seatOne, seatTwo]
		});
		expect(error).toBeNull();

		const { data: seats } = await fixture.supabase
			.from('seats')
			.select('id, delegation_id, allocated_at')
			.in('id', [seatOne, seatTwo]);
		expect(seats?.every((seat) => seat.delegation_id === delegationId)).toBe(true);
		expect(seats?.every((seat) => seat.allocated_at !== null)).toBe(true);

		const { data: delegation } = await fixture.supabase
			.from('delegations')
			.select('status, decided_at, decided_by')
			.eq('id', delegationId)
			.single();
		expect(delegation?.status).toBe('accepted');
		expect(delegation?.decided_at).not.toBeNull();
		expect(delegation?.decided_by).toBe(fixture.userId);
	});

	it('refuses somebody who does not run the conference', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
		const seatId = await addSeat(fixture.supabase, committeeId, 'France', 'FR');
		const head = await createSignedInClient('Amelie Dubois');
		const delegationId = await addDelegation(head.supabase, fixture.conferenceId);
		const stranger = await createSignedInClient();

		const { error } = await stranger.supabase.rpc('allocate_delegation_seats', {
			delegation_id: delegationId,
			seat_ids: [seatId]
		});
		expect(error?.message).toContain('Only the organisers');
	});

	it('refuses the whole list when one seat in it is hidden, and changes nothing', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
		const freeSeatId = await addSeat(fixture.supabase, committeeId, 'France', 'FR');
		const hiddenSeatId = await addSeat(fixture.supabase, committeeId, 'Japan', 'JP');
		await fixture.supabase.from('seats').update({ is_available: false }).eq('id', hiddenSeatId);
		const head = await createSignedInClient('Amelie Dubois');
		const delegationId = await addDelegation(head.supabase, fixture.conferenceId);

		const { error } = await fixture.supabase.rpc('allocate_delegation_seats', {
			delegation_id: delegationId,
			seat_ids: [freeSeatId, hiddenSeatId]
		});
		expect(error?.message).toContain('taken, hidden');

		// The good seat in the same call was left alone, proving the refusal is
		// for the whole list and not just the bad seat in it.
		const { data: seat } = await fixture.supabase
			.from('seats')
			.select('delegation_id')
			.eq('id', freeSeatId)
			.single();
		expect(seat?.delegation_id).toBeNull();
	});
});

describe('remove_delegation_seat', () => {
	it('gives an unassigned reserved seat back', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const { seatId } = await createReservedSeatForNewDelegation(fixture);

		const { error } = await fixture.supabase.rpc('remove_delegation_seat', { seat_id: seatId });
		expect(error).toBeNull();

		const { data: seat } = await fixture.supabase
			.from('seats')
			.select('delegation_id, allocated_at')
			.eq('id', seatId)
			.single();
		expect(seat).toEqual({ delegation_id: null, allocated_at: null });
	});

	it('refuses somebody who does not run the conference', async () => {
		const { seatId } = await createOpenSeat();
		const stranger = await createSignedInClient();

		const { error } = await stranger.supabase.rpc('remove_delegation_seat', { seat_id: seatId });
		expect(error?.message).toContain('Only the organisers');
	});

	it('refuses a seat that was never reserved for a delegation', async () => {
		const { supabase, seatId } = await createOpenSeat();

		const { error } = await supabase.rpc('remove_delegation_seat', { seat_id: seatId });
		expect(error?.message).toContain('not reserved for a delegation');
	});

	it('refuses a reserved seat somebody is already sitting in', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const { seatId, delegationId, head } = await createReservedSeatForNewDelegation(fixture);
		const member = await joinDelegation(fixture, delegationId, head);
		await head.supabase.from('seats').update({ user_id: member.userId }).eq('id', seatId);

		const { error } = await fixture.supabase.rpc('remove_delegation_seat', { seat_id: seatId });
		expect(error?.message).toContain('Revoke it instead');
	});
});

describe('revoke_seat', () => {
	it('empties a seat won by an individual application, and rejects that application', async () => {
		const { supabase, conferenceId, committeeId, seatId } = await createOpenSeat();
		const applicant = await createSignedInClient('Ana Silva');
		const applicationId = await addApplication(applicant.supabase, conferenceId, {
			committeePreferences: [committeeId]
		});
		await supabase.rpc('accept_application', { application_id: applicationId, seat_id: seatId });

		const { error } = await supabase.rpc('revoke_seat', { seat_id: seatId });
		expect(error).toBeNull();

		const { data: seat } = await supabase
			.from('seats')
			.select('user_id, application_id, allocated_at')
			.eq('id', seatId)
			.single();
		expect(seat).toEqual({ user_id: null, application_id: null, allocated_at: null });

		const { data: application } = await supabase
			.from('applications')
			.select('status, decided_at')
			.eq('id', applicationId)
			.single();
		expect(application?.status).toBe('rejected');
		expect(application?.decided_at).not.toBeNull();
	});

	it('empties a delegation seat but keeps the reservation', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const { seatId, delegationId, head } = await createReservedSeatForNewDelegation(fixture);
		const member = await joinDelegation(fixture, delegationId, head);
		await head.supabase.from('seats').update({ user_id: member.userId }).eq('id', seatId);

		const { error } = await fixture.supabase.rpc('revoke_seat', { seat_id: seatId });
		expect(error).toBeNull();

		const { data: seat } = await fixture.supabase
			.from('seats')
			.select('user_id, application_id, allocated_at, delegation_id')
			.eq('id', seatId)
			.single();
		// The point of this test: delegation_id survives, because the group still
		// paid for the seat and the head can put somebody else in it. And with it
		// allocated_at, which data-model.md calls "when user_id or delegation_id
		// was last set" — the delegation_id is still set, so the moment stands.
		expect(seat?.user_id).toBeNull();
		expect(seat?.application_id).toBeNull();
		expect(seat?.delegation_id).toBe(delegationId);
		expect(seat?.allocated_at).not.toBeNull();
	});

	it('refuses somebody who does not run the conference', async () => {
		const { seatId } = await createOpenSeat();
		const stranger = await createSignedInClient();

		const { error } = await stranger.supabase.rpc('revoke_seat', { seat_id: seatId });
		expect(error?.message).toContain('Only the organisers');
	});

	it('refuses an empty seat', async () => {
		const { supabase, seatId } = await createOpenSeat();

		const { error } = await supabase.rpc('revoke_seat', { seat_id: seatId });
		expect(error?.message).toContain('Nobody is sitting in that seat');
	});
});

// The note is not written by `revoke_seat`, which writes none, but by the app,
// one statement later, in `freeSeat` in src/lib/server/allocation-grid.ts. That second
// write's failure is logged and swallowed on purpose, and an update the
// `applications` policy refuses fails with no error at all, just no rows. So
// the only way to know the note arrived is to call the real `freeSeat` against
// the real database and read the application back.
describe('freeSeat', () => {
	it('rejects the application with the note "Seat released by the organisers"', async () => {
		const openSeat = await createOpenSeat();
		const { supabase, conferenceId, committeeId, seatId } = openSeat;
		const applicant = await createSignedInClient('Ana Silva');
		const applicationId = await addApplication(applicant.supabase, conferenceId, {
			committeePreferences: [committeeId]
		});
		await supabase.rpc('accept_application', { application_id: applicationId, seat_id: seatId });

		const seat = await readGridSeat(openSeat, seatId);
		await freeSeat(supabase, seat);

		const { data: application } = await supabase
			.from('applications')
			.select('status, decision_note')
			.eq('id', applicationId)
			.single();
		expect(application).toEqual({
			status: 'rejected',
			decision_note: 'Seat released by the organisers'
		});
	});
});

describe('check_seat_allocation', () => {
	it('still refuses a second seat in the same conference, now that delegates arrive by two routes', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const {
			seatId: reservedSeatId,
			delegationId,
			head
		} = await createReservedSeatForNewDelegation(fixture);
		const member = await joinDelegation(fixture, delegationId, head);
		await head.supabase.from('seats').update({ user_id: member.userId }).eq('id', reservedSeatId);

		const otherCommitteeId = await addCommittee(
			fixture.supabase,
			fixture.conferenceId,
			'Human Rights Council'
		);
		const otherSeatId = await addSeat(fixture.supabase, otherCommitteeId, 'Brazil', 'BR');

		// No browser role may write user_id any more (protect_seats_columns,
		// migration 20261022110000), so the trigger's own rule is reached the way
		// the allocation functions reach it: as the tables' owner.
		const { error } = await createServiceRoleClient()
			.from('seats')
			.update({ user_id: member.userId })
			.eq('id', otherSeatId);

		expect(error?.message).toContain('already has a seat in this conference');
	});

	it('refuses an application_id that belongs to another conference', async () => {
		const conferenceA = await createOpenSeat();
		const conferenceB = await createOpenSeat();
		const applicant = await createSignedInClient('Ana Silva');
		const applicationInB = await addApplication(applicant.supabase, conferenceB.conferenceId, {
			committeePreferences: [conferenceB.committeeId]
		});

		// A browser may no longer write application_id at all (protect_seats_columns),
		// so the rule is reached as the allocation functions reach it: as the
		// tables' owner, whom only the trigger can turn away.
		const { error } = await createServiceRoleClient()
			.from('seats')
			.update({ application_id: applicationInB })
			.eq('id', conferenceA.seatId);

		expect(error?.message).toContain('not for this conference');
	});

	it('refuses a delegation_id that belongs to another conference', async () => {
		const conferenceA = await createOpenSeat();
		const conferenceB = await createOpenSeat();
		const head = await createSignedInClient('Amelie Dubois');
		const delegationInB = await addDelegation(head.supabase, conferenceB.conferenceId);

		// The twin of the application_id rule above, and for the same reason: a
		// seat reserved for a group at another conference would put that group on
		// this organiser's allocation grid.
		const { error } = await createServiceRoleClient()
			.from('seats')
			.update({ delegation_id: delegationInB })
			.eq('id', conferenceA.seatId);

		expect(error?.message).toContain('not for this conference');
	});

	it('refuses a stranger on a seat reserved for a delegation', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const { seatId } = await createReservedSeatForNewDelegation(fixture);
		const stranger = await createSignedInClient('A Stranger');

		// Rule 3 holds for every writer, so it is asked as the tables' owner; a
		// browser is turned away before it by protect_seats_columns.
		const { error } = await createServiceRoleClient()
			.from('seats')
			.update({ user_id: stranger.userId })
			.eq('id', seatId);

		expect(error?.message).toContain('not a member of the delegation');
	});

	it('allows a member of the delegation on their own reserved seat', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const { seatId, delegationId, head } = await createReservedSeatForNewDelegation(fixture);
		const member = await joinDelegation(fixture, delegationId, head);

		// As the tables' owner, the way allocate_delegation_seats and move_delegate
		// write; the organiser's own client may not write user_id any more.
		const { error } = await createServiceRoleClient()
			.from('seats')
			.update({ user_id: member.userId })
			.eq('id', seatId);

		expect(error).toBeNull();
	});

	it('lets a head seat a member of their own delegation', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const { seatId, delegationId, head } = await createReservedSeatForNewDelegation(fixture);
		const member = await joinDelegation(fixture, delegationId, head);

		const { error } = await head.supabase
			.from('seats')
			.update({ user_id: member.userId })
			.eq('id', seatId);
		expect(error).toBeNull();

		const { data: seat } = await fixture.supabase
			.from('seats')
			.select('user_id')
			.eq('id', seatId)
			.single();
		expect(seat?.user_id).toBe(member.userId);
	});

	it('lets a head unassign a member, by writing user_id back to null', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const { seatId, delegationId, head } = await createReservedSeatForNewDelegation(fixture);
		const member = await joinDelegation(fixture, delegationId, head);
		await head.supabase.from('seats').update({ user_id: member.userId }).eq('id', seatId);

		const { error } = await head.supabase.from('seats').update({ user_id: null }).eq('id', seatId);
		expect(error).toBeNull();

		const { data: seat } = await fixture.supabase
			.from('seats')
			.select('user_id')
			.eq('id', seatId)
			.single();
		expect(seat?.user_id).toBeNull();
	});

	it('refuses a head who tries to change anything but user_id on their own reserved seat', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const { seatId, head } = await createReservedSeatForNewDelegation(fixture);

		// The head's row is their own reserved seat, so this is not blocked by
		// the update policy the way "another delegation's seat" is below. It is
		// check_seat_allocation itself that raises, which is why this is an
		// error rather than an empty `data`.
		const { error } = await head.supabase
			.from('seats')
			.update({ name: 'Chairs choice' })
			.eq('id', seatId);
		expect(error?.message).toContain('only seat and unseat their own members');

		const { data: seat } = await fixture.supabase
			.from('seats')
			.select('name')
			.eq('id', seatId)
			.single();
		expect(seat?.name).toBe('France');
	});

	it('refuses a head who backdates allocated_at or created_at on their own reserved seat', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const { seatId, head } = await createReservedSeatForNewDelegation(fixture);
		const longAgo = '2000-01-01T00:00:00.000Z';

		// These two were missing from the trigger's first, hand-written list of
		// columns a head may not touch, which is why the rule is now written the
		// other way round: everything but `user_id` has to come back unchanged.
		const { error: allocatedError } = await head.supabase
			.from('seats')
			.update({ allocated_at: longAgo })
			.eq('id', seatId);

		// protect_seats_columns runs before check_seat_allocation and refuses the
		// allocated_at write first; created_at below is still the latter's to refuse.
		expect(allocatedError?.message).toContain('allocation functions');

		const { error: createdError } = await head.supabase
			.from('seats')
			.update({ created_at: longAgo })
			.eq('id', seatId);

		expect(createdError?.message).toContain('can only seat and unseat their own members');

		const { data: seat } = await fixture.supabase
			.from('seats')
			.select('allocated_at, created_at')
			.eq('id', seatId)
			.single();

		expect(seat?.allocated_at).not.toBe(longAgo);
		expect(seat?.created_at).not.toBe(longAgo);
	});

	it('stamps allocated_at itself when a head seats a member', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const { seatId, delegationId, head } = await createReservedSeatForNewDelegation(fixture);
		const member = await joinDelegation(fixture, delegationId, head);

		const { data: reserved } = await fixture.supabase
			.from('seats')
			.select('allocated_at')
			.eq('id', seatId)
			.single();

		await head.supabase.from('seats').update({ user_id: member.userId }).eq('id', seatId);

		const { data: filled } = await fixture.supabase
			.from('seats')
			.select('allocated_at')
			.eq('id', seatId)
			.single();

		// A head may not write the column, so the trigger writes it for them:
		// data-model.md calls it "when user_id or delegation_id was last set".
		expect(filled?.allocated_at).not.toBe(reserved?.allocated_at);
		expect(filled?.allocated_at).not.toBeNull();
	});

	it('refuses a head who reaches for a seat reserved for another delegation', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		// The second delegation is registered first, because create_delegation
		// needs a published conference and the helper below archives it.
		const otherHead = await createSignedInClient('Someone Else');
		await addDelegation(otherHead.supabase, fixture.conferenceId, 'Another Delegation');
		const { seatId } = await createReservedSeatForNewDelegation(fixture);

		const { data } = await otherHead.supabase
			.from('seats')
			.update({ user_id: otherHead.userId })
			.eq('id', seatId)
			.select('user_id');

		expect(data).toEqual([]);
	});

	it('refuses a head once the conference has started', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const { seatId, delegationId, head } = await createReservedSeatForNewDelegation(fixture);
		const member = await joinDelegation(fixture, delegationId, head);

		// The organiser sets the conference to start today, the way it will have
		// by the morning of the first session.
		await fixture.supabase
			.from('conferences')
			.update({ start_date: new Date().toISOString().slice(0, 10) })
			.eq('id', fixture.conferenceId);

		// check_seat_allocation is what raises here, not the update policy, which
		// is why this is an error rather than an empty `data`: the head is still
		// writing their own delegation's seat, just too late.
		const { error } = await head.supabase
			.from('seats')
			.update({ user_id: member.userId })
			.eq('id', seatId);
		expect(error?.message).toContain('The conference has started');

		const { data: seat } = await fixture.supabase
			.from('seats')
			.select('user_id')
			.eq('id', seatId)
			.single();
		expect(seat?.user_id).toBeNull();
	});

	// Acceptance criterion 3 of 05-pages/delegation/seats.md: "Assigning a member
	// who already holds a seat is refused by the database". The first test in this
	// block proves the same rule, but it writes the second seat as the organiser,
	// and the seats page's whole question is what a HEAD is refused: the head goes
	// through the narrow update the policy and the trigger leave them, so the rule
	// has to be proved on that path too.
	it('refuses a head who seats a member who already holds a seat in this conference', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const { seatId, delegationId, head } = await createReservedSeatForNewDelegation(fixture);
		const member = await joinDelegation(fixture, delegationId, head);
		await head.supabase.from('seats').update({ user_id: member.userId }).eq('id', seatId);

		// The second seat has to be reserved for the same delegation before the
		// head can reach it at all. Without the reservation the update policy would
		// turn the write away with no error and no rows, and the trigger's rule
		// would never be reached, so the test would pass for the wrong reason.
		const secondCommitteeId = await addCommittee(
			fixture.supabase,
			fixture.conferenceId,
			'Human Rights Council'
		);
		const secondSeatId = await addSeat(fixture.supabase, secondCommitteeId, 'Brazil', 'BR');
		const { error: allocationError } = await fixture.supabase.rpc('allocate_delegation_seats', {
			delegation_id: delegationId,
			seat_ids: [secondSeatId]
		});
		expect(allocationError).toBeNull();

		const { error } = await head.supabase
			.from('seats')
			.update({ user_id: member.userId })
			.eq('id', secondSeatId);

		expect(error?.message).toContain('already has a seat in this conference');
	});

	// The second half of acceptance criterion 5, "Unassign frees the seat and is
	// blocked from the conference start date", and the twin of the test above it:
	// that one proves a head may not seat anybody once the conference has started,
	// this one that they may not empty a seat either. The trigger reads "everything
	// but user_id has to come back unchanged" and then the date, so writing null is
	// as late as writing a name.
	it('refuses a head who unassigns once the conference has started', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const { seatId, delegationId, head } = await createReservedSeatForNewDelegation(fixture);
		const member = await joinDelegation(fixture, delegationId, head);

		// Seated while the dates are still in the future, which is the only time a
		// head may write a seat at all.
		await head.supabase.from('seats').update({ user_id: member.userId }).eq('id', seatId);

		await fixture.supabase
			.from('conferences')
			.update({ start_date: new Date().toISOString().slice(0, 10) })
			.eq('id', fixture.conferenceId);

		const { error } = await head.supabase.from('seats').update({ user_id: null }).eq('id', seatId);
		expect(error?.message).toContain('The conference has started');

		// Read back with the organiser's client, because the head's own read would
		// prove nothing about whether the write went through.
		const { data: seatAfter } = await fixture.supabase
			.from('seats')
			.select('user_id')
			.eq('id', seatId)
			.single();
		expect(seatAfter?.user_id).toBe(member.userId);
	});

	// Task T98. The seats page decides "has the conference started?" in the
	// conference's own timezone (canChangeDelegationSeats in $lib/delegations.ts),
	// and the trigger has to answer the same way, or for a few hours around
	// midnight the page would draw buttons the database refuses, or hide ones it
	// would allow. The two tests below use the two timezones furthest from UTC.
	// Kiritimati is fourteen hours ahead of UTC and Pago Pago eleven hours behind,
	// so whatever the time of day, a trigger that still read the database
	// server's own date would fail at least one of them.
	it('refuses a head on the first day in the conference timezone, whatever the server date', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const { seatId, delegationId, head } = await createReservedSeatForNewDelegation(fixture);
		const member = await joinDelegation(fixture, delegationId, head);

		const KIRITIMATI = 'Pacific/Kiritimati';
		const { error: dateError } = await fixture.supabase
			.from('conferences')
			.update({ timezone: KIRITIMATI, start_date: dayInTimezone(new Date(), KIRITIMATI) })
			.eq('id', fixture.conferenceId);
		expect(dateError).toBeNull();

		const { error } = await head.supabase
			.from('seats')
			.update({ user_id: member.userId })
			.eq('id', seatId);
		expect(error?.message).toContain('The conference has started');
	});

	it('lets a head seat a member on the day before in the conference timezone', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const { seatId, delegationId, head } = await createReservedSeatForNewDelegation(fixture);
		const member = await joinDelegation(fixture, delegationId, head);

		// Pago Pago keeps no summer time, so "a day from now" is tomorrow there.
		const PAGO_PAGO = 'Pacific/Pago_Pago';
		const ONE_DAY_MS = 24 * 60 * 60 * 1000;
		const tomorrowInPagoPago = dayInTimezone(new Date(Date.now() + ONE_DAY_MS), PAGO_PAGO);
		const { error: dateError } = await fixture.supabase
			.from('conferences')
			.update({ timezone: PAGO_PAGO, start_date: tomorrowInPagoPago })
			.eq('id', fixture.conferenceId);
		expect(dateError).toBeNull();

		const { error } = await head.supabase
			.from('seats')
			.update({ user_id: member.userId })
			.eq('id', seatId);
		expect(error).toBeNull();

		const { data: seat } = await fixture.supabase
			.from('seats')
			.select('user_id')
			.eq('id', seatId)
			.single();
		expect(seat?.user_id).toBe(member.userId);
	});
});

describe('seats, reading the list as a participant', () => {
	it('lets a member of a sent delegation with no seat yet read the seat list, but not of a draft', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
		await addSeat(fixture.supabase, committeeId, 'France', 'FR');
		const head = await createSignedInClient('Amelie Dubois');
		const delegationId = await addDelegation(head.supabase, fixture.conferenceId);
		const member = await joinDelegation(fixture, delegationId, head);

		// A delegation the head has not sent yet is still private, the way a
		// draft application is, so being in it makes nobody a participant
		// (migration 20261022140000, security review M5).
		const { data: whileDraft } = await member.supabase
			.from('seats')
			.select('name')
			.eq('committee_id', committeeId);

		expect(whileDraft).toEqual([]);

		await head.supabase.from('delegations').update({ status: 'submitted' }).eq('id', delegationId);

		const { data } = await member.supabase
			.from('seats')
			.select('name')
			.eq('committee_id', committeeId);

		expect(data).toEqual([{ name: 'France' }]);
	});

	it('lets somebody with a submitted application read the seat list', async () => {
		const { conferenceId, committeeId } = await createOpenSeat();
		const applicant = await createSignedInClient('Ana Silva');
		await addApplication(applicant.supabase, conferenceId, { committeePreferences: [committeeId] });

		const { data } = await applicant.supabase
			.from('seats')
			.select('name')
			.eq('committee_id', committeeId);

		expect(data).toEqual([{ name: 'France' }]);
	});

	it('refuses somebody whose application is still a draft', async () => {
		const { conferenceId, committeeId } = await createOpenSeat();
		const applicant = await createSignedInClient('Ana Silva');
		await addApplication(applicant.supabase, conferenceId, { status: 'draft' });

		const { data } = await applicant.supabase
			.from('seats')
			.select('name')
			.eq('committee_id', committeeId);

		expect(data).toEqual([]);
	});

	it('refuses a signed-in stranger', async () => {
		const { committeeId } = await createOpenSeat();
		const stranger = await createSignedInClient();

		const { data } = await stranger.supabase
			.from('seats')
			.select('name')
			.eq('committee_id', committeeId);

		expect(data).toEqual([]);
	});
});

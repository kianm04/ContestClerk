import { describe, expect, it } from 'vitest';
import {
	createServiceRoleClient,
	createSignedInClient,
	createVisitorClient
} from './supabase-test-client';
import {
	addCommittee,
	addSeat,
	addStaff,
	createConferenceOwnedByMe,
	giveSeatTo
} from './conference-fixtures';

// The `seats` and `public_seats` rows of the policy matrix in
// specs/02-architecture/permissions.md, the `check_seat_allocation` trigger and
// the `is_committee_delegate` helper.
//
// The point the whole design turns on: `seats` carries `user_id`, and a policy
// can only decide which rows somebody reads, not which columns. So the table is
// for the people inside the conference, and everybody else reads the
// `public_seats` view, which has no `user_id` in it.

/** A published conference with one committee and one free seat in it. */
async function createPublishedSeat() {
	const fixture = await createConferenceOwnedByMe();
	const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
	const seatId = await addSeat(fixture.supabase, committeeId, 'France', 'FR');

	await fixture.supabase
		.from('conferences')
		.update({ status: 'published' })
		.eq('id', fixture.conferenceId);

	return { ...fixture, committeeId, seatId };
}

describe('seats, making the list', () => {
	it('lets an organiser add a seat and read it back', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(supabase, conferenceId);

		const { data, error } = await supabase
			.from('seats')
			.insert({ committee_id: committeeId, name: 'France', country_code: 'FR' })
			.select('name, kind, is_available');

		expect(error).toBeNull();
		expect(data).toEqual([{ name: 'France', kind: 'country', is_available: true }]);
	});

	it('refuses a seat from somebody who does not run the conference', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(supabase, conferenceId);
		const stranger = await createSignedInClient();

		const { error } = await stranger.supabase
			.from('seats')
			.insert({ committee_id: committeeId, name: 'France' });

		expect(error).not.toBeNull();
	});

	it('refuses the same seat name twice in one committee', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(supabase, conferenceId);
		await addSeat(supabase, committeeId, 'France', 'FR');

		const { error } = await supabase
			.from('seats')
			.insert({ committee_id: committeeId, name: 'France' });

		expect(error).not.toBeNull();
	});

	it('lets an organiser delete a free seat but not one somebody sits in', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(supabase, conferenceId);
		const freeSeatId = await addSeat(supabase, committeeId, 'France', 'FR');
		const takenSeatId = await addSeat(supabase, committeeId, 'Japan', 'JP');
		const delegate = await createSignedInClient();

		await giveSeatTo(supabase, takenSeatId, delegate.userId);

		await supabase.from('seats').delete().eq('id', freeSeatId);
		await supabase.from('seats').delete().eq('id', takenSeatId);

		const { data } = await supabase.from('seats').select('id').eq('committee_id', committeeId);

		expect(data).toEqual([{ id: takenSeatId }]);
	});

	it('refuses an allocation from anybody but an organiser', async () => {
		const { supabase, committeeId, seatId } = await createPublishedSeat();
		const chair = await createSignedInClient();
		const delegate = await createSignedInClient();

		// The chair of the committee and the delegate sitting in it can both read
		// the seat list. Neither of them decides who sits where.
		await supabase
			.from('committee_chairs')
			.insert({ committee_id: committeeId, user_id: chair.userId });
		await giveSeatTo(supabase, seatId, delegate.userId);

		const { data: byChair } = await chair.supabase
			.from('seats')
			.update({ name: 'Chairs choice' })
			.eq('id', seatId)
			.select('name');

		expect(byChair).toEqual([]);

		const { data: byDelegate } = await delegate.supabase
			.from('seats')
			.update({ name: 'My better seat' })
			.eq('id', seatId)
			.select('name');

		expect(byDelegate).toEqual([]);

		const { data: unchanged } = await supabase.from('seats').select('name').eq('id', seatId);

		expect(unchanged).toEqual([{ name: 'France' }]);
	});

	it('refuses a delegate who tries to take a free seat for themselves', async () => {
		const { supabase, committeeId, seatId } = await createPublishedSeat();
		const freeSeatId = await addSeat(supabase, committeeId, 'Japan', 'JP');
		const delegate = await createSignedInClient();

		await giveSeatTo(supabase, seatId, delegate.userId);

		await delegate.supabase.from('seats').update({ user_id: delegate.userId }).eq('id', freeSeatId);

		const { data } = await supabase.from('seats').select('user_id').eq('id', freeSeatId);

		expect(data).toEqual([{ user_id: null }]);
	});
});

describe('seats, reading the table', () => {
	it('lets the staff of a conference read the seat list', async () => {
		const { supabase, conferenceId, committeeId } = await createPublishedSeat();
		const volunteer = await createSignedInClient();

		await addStaff(supabase, conferenceId, volunteer.userId);

		const { data } = await volunteer.supabase
			.from('seats')
			.select('name')
			.eq('committee_id', committeeId);

		expect(data).toEqual([{ name: 'France' }]);
	});

	it('lets a delegate read the seat list of their own committee', async () => {
		const { supabase, committeeId, seatId } = await createPublishedSeat();
		const delegate = await createSignedInClient();

		await giveSeatTo(supabase, seatId, delegate.userId);

		const { data } = await delegate.supabase
			.from('seats')
			.select('name')
			.eq('committee_id', committeeId);

		expect(data).toEqual([{ name: 'France' }]);
	});

	it('shows a signed-in stranger nothing, even for a published conference', async () => {
		const { committeeId } = await createPublishedSeat();
		const stranger = await createSignedInClient();

		const { data } = await stranger.supabase
			.from('seats')
			.select('name')
			.eq('committee_id', committeeId);

		expect(data).toEqual([]);
	});

	it('shows a visitor nothing', async () => {
		const { committeeId } = await createPublishedSeat();

		const visitor = createVisitorClient();
		const { data } = await visitor.from('seats').select('name').eq('committee_id', committeeId);

		expect(data).toEqual([]);
	});
});

describe('public_seats', () => {
	it('shows a visitor the name and the flag of every seat of a published conference', async () => {
		const { committeeId } = await createPublishedSeat();

		const visitor = createVisitorClient();
		const { data, error } = await visitor
			.from('public_seats')
			.select('name, country_code, kind, is_taken')
			.eq('committee_id', committeeId);

		expect(error).toBeNull();
		expect(data).toEqual([
			{ name: 'France', country_code: 'FR', kind: 'country', is_taken: false }
		]);
	});

	it('says a seat is taken without saying by whom', async () => {
		const { supabase, committeeId, seatId } = await createPublishedSeat();
		const delegate = await createSignedInClient();

		await giveSeatTo(supabase, seatId, delegate.userId);

		const visitor = createVisitorClient();
		const { data } = await visitor
			.from('public_seats')
			.select('name, is_taken')
			.eq('committee_id', committeeId);

		expect(data).toEqual([{ name: 'France', is_taken: true }]);

		// There is no user_id to ask for. Asking anyway is an error, which is the
		// guarantee this view exists to give.
		const { error } = await visitor
			.from('public_seats')
			.select('user_id')
			.eq('committee_id', committeeId);

		expect(error).not.toBeNull();
	});

	it('leaves out a seat the organiser is not offering', async () => {
		const { supabase, committeeId, seatId } = await createPublishedSeat();

		await supabase.from('seats').update({ is_available: false }).eq('id', seatId);

		const visitor = createVisitorClient();
		const { data } = await visitor
			.from('public_seats')
			.select('name')
			.eq('committee_id', committeeId);

		expect(data).toEqual([]);
	});

	it('leaves out the seats of a conference that is still a draft', async () => {
		const { supabase, conferenceId, committeeId } = await createPublishedSeat();

		await supabase.from('conferences').update({ status: 'draft' }).eq('id', conferenceId);

		const visitor = createVisitorClient();
		const { data } = await visitor
			.from('public_seats')
			.select('name')
			.eq('committee_id', committeeId);

		expect(data).toEqual([]);
	});
});

describe('check_seat_allocation', () => {
	it('refuses a second seat in the same conference', async () => {
		const { supabase, conferenceId, seatId } = await createPublishedSeat();
		const otherCommitteeId = await addCommittee(supabase, conferenceId, 'Human Rights Council');
		const otherSeatId = await addSeat(supabase, otherCommitteeId, 'Japan', 'JP');
		const delegate = await createSignedInClient();

		await giveSeatTo(supabase, seatId, delegate.userId);

		// The second seat is offered the way the first was, through
		// accept_application, which is where the trigger turns it away.
		await expect(giveSeatTo(supabase, otherSeatId, delegate.userId)).rejects.toThrow(
			'already has a seat in this conference'
		);
	});

	it('allows the same person a seat at a different conference', async () => {
		const first = await createPublishedSeat();
		const delegate = await createSignedInClient();

		await giveSeatTo(first.supabase, first.seatId, delegate.userId);

		const second = await createPublishedSeat();

		await expect(
			giveSeatTo(second.supabase, second.seatId, delegate.userId)
		).resolves.toBeUndefined();
	});

	it('refuses a new seat that already has somebody in it who is seated elsewhere', async () => {
		const { supabase, conferenceId, seatId } = await createPublishedSeat();
		const otherCommitteeId = await addCommittee(supabase, conferenceId, 'Human Rights Council');
		const delegate = await createSignedInClient();

		await giveSeatTo(supabase, seatId, delegate.userId);

		// A browser may not insert a seat with somebody already in it
		// (protect_seats_columns), so the trigger's rule is reached as the tables'
		// owner, the only writer it can still turn away.
		const { error } = await createServiceRoleClient()
			.from('seats')
			.insert({ committee_id: otherCommitteeId, name: 'Japan', user_id: delegate.userId });

		expect(error?.message).toContain('already has a seat in this conference');
	});
});

describe('is_committee_delegate', () => {
	it('is true for the person sitting in the committee', async () => {
		const { supabase, committeeId, seatId } = await createPublishedSeat();
		const delegate = await createSignedInClient();

		await giveSeatTo(supabase, seatId, delegate.userId);

		const { data } = await delegate.supabase.rpc('is_committee_delegate', {
			committee_id: committeeId
		});

		expect(data).toBe(true);
	});

	it('is false for the organiser, who runs the committee but does not sit in it', async () => {
		const { supabase, committeeId } = await createPublishedSeat();

		const { data } = await supabase.rpc('is_committee_delegate', { committee_id: committeeId });

		expect(data).toBe(false);
	});
});

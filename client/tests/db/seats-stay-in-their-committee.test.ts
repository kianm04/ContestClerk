import { describe, expect, it } from 'vitest';
import { createServiceRoleClient, createSignedInClient } from './supabase-test-client';
import {
	addCommittee,
	addDelegation,
	addOrganizationMember,
	addSeat,
	createConferenceOwnedByMe,
	createOpenConferenceOwnedByMe,
	giveSeatTo,
	type ConferenceFixture
} from './conference-fixtures';

// What finding M4 of docs/security-review-2026-10-10.md left open once
// `protect_seats_columns` kept browsers off who sits in a seat, closed by
// migration 20261023120000_seats_stay_in_their_committee:
//
//   * a committee editor could move a seat, and the delegate in it, to another
//     committee, even one of another conference they edit;
//   * the seats delete policy let a seat held for a delegation go, because
//     nobody sits in it yet;
//   * `committee_has_delegates` let a committee go whose seats were all held,
//     and the cascade took the reservations with it;
//   * anybody signed in could call `committee_has_delegates` through the API,
//     and it locked a conference's seats for them.
//
// The locks `committee_has_delegates`, `remove_delegation_seat` and the
// `seats_hold_committee` trigger (`hold_committee_for_new_seat`) now take, and
// the order they take them in, need two transactions open at once, which
// these clients cannot hold: each request is its own. The migration says how
// they were shown by hand. The tests below check that the locks stop nobody
// they should not.

/** The seat as it is stored, read past Row Level Security so a refusal cannot hide it. */
async function storedSeat(seatId: string) {
	const { data, error } = await createServiceRoleClient()
		.from('seats')
		.select('committee_id, user_id, delegation_id, name, position')
		.eq('id', seatId)
		.maybeSingle();

	if (error) {
		throw new Error(`Could not read the seat back: ${error.message}`);
	}

	return data;
}

/** Whether the committee is still there, read past Row Level Security. */
async function committeeExists(committeeId: string): Promise<boolean> {
	const { data, error } = await createServiceRoleClient()
		.from('committees')
		.select('id')
		.eq('id', committeeId)
		.maybeSingle();

	if (error) {
		throw new Error(`Could not read the committee back: ${error.message}`);
	}

	return data !== null;
}

/**
 * One seat held for a new delegation through `allocate_delegation_seats`, the
 * way the organiser's review page reserves it, with nobody in it yet. The
 * conference is archived afterwards so it never shows in the public directory,
 * as the allocation tests do.
 */
async function reserveASeat(conference: ConferenceFixture) {
	const committeeId = await addCommittee(conference.supabase, conference.conferenceId);
	const seatId = await addSeat(conference.supabase, committeeId, 'France', 'FR');
	const head = await createSignedInClient('Amelie Dubois');
	const delegationId = await addDelegation(head.supabase, conference.conferenceId);

	await head.supabase.from('delegations').update({ status: 'submitted' }).eq('id', delegationId);

	const { error: allocateError } = await conference.supabase.rpc('allocate_delegation_seats', {
		delegation_id: delegationId,
		seat_ids: [seatId]
	});

	if (allocateError) {
		throw new Error(`Could not reserve the fixture seat: ${allocateError.message}`);
	}

	const { error: archiveError } = await conference.supabase
		.from('conferences')
		.update({ status: 'archived' })
		.eq('id', conference.conferenceId);

	if (archiveError) {
		throw new Error(`Could not archive the fixture conference: ${archiveError.message}`);
	}

	return { committeeId, seatId, delegationId };
}

describe('a seat stays in its committee', () => {
	it('refuses moving a filled seat, delegate and all, to another committee', async () => {
		const owner = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(owner.supabase, owner.conferenceId);
		const otherCommitteeId = await addCommittee(owner.supabase, owner.conferenceId, 'UNHRC');
		const seatId = await addSeat(owner.supabase, committeeId);
		const delegate = await createSignedInClient('Ana Silva');
		await giveSeatTo(owner.supabase, seatId, delegate.userId);

		const { error } = await owner.supabase
			.from('seats')
			.update({ committee_id: otherCommitteeId })
			.eq('id', seatId);

		expect(error?.message).toContain('stays in the committee');
		expect(await storedSeat(seatId)).toMatchObject({
			committee_id: committeeId,
			user_id: delegate.userId
		});
	});

	it('refuses moving a seat into a conference of the editor’s own', async () => {
		const owner = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(owner.supabase, owner.conferenceId);
		const seatId = await addSeat(owner.supabase, committeeId);
		// A second conference the same owner edits, in an organisation of their own.
		const elsewhere = await createConferenceOwnedByMe();
		const foreignCommitteeId = await addCommittee(elsewhere.supabase, elsewhere.conferenceId);
		await addOrganizationMember(elsewhere.organizationId, owner.userId, 'owner');

		const { error } = await owner.supabase
			.from('seats')
			.update({ committee_id: foreignCommitteeId })
			.eq('id', seatId);

		expect(error?.message).toContain('stays in the committee');
		expect((await storedSeat(seatId))?.committee_id).toBe(committeeId);
	});

	it('still lets an editor rename and reorder a seat', async () => {
		const owner = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(owner.supabase, owner.conferenceId);
		const seatId = await addSeat(owner.supabase, committeeId);

		const { error } = await owner.supabase
			.from('seats')
			.update({ name: 'French Republic', position: 7 })
			.eq('id', seatId);

		expect(error).toBeNull();
		expect(await storedSeat(seatId)).toMatchObject({ name: 'French Republic', position: 7 });
	});
});

describe('a reserved seat is not deleted', () => {
	it('keeps a seat held for a delegation, which nobody sits in yet', async () => {
		const owner = await createOpenConferenceOwnedByMe();
		const { seatId, delegationId } = await reserveASeat(owner);

		const { data, error } = await owner.supabase
			.from('seats')
			.delete()
			.eq('id', seatId)
			.select('id');

		// The policy hides the row, so the delete answers with nothing rather than an error.
		expect(error).toBeNull();
		expect(data).toEqual([]);
		expect((await storedSeat(seatId))?.delegation_id).toBe(delegationId);
	});

	it('still deletes a seat that is neither filled nor held', async () => {
		const owner = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(owner.supabase, owner.conferenceId);
		const seatId = await addSeat(owner.supabase, committeeId);

		const { data, error } = await owner.supabase
			.from('seats')
			.delete()
			.eq('id', seatId)
			.select('id');

		expect(error).toBeNull();
		expect(data).toEqual([{ id: seatId }]);
		expect(await storedSeat(seatId)).toBeNull();
	});
});

describe('nor is a committee with one', () => {
	it('keeps a committee whose only seat is held for a delegation, and lets it go once freed', async () => {
		const owner = await createOpenConferenceOwnedByMe();
		const { committeeId, seatId } = await reserveASeat(owner);

		const refused = await owner.supabase
			.from('committees')
			.delete()
			.eq('id', committeeId)
			.select('id');

		expect(refused.error).toBeNull();
		expect(refused.data).toEqual([]);
		expect(await committeeExists(committeeId)).toBe(true);
		expect(await storedSeat(seatId)).not.toBeNull();

		// Giving the seat back the way the review page does, which now holds the
		// delegation before the seat.
		const { error: freeError } = await owner.supabase.rpc('remove_delegation_seat', {
			seat_id: seatId
		});

		expect(freeError).toBeNull();

		const allowed = await owner.supabase
			.from('committees')
			.delete()
			.eq('id', committeeId)
			.select('id');

		expect(allowed.data).toEqual([{ id: committeeId }]);
		expect(await storedSeat(seatId)).toBeNull();
	});

	it('answers "it has delegates" to somebody who may not manage the committee', async () => {
		const owner = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(owner.supabase, owner.conferenceId);
		await addSeat(owner.supabase, committeeId);
		const stranger = await createSignedInClient('Kofi Mensah');

		// The answer that keeps a committee, given without locking anything, so a
		// stranger calling the function through the API cannot hold the seats.
		const asStranger = await stranger.supabase.rpc('committee_has_delegates', {
			committee_id: committeeId
		});
		const asOwner = await owner.supabase.rpc('committee_has_delegates', {
			committee_id: committeeId
		});

		expect(asStranger).toMatchObject({ data: true, error: null });
		expect(asOwner).toMatchObject({ data: false, error: null });
	});
});

describe('a seat being added waits for its committee', () => {
	// `seats_hold_committee` runs `hold_committee_for_new_seat` before each new
	// seat is written, so a delete of the committee cannot count its seats in
	// the meantime. These check it gets in nobody's way.
	it('still lets an editor change some seats and add others in one upsert, as a quick session does', async () => {
		const owner = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(owner.supabase, owner.conferenceId);
		const seatId = await addSeat(owner.supabase, committeeId);

		// A row with an id changes that seat; a row without one is a new seat,
		// and `defaultToNull: false` lets the database give it an id.
		const { data, error } = await owner.supabase
			.from('seats')
			.upsert(
				[
					{ id: seatId, committee_id: committeeId, name: 'France', position: 1 },
					{ committee_id: committeeId, name: 'Ghana', position: 2 }
				],
				{ onConflict: 'id', defaultToNull: false }
			)
			.select('name, position');

		expect(error).toBeNull();
		expect(data).toEqual([
			{ name: 'France', position: 1 },
			{ name: 'Ghana', position: 2 }
		]);
	});

	it('refuses a seat to somebody who may not manage the committee', async () => {
		const owner = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(owner.supabase, owner.conferenceId);
		const stranger = await createSignedInClient('Kofi Mensah');

		// The trigger's lock is on a number, so they hold nothing they could read
		// or change by it, and the insert policy refuses them a moment later.
		const { error } = await stranger.supabase
			.from('seats')
			.insert({ committee_id: committeeId, name: 'Ghana' });

		expect(error?.message).toContain('row-level security');

		const { count } = await createServiceRoleClient()
			.from('seats')
			.select('id', { count: 'exact', head: true })
			.eq('committee_id', committeeId);

		expect(count).toBe(0);
	});
});

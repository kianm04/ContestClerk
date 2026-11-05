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
	addRole,
	addSeat,
	createConferenceOwnedByMe,
	createOpenConferenceOwnedByMe,
	giveRole,
	giveSeatTo,
	type ConferenceFixture,
	whileTheConferenceIsJoinable
} from './conference-fixtures';

// Findings C4, M4, L19 and I23 of docs/security-review-2026-10-10.md, closed by
// migration 20261022110000_seats_private_details_guard.
//
// The chain the review found: anybody can create an organisation and own it, an
// owner holds every permission on its conferences, the `seats` policies let a
// `manage_committees` holder write any column, and `private_details_user_ids`
// counted any seat as taking part. So a fresh account could write a stranger's
// id into a seat of a draft conference of its own and read that stranger's
// email, phone, date of birth, dietary needs and emergency contact through
// `staff_contact_details` and `staff_welfare_details`.
//
// Now `protect_seats_columns`, run by the `seats_browser_column_guard` trigger,
// keeps `user_id`, `application_id`, `delegation_id` and `allocated_at` away from
// every browser role, with one exception for a delegation head filling their own
// delegation's seat, and the function counts a seat only when the person's own
// application or delegation stands behind it.

/** The two private-details views, by name, so a helper can take either. */
type PrivateView = 'staff_contact_details' | 'staff_welfare_details';

/** The user ids a view answers this reader with, about these people. */
async function idsInView(
	reader: SupabaseClient,
	view: PrivateView,
	userIds: string[]
): Promise<string[]> {
	const { data, error } = await reader.from(view).select('user_id').in('user_id', userIds);

	if (error) {
		throw new Error(`Could not read ${view}: ${error.message}`);
	}

	return (data ?? []).map((row) => row.user_id).sort();
}

/** The people a permission opens for this reader, straight from the function. */
async function privateIds(reader: SupabaseClient): Promise<string[]> {
	const { data, error } = await reader.rpc('private_details_user_ids', {
		permission: 'read_contact_details'
	});

	if (error) {
		throw new Error(`Could not call private_details_user_ids: ${error.message}`);
	}

	return data ?? [];
}

/** Everything a reader may learn about one person, asked three ways at once. */
async function knowsAbout(reader: SupabaseClient, userId: string): Promise<boolean> {
	const [contact, welfare, ids] = await Promise.all([
		idsInView(reader, 'staff_contact_details', [userId]),
		idsInView(reader, 'staff_welfare_details', [userId]),
		privateIds(reader)
	]);

	return contact.includes(userId) || welfare.includes(userId) || ids.includes(userId);
}

/** Who sits in a seat, read past Row Level Security so a refusal cannot hide it. */
async function holderOf(seatId: string): Promise<string | null> {
	const { data, error } = await createServiceRoleClient()
		.from('seats')
		.select('user_id')
		.eq('id', seatId)
		.single();

	if (error) {
		throw new Error(`Could not read the seat back: ${error.message}`);
	}

	return data.user_id;
}

/** A draft conference of a brand-new account, with one committee and one empty seat. */
async function createFreshOwnerWithASeat() {
	const owner = await createConferenceOwnedByMe();
	const committeeId = await addCommittee(owner.supabase, owner.conferenceId);
	const seatId = await addSeat(owner.supabase, committeeId, 'France', 'FR');
	const stranger = await createSignedInClient('A Stranger');

	return { ...owner, committeeId, seatId, stranger };
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

/**
 * A delegation at an open conference with one seat reserved for it, the way
 * `allocate_delegation_seats` leaves it, plus one member who joined with the
 * code. The conference is dated far ahead first, because a head may only seat
 * people before it starts and every fixture conference happened in 2020; it is
 * archived afterwards so it never shows in the public directory, as the
 * allocation tests do.
 */
async function createReservedDelegationSeat(conference: ConferenceFixture) {
	const { error: dateError } = await conference.supabase
		.from('conferences')
		.update({ start_date: '2099-01-01', end_date: '2099-01-03' })
		.eq('id', conference.conferenceId);

	if (dateError) {
		throw new Error(`Could not move the fixture conference's dates: ${dateError.message}`);
	}

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

	const { data: delegation } = await head.supabase
		.from('delegations')
		.select('join_code')
		.eq('id', delegationId)
		.single();
	const member = await createSignedInClient('Luca Rossi');
	const { error: joinError } = await whileTheConferenceIsJoinable(conference, () =>
		member.supabase.rpc('join_delegation', { code: delegation?.join_code })
	);

	if (joinError) {
		throw new Error(`Could not join the fixture delegation: ${joinError.message}`);
	}

	const { error: archiveError } = await conference.supabase
		.from('conferences')
		.update({ status: 'archived' })
		.eq('id', conference.conferenceId);

	if (archiveError) {
		throw new Error(`Could not archive the fixture conference: ${archiveError.message}`);
	}

	return { committeeId, seatId, delegationId, head, member };
}

describe('protect_seats_columns, the organiser side (C4, M4)', () => {
	it('refuses a fresh owner who inserts a seat with a stranger already in it', async () => {
		const { supabase, committeeId, stranger } = await createFreshOwnerWithASeat();

		const { error } = await supabase
			.from('seats')
			.insert({ committee_id: committeeId, name: 'Kenya', user_id: stranger.userId });

		expect(error?.message).toContain('allocation functions');
		expect(await knowsAbout(supabase, stranger.userId)).toBe(false);
	});

	it('refuses a fresh owner who writes a stranger into an empty seat', async () => {
		const { supabase, seatId, stranger } = await createFreshOwnerWithASeat();

		const { error } = await supabase
			.from('seats')
			.update({ user_id: stranger.userId })
			.eq('id', seatId);

		expect(error?.message).toContain('allocation functions');
		expect(await holderOf(seatId)).toBeNull();
		expect(await knowsAbout(supabase, stranger.userId)).toBe(false);
	});

	it('refuses an owner who writes application_id, delegation_id or allocated_at by hand', async () => {
		const owner = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(owner.supabase, owner.conferenceId);
		const seatId = await addSeat(owner.supabase, committeeId, 'France', 'FR');
		const applicant = await createSignedInClient('Ana Silva');
		const applicationId = await addApplication(applicant.supabase, owner.conferenceId, {
			committeePreferences: [committeeId]
		});
		const head = await createSignedInClient('Amelie Dubois');
		const delegationId = await addDelegation(head.supabase, owner.conferenceId);

		// Each one is a row of this very conference, so the only thing left to
		// refuse is that a browser wrote the column at all.
		const byHand = [
			{ application_id: applicationId },
			{ delegation_id: delegationId },
			{ allocated_at: new Date().toISOString() }
		];

		for (const write of byHand) {
			const { error } = await owner.supabase.from('seats').update(write).eq('id', seatId);

			expect(error?.message).toContain('allocation functions');
		}

		const { error: insertError } = await owner.supabase.from('seats').insert({
			committee_id: committeeId,
			name: 'Kenya',
			allocated_at: new Date().toISOString()
		});

		expect(insertError?.message).toContain('allocation functions');
	});

	it('lets accept_application seat an applicant, who then appears in both views', async () => {
		const owner = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(owner.supabase, owner.conferenceId);
		const seatId = await addSeat(owner.supabase, committeeId, 'France', 'FR');
		const applicant = await createSignedInClient('Ana Silva');
		const applicationId = await addApplication(applicant.supabase, owner.conferenceId, {
			committeePreferences: [committeeId]
		});

		const { error } = await owner.supabase.rpc('accept_application', {
			application_id: applicationId,
			seat_id: seatId
		});

		expect(error).toBeNull();
		expect(await holderOf(seatId)).toBe(applicant.userId);
		expect(await idsInView(owner.supabase, 'staff_contact_details', [applicant.userId])).toEqual([
			applicant.userId
		]);
		expect(await idsInView(owner.supabase, 'staff_welfare_details', [applicant.userId])).toEqual([
			applicant.userId
		]);
	});

	it('lets a manage_committees-only team member add, rename, reorder and delete an empty seat, but not fill it', async () => {
		const owner = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(owner.supabase, owner.conferenceId);
		const editor = await teamMemberWith(owner, ['manage_committees']);
		const stranger = await createSignedInClient('A Stranger');

		const { data: added, error: addError } = await editor.supabase
			.from('seats')
			.insert({ committee_id: committeeId, name: 'Kenya', country_code: 'KE' })
			.select('id')
			.single();

		expect(addError).toBeNull();

		const seatId = added?.id ?? '';
		const { error: renameError } = await editor.supabase
			.from('seats')
			.update({ name: 'Republic of Kenya' })
			.eq('id', seatId);
		const { error: reorderError } = await editor.supabase
			.from('seats')
			.update({ position: 7 })
			.eq('id', seatId);

		expect(renameError).toBeNull();
		expect(reorderError).toBeNull();

		const { error: fillError } = await editor.supabase
			.from('seats')
			.update({ user_id: stranger.userId })
			.eq('id', seatId);

		expect(fillError?.message).toContain('allocation functions');
		expect(await holderOf(seatId)).toBeNull();

		const { data: deleted, error: deleteError } = await editor.supabase
			.from('seats')
			.delete()
			.eq('id', seatId)
			.select('id');

		expect(deleteError).toBeNull();
		expect(deleted).toEqual([{ id: seatId }]);
	});
});

describe("protect_seats_columns, the delegation head's narrow write", () => {
	it("lets a head fill their own delegation's seat with a member and empty it again, and refuses a stranger", async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { seatId, head, member } = await createReservedDelegationSeat(conference);
		const stranger = await createSignedInClient('A Stranger');

		const { error: strangerError } = await head.supabase
			.from('seats')
			.update({ user_id: stranger.userId })
			.eq('id', seatId);

		expect(strangerError?.message).toContain('not a member of the delegation');
		expect(await holderOf(seatId)).toBeNull();

		const { data: filled, error: fillError } = await head.supabase
			.from('seats')
			.update({ user_id: member.userId })
			.eq('id', seatId)
			.select('id, user_id, allocated_at');

		expect(fillError).toBeNull();
		expect(filled?.[0]?.user_id).toBe(member.userId);
		// The head may not write allocated_at; check_seat_allocation stamps it.
		expect(filled?.[0]?.allocated_at).not.toBeNull();

		const { data: emptied, error: emptyError } = await head.supabase
			.from('seats')
			.update({ user_id: null })
			.eq('id', seatId)
			.select('id');

		expect(emptyError).toBeNull();
		expect(emptied).toEqual([{ id: seatId }]);
	});

	it('refuses the owner the same write on the reserved seat, even for a member', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { seatId, member } = await createReservedDelegationSeat(conference);

		// The organiser's way of putting a member in a reserved seat is the head's
		// page or move_delegate, never a column written by hand.
		const { error } = await conference.supabase
			.from('seats')
			.update({ user_id: member.userId })
			.eq('id', seatId);

		expect(error?.message).toContain('allocation functions');
		expect(await holderOf(seatId)).toBeNull();
	});
});

describe('private_details_user_ids, who a seat counts (C4, L19)', () => {
	it('leaves out a seat holder with neither an application nor a delegation behind the seat', async () => {
		const { supabase, seatId, stranger } = await createFreshOwnerWithASeat();

		// The service role writes the row the guard above refuses from a browser:
		// a person in a seat with nothing that says they ever asked to come. No
		// allocation function writes such a row, so this is the only way to get
		// one in front of the function.
		const { error } = await createServiceRoleClient()
			.from('seats')
			.update({ user_id: stranger.userId })
			.eq('id', seatId);

		if (error) {
			throw new Error(`Could not arrange the unlinked seat: ${error.message}`);
		}

		expect(await knowsAbout(supabase, stranger.userId)).toBe(false);
	});

	it('counts a seat that giveSeatTo filled, because a real application stands behind it', async () => {
		const { supabase, seatId, stranger: delegate } = await createFreshOwnerWithASeat();

		await giveSeatTo(supabase, seatId, delegate.userId);

		expect(await holderOf(seatId)).toBe(delegate.userId);
		expect(await knowsAbout(supabase, delegate.userId)).toBe(true);
	});

	it('drops an applicant once their application is withdrawn or rejected, and never lists a draft', async () => {
		const owner = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(owner.supabase, owner.conferenceId);
		const drafter = await createSignedInClient('Still Drafting');
		const rejected = await createSignedInClient('Turned Down');
		const withdrawn = await createSignedInClient('Changed Their Mind');

		await addApplication(drafter.supabase, owner.conferenceId, { status: 'draft' });
		const rejectedApplicationId = await addApplication(rejected.supabase, owner.conferenceId, {
			committeePreferences: [committeeId]
		});
		const withdrawnApplicationId = await addApplication(withdrawn.supabase, owner.conferenceId, {
			committeePreferences: [committeeId]
		});

		expect(await knowsAbout(owner.supabase, drafter.userId)).toBe(false);
		expect(await knowsAbout(owner.supabase, rejected.userId)).toBe(true);
		expect(await knowsAbout(owner.supabase, withdrawn.userId)).toBe(true);

		const { error: rejectError } = await owner.supabase
			.from('applications')
			.update({ status: 'rejected' })
			.eq('id', rejectedApplicationId);
		const { error: withdrawError } = await withdrawn.supabase
			.from('applications')
			.update({ status: 'withdrawn' })
			.eq('id', withdrawnApplicationId);

		expect(rejectError).toBeNull();
		expect(withdrawError).toBeNull();
		expect(await knowsAbout(owner.supabase, rejected.userId)).toBe(false);
		expect(await knowsAbout(owner.supabase, withdrawn.userId)).toBe(false);
	});

	it('drops the members of a delegation once it is withdrawn or rejected', async () => {
		const owner = await createOpenConferenceOwnedByMe();
		const withdrawingHead = await createSignedInClient('Withdrawing Head');
		const rejectedHead = await createSignedInClient('Rejected Head');
		const withdrawnDelegationId = await addDelegation(
			withdrawingHead.supabase,
			owner.conferenceId,
			'Leaving School'
		);
		const rejectedDelegationId = await addDelegation(
			rejectedHead.supabase,
			owner.conferenceId,
			'Turned Down School'
		);

		for (const delegationId of [withdrawnDelegationId, rejectedDelegationId]) {
			const head = delegationId === withdrawnDelegationId ? withdrawingHead : rejectedHead;
			await head.supabase
				.from('delegations')
				.update({ status: 'submitted' })
				.eq('id', delegationId);
		}

		expect(await knowsAbout(owner.supabase, withdrawingHead.userId)).toBe(true);
		expect(await knowsAbout(owner.supabase, rejectedHead.userId)).toBe(true);

		const { error: withdrawError } = await withdrawingHead.supabase
			.from('delegations')
			.update({ status: 'withdrawn' })
			.eq('id', withdrawnDelegationId);
		const { error: rejectError } = await owner.supabase
			.from('delegations')
			.update({ status: 'rejected' })
			.eq('id', rejectedDelegationId);

		expect(withdrawError).toBeNull();
		expect(rejectError).toBeNull();
		expect(await knowsAbout(owner.supabase, withdrawingHead.userId)).toBe(false);
		expect(await knowsAbout(owner.supabase, rejectedHead.userId)).toBe(false);
	});
});

describe('a delegation stays at the conference it was registered for (I23)', () => {
	it("refuses a head who moves their delegation, so its members never reach another conference's team", async () => {
		const home = await createOpenConferenceOwnedByMe();
		const elsewhere = await createOpenConferenceOwnedByMe();
		const head = await createSignedInClient('Amelie Dubois');
		const delegationId = await addDelegation(head.supabase, home.conferenceId);
		const { data: delegation } = await head.supabase
			.from('delegations')
			.select('join_code')
			.eq('id', delegationId)
			.single();
		const member = await createSignedInClient('Luca Rossi');
		const { error: joinError } = await whileTheConferenceIsJoinable(home, () =>
			member.supabase.rpc('join_delegation', { code: delegation?.join_code })
		);

		if (joinError) {
			throw new Error(`Could not join the fixture delegation: ${joinError.message}`);
		}

		expect(await knowsAbout(home.supabase, member.userId)).toBe(true);

		const { error } = await head.supabase
			.from('delegations')
			.update({ conference_id: elsewhere.conferenceId })
			.eq('id', delegationId);

		expect(error?.message).toContain('cannot be moved to another conference');

		// The other conference's owner has decide_applications there, and still
		// cannot pull the delegation across: the row is not theirs to see.
		const { data: pulled } = await elsewhere.supabase
			.from('delegations')
			.update({ conference_id: elsewhere.conferenceId })
			.eq('id', delegationId)
			.select('id');

		expect(pulled).toEqual([]);
		expect(await knowsAbout(elsewhere.supabase, head.userId)).toBe(false);
		expect(await knowsAbout(elsewhere.supabase, member.userId)).toBe(false);
		expect(await knowsAbout(home.supabase, member.userId)).toBe(true);
	});
});

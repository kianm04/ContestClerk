import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	createServiceRoleClient,
	createSignedInClient,
	createVisitorClient,
	type SignedInClient
} from './supabase-test-client';
import {
	addApplication,
	addCommittee,
	addDelegation,
	addFee,
	addSeat,
	createOpenConferenceOwnedByMe,
	giveSeatTo,
	type ConferenceFixture,
	whileTheConferenceIsJoinable
} from './conference-fixtures';

// Task T131: `swap_delegates`, which the allocation grid calls when an organiser
// drags one delegate onto another's seat, and the change it made to the
// `seats_clear_position_paper` trigger so that a swap keeps both papers.
//
// specs/06-features/allocation.md has the rule in words, under "Moving a
// delegate later".

/** Two individual delegates, each in a seat of a different committee, each owing an invoice. */
type TwoSeatedDelegates = ConferenceFixture & {
	franceSeatId: string;
	japanSeatId: string;
	securityCouncilId: string;
	humanRightsCouncilId: string;
	ana: SignedInClient;
	beatriz: SignedInClient;
	anaApplicationId: string;
	beatrizApplicationId: string;
};

/** One seat's delegate columns, as these tests read them back. */
type SeatHolder = { user_id: string | null; application_id: string | null };

/**
 * Builds that fixture. The fee is added first, so that `accept_application`
 * writes each delegate an unpaid invoice for their seat, which the swap has to
 * carry along with them.
 */
async function createTwoSeatedDelegates(): Promise<TwoSeatedDelegates> {
	const fixture = await createOpenConferenceOwnedByMe();
	await addFee(fixture.supabase, fixture.conferenceId);

	const securityCouncilId = await addCommittee(
		fixture.supabase,
		fixture.conferenceId,
		'Security Council'
	);
	const humanRightsCouncilId = await addCommittee(
		fixture.supabase,
		fixture.conferenceId,
		'Human Rights Council'
	);
	const franceSeatId = await addSeat(fixture.supabase, securityCouncilId, 'France', 'FR');
	const japanSeatId = await addSeat(fixture.supabase, humanRightsCouncilId, 'Japan', 'JP');

	const ana = await createSignedInClient('Ana Silva');
	const beatriz = await createSignedInClient('Beatriz Costa');
	const anaApplicationId = await addApplication(ana.supabase, fixture.conferenceId, {
		committeePreferences: [securityCouncilId]
	});
	const beatrizApplicationId = await addApplication(beatriz.supabase, fixture.conferenceId, {
		committeePreferences: [humanRightsCouncilId]
	});

	await acceptInto(fixture.supabase, anaApplicationId, franceSeatId);
	await acceptInto(fixture.supabase, beatrizApplicationId, japanSeatId);

	return {
		...fixture,
		franceSeatId,
		japanSeatId,
		securityCouncilId,
		humanRightsCouncilId,
		ana,
		beatriz,
		anaApplicationId,
		beatrizApplicationId
	};
}

/** Accepts an application into a seat, the way the applications page does. */
async function acceptInto(organiser: SupabaseClient, applicationId: string, seatId: string) {
	const { error } = await organiser.rpc('accept_application', {
		application_id: applicationId,
		seat_id: seatId
	});

	if (error) {
		throw new Error(`Could not accept the fixture application: ${error.message}`);
	}
}

/** Who sits in a seat now, and through which application. */
async function readHolder(organiser: SupabaseClient, seatId: string): Promise<SeatHolder> {
	const { data, error } = await organiser
		.from('seats')
		.select('user_id, application_id')
		.eq('id', seatId)
		.single();

	if (error || !data) {
		throw new Error(`Could not read the fixture seat: ${error?.message}`);
	}

	return data;
}

/**
 * A position paper for a seat, written with the service role so that the test
 * is about the swap and not about who may upload. `storage_path` is unique, so
 * it ends in a fresh uuid.
 */
async function addPositionPaper(
	conferenceId: string,
	committeeId: string,
	seatId: string,
	uploadedBy: string
): Promise<string> {
	const { data, error } = await createServiceRoleClient()
		.from('documents')
		.insert({
			conference_id: conferenceId,
			committee_id: committeeId,
			seat_id: seatId,
			uploaded_by: uploadedBy,
			kind: 'position_paper',
			title: 'Position paper',
			storage_path: `${conferenceId}/position-papers/${seatId}-${crypto.randomUUID()}.pdf`,
			file_name: 'position-paper.pdf',
			file_size_bytes: 120_000,
			mime_type: 'application/pdf',
			review_status: 'submitted'
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not add the fixture position paper: ${error?.message}`);
	}

	return data.id;
}

/**
 * A delegation holding two seats of one committee, with its head in one and a
 * member in the other. The organiser seats both, because the fixture
 * conference's dates are in the past and a head may only seat people before
 * the conference starts.
 */
async function createSeatedDelegation(fixture: ConferenceFixture) {
	const committeeId = await addCommittee(
		fixture.supabase,
		fixture.conferenceId,
		'General Assembly'
	);
	const peruSeatId = await addSeat(fixture.supabase, committeeId, 'Peru', 'PE');
	const kenyaSeatId = await addSeat(fixture.supabase, committeeId, 'Kenya', 'KE');
	const head = await createSignedInClient('Amelie Dubois');
	const delegationId = await addDelegation(head.supabase, fixture.conferenceId);

	await head.supabase.from('delegations').update({ status: 'submitted' }).eq('id', delegationId);

	const { error: allocateError } = await fixture.supabase.rpc('allocate_delegation_seats', {
		delegation_id: delegationId,
		seat_ids: [peruSeatId, kenyaSeatId]
	});

	if (allocateError) {
		throw new Error(`Could not reserve the fixture seats: ${allocateError.message}`);
	}

	const { data: delegation } = await head.supabase
		.from('delegations')
		.select('join_code')
		.eq('id', delegationId)
		.single();
	const member = await createSignedInClient('Luca Rossi');
	const { error: joinError } = await whileTheConferenceIsJoinable(fixture, () =>
		member.supabase.rpc('join_delegation', { code: delegation?.join_code })
	);

	if (joinError) {
		throw new Error(`Could not join the fixture delegation: ${joinError.message}`);
	}

	await giveSeatTo(fixture.supabase, peruSeatId, head.userId);
	await giveSeatTo(fixture.supabase, kenyaSeatId, member.userId);

	return { peruSeatId, kenyaSeatId, head, member };
}

describe('swap_delegates', () => {
	it('trades the two delegates and their applications', async () => {
		const fixture = await createTwoSeatedDelegates();

		const { error } = await fixture.supabase.rpc('swap_delegates', {
			first_seat_id: fixture.franceSeatId,
			second_seat_id: fixture.japanSeatId
		});
		expect(error).toBeNull();

		expect(await readHolder(fixture.supabase, fixture.franceSeatId)).toEqual({
			user_id: fixture.beatriz.userId,
			application_id: fixture.beatrizApplicationId
		});
		expect(await readHolder(fixture.supabase, fixture.japanSeatId)).toEqual({
			user_id: fixture.ana.userId,
			application_id: fixture.anaApplicationId
		});
	});

	it('carries each unpaid invoice to its delegate’s new seat', async () => {
		const fixture = await createTwoSeatedDelegates();

		await fixture.supabase.rpc('swap_delegates', {
			first_seat_id: fixture.franceSeatId,
			second_seat_id: fixture.japanSeatId
		});

		const { data } = await fixture.supabase
			.from('invoices')
			.select('payer_user_id, seat_id')
			.in('seat_id', [fixture.franceSeatId, fixture.japanSeatId]);

		expect(data).toHaveLength(2);
		expect(data).toContainEqual({
			payer_user_id: fixture.ana.userId,
			seat_id: fixture.japanSeatId
		});
		expect(data).toContainEqual({
			payer_user_id: fixture.beatriz.userId,
			seat_id: fixture.franceSeatId
		});
	});

	it('keeps both position papers, each with its delegate and their new committee', async () => {
		const fixture = await createTwoSeatedDelegates();
		const anaPaperId = await addPositionPaper(
			fixture.conferenceId,
			fixture.securityCouncilId,
			fixture.franceSeatId,
			fixture.ana.userId
		);
		const beatrizPaperId = await addPositionPaper(
			fixture.conferenceId,
			fixture.humanRightsCouncilId,
			fixture.japanSeatId,
			fixture.beatriz.userId
		);

		const { error } = await fixture.supabase.rpc('swap_delegates', {
			first_seat_id: fixture.franceSeatId,
			second_seat_id: fixture.japanSeatId
		});
		expect(error).toBeNull();

		const { data } = await createServiceRoleClient()
			.from('documents')
			.select('id, seat_id, committee_id')
			.in('id', [anaPaperId, beatrizPaperId]);

		expect(data).toHaveLength(2);
		expect(data).toContainEqual({
			id: anaPaperId,
			seat_id: fixture.japanSeatId,
			committee_id: fixture.humanRightsCouncilId
		});
		expect(data).toContainEqual({
			id: beatrizPaperId,
			seat_id: fixture.franceSeatId,
			committee_id: fixture.securityCouncilId
		});
	});

	it('leaves the paper trigger working for an ordinary unassignment afterwards', async () => {
		const fixture = await createTwoSeatedDelegates();
		await fixture.supabase.rpc('swap_delegates', {
			first_seat_id: fixture.franceSeatId,
			second_seat_id: fixture.japanSeatId
		});
		const paperId = await addPositionPaper(
			fixture.conferenceId,
			fixture.securityCouncilId,
			fixture.franceSeatId,
			fixture.beatriz.userId
		);

		// The flag the swap set lasted only as long as its own transaction. The
		// plain write that proves it is the service role's, because a browser may
		// no longer write user_id (protect_seats_columns).
		await createServiceRoleClient()
			.from('seats')
			.update({ user_id: null })
			.eq('id', fixture.franceSeatId);

		const { data } = await createServiceRoleClient()
			.from('documents')
			.select('id')
			.eq('id', paperId);
		expect(data).toEqual([]);
	});

	it('trades two members of the same delegation', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const delegation = await createSeatedDelegation(fixture);

		const { error } = await fixture.supabase.rpc('swap_delegates', {
			first_seat_id: delegation.peruSeatId,
			second_seat_id: delegation.kenyaSeatId
		});
		expect(error).toBeNull();

		expect((await readHolder(fixture.supabase, delegation.peruSeatId)).user_id).toBe(
			delegation.member.userId
		);
		expect((await readHolder(fixture.supabase, delegation.kenyaSeatId)).user_id).toBe(
			delegation.head.userId
		);
	});

	it('refuses to trade a delegation’s member with an individual', async () => {
		const fixture = await createTwoSeatedDelegates();
		const delegation = await createSeatedDelegation(fixture);

		const { error } = await fixture.supabase.rpc('swap_delegates', {
			first_seat_id: fixture.franceSeatId,
			second_seat_id: delegation.kenyaSeatId
		});
		expect(error?.message).toContain('Only delegates holding their seats the same way can swap');

		// Nothing moved.
		expect((await readHolder(fixture.supabase, fixture.franceSeatId)).user_id).toBe(
			fixture.ana.userId
		);
	});

	it('refuses a seat nobody sits in', async () => {
		const fixture = await createTwoSeatedDelegates();
		const emptySeatId = await addSeat(fixture.supabase, fixture.securityCouncilId, 'Brazil', 'BR');

		const { error } = await fixture.supabase.rpc('swap_delegates', {
			first_seat_id: fixture.franceSeatId,
			second_seat_id: emptySeatId
		});
		expect(error?.message).toContain('Nobody is sitting in that seat');
	});

	it('refuses a seat of another conference', async () => {
		const fixture = await createTwoSeatedDelegates();
		const other = await createTwoSeatedDelegates();

		const { error } = await fixture.supabase.rpc('swap_delegates', {
			first_seat_id: fixture.franceSeatId,
			second_seat_id: other.japanSeatId
		});
		expect(error?.message).toContain('That seat is not part of this conference');
	});

	it('refuses somebody who does not run the conference', async () => {
		const fixture = await createTwoSeatedDelegates();

		const { error } = await fixture.ana.supabase.rpc('swap_delegates', {
			first_seat_id: fixture.franceSeatId,
			second_seat_id: fixture.japanSeatId
		});
		expect(error?.message).toContain('Only the organisers');
	});

	it('cannot be called by a visitor who is not signed in', async () => {
		const fixture = await createTwoSeatedDelegates();

		const { error } = await createVisitorClient().rpc('swap_delegates', {
			first_seat_id: fixture.franceSeatId,
			second_seat_id: fixture.japanSeatId
		});
		expect(error).not.toBeNull();
	});
});

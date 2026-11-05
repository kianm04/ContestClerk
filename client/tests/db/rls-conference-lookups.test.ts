import { describe, expect, it } from 'vitest';
import { createSignedInClient } from './supabase-test-client';
import {
	addApplication,
	addCommittee,
	addSeat,
	addStaff,
	createConferenceOwnedByMe,
	createOpenConferenceOwnedByMe,
	giveSeatTo
} from './conference-fixtures';

// The set functions from the `rls_conference_lookups` migration (T122) and the
// three read rules rewritten on top of them. The rules must let exactly the
// same people read exactly the same rows as the per-row checks they replaced;
// seats.test.ts, committees-access.test.ts and conferences-access.test.ts
// cover the ordinary cases, and this file covers the edges of the rewrite.

/** A conference with one committee and one seat, still a draft. */
async function createDraftSeat() {
	const fixture = await createConferenceOwnedByMe();
	const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
	const seatId = await addSeat(fixture.supabase, committeeId, 'France', 'FR');

	return { ...fixture, committeeId, seatId };
}

describe('staff_conference_ids', () => {
	it('lists the conferences of my organisation and the ones I am on the team of', async () => {
		const owned = await createConferenceOwnedByMe();
		const other = await createConferenceOwnedByMe();
		await addStaff(other.supabase, other.conferenceId, owned.userId);

		const { data, error } = await owned.supabase.rpc('staff_conference_ids');

		expect(error).toBeNull();
		expect(data).toEqual(expect.arrayContaining([owned.conferenceId, other.conferenceId]));
	});

	it('lists nothing for somebody with no organisation and no team', async () => {
		await createConferenceOwnedByMe();
		const stranger = await createSignedInClient();

		const { data } = await stranger.supabase.rpc('staff_conference_ids');

		expect(data).toEqual([]);
	});
});

describe('participant_conference_ids', () => {
	it('lists a conference I sent an application to, but not one I only drafted for', async () => {
		const sent = await createOpenConferenceOwnedByMe();
		const drafted = await createOpenConferenceOwnedByMe();
		const sentCommitteeId = await addCommittee(sent.supabase, sent.conferenceId);
		const draftedCommitteeId = await addCommittee(drafted.supabase, drafted.conferenceId);
		const applicant = await createSignedInClient();
		await addApplication(applicant.supabase, sent.conferenceId, {
			committeePreferences: [sentCommitteeId]
		});
		await addApplication(applicant.supabase, drafted.conferenceId, {
			status: 'draft',
			committeePreferences: [draftedCommitteeId]
		});

		const { data } = await applicant.supabase.rpc('participant_conference_ids');

		expect(data).toEqual([sent.conferenceId]);
	});
});

describe('the rewritten read rules', () => {
	it('lets a volunteer read the seats and committees of a draft conference', async () => {
		const { supabase, conferenceId, committeeId, seatId } = await createDraftSeat();
		const volunteer = await createSignedInClient();
		await addStaff(supabase, conferenceId, volunteer.userId);

		const seats = await volunteer.supabase.from('seats').select('id');
		// Published conferences and their committees are open to everybody, so
		// these two ask about this draft conference only.
		const committees = await volunteer.supabase
			.from('committees')
			.select('id')
			.eq('conference_id', conferenceId);
		const conferences = await volunteer.supabase
			.from('conferences')
			.select('id')
			.eq('id', conferenceId);

		expect(seats.data).toEqual([{ id: seatId }]);
		expect(committees.data).toEqual([{ id: committeeId }]);
		expect(conferences.data).toEqual([{ id: conferenceId }]);
	});

	it('hides the seats of a draft conference from somebody sitting in one', async () => {
		const { supabase, seatId } = await createDraftSeat();
		const delegate = await createSignedInClient();
		await giveSeatTo(supabase, seatId, delegate.userId);

		const { data } = await delegate.supabase.from('seats').select('id');

		expect(data).toEqual([]);
	});

	it('shows the seats once that conference is published', async () => {
		const { supabase, conferenceId, seatId } = await createDraftSeat();
		const delegate = await createSignedInClient();
		await giveSeatTo(supabase, seatId, delegate.userId);
		await supabase.from('conferences').update({ status: 'published' }).eq('id', conferenceId);

		const { data } = await delegate.supabase.from('seats').select('id');

		expect(data).toEqual([{ id: seatId }]);
	});

	it('reads the seat list of one conference through the committees join the app uses', async () => {
		const { supabase, userId, conferenceId, seatId } = await createDraftSeat();
		// A second conference whose seats this organiser may also read, so the
		// filter on the join is what keeps its seat out of the answer.
		const elsewhere = await createDraftSeat();
		await addStaff(elsewhere.supabase, elsewhere.conferenceId, userId);

		const { data, error } = await supabase
			.from('seats')
			.select('id, committees!inner(conference_id)')
			.eq('committees.conference_id', conferenceId);

		expect(error).toBeNull();
		expect(data?.map((seat) => seat.id)).toEqual([seatId]);
	});
});

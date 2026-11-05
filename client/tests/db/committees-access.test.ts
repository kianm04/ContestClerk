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

// The `committees` rows of the policy matrix in
// specs/02-architecture/permissions.md, plus the `level` column and the
// `set_updated_at` trigger the table gained along the way.

describe('committees, reading them', () => {
	it('lets a visitor read the committees of a published conference', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(supabase, conferenceId, 'Security Council');

		await supabase.from('conferences').update({ status: 'published' }).eq('id', conferenceId);

		const visitor = createVisitorClient();
		const { data, error } = await visitor.from('committees').select('name').eq('id', committeeId);

		expect(error).toBeNull();
		expect(data).toEqual([{ name: 'Security Council' }]);
	});

	it('never shows a visitor the committees of a conference that is still a draft', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(supabase, conferenceId, 'Secret Council');

		const visitor = createVisitorClient();
		const { data } = await visitor.from('committees').select('name').eq('id', committeeId);

		expect(data).toEqual([]);
	});

	it('lets the staff of a conference read its committees while it is a draft', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(supabase, conferenceId, 'Draft Council');
		const volunteer = await createSignedInClient();

		await addStaff(supabase, conferenceId, volunteer.userId);

		const { data } = await volunteer.supabase
			.from('committees')
			.select('name')
			.eq('id', committeeId);

		expect(data).toEqual([{ name: 'Draft Council' }]);
	});
});

describe('committees, changing them', () => {
	it('lets an organiser add a committee and read the new row back', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();

		// `.select()` after an insert is the "insert ... returning" a page uses to
		// get the new id. It only works if a select policy passes for the new row.
		const { data, error } = await supabase
			.from('committees')
			.insert({
				conference_id: conferenceId,
				name: 'Human Rights Council',
				slug: `committee-${crypto.randomUUID()}`
			})
			.select('name, level');

		expect(error).toBeNull();
		expect(data).toEqual([{ name: 'Human Rights Council', level: 'intermediate' }]);
	});

	it('refuses a committee from somebody who has nothing to do with the conference', async () => {
		const { conferenceId } = await createConferenceOwnedByMe();
		const stranger = await createSignedInClient();

		const { error } = await stranger.supabase.from('committees').insert({
			conference_id: conferenceId,
			name: 'Gatecrashers',
			slug: `committee-${crypto.randomUUID()}`
		});

		expect(error).not.toBeNull();
	});

	it('lets an organiser rename a committee', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(supabase, conferenceId);

		const { data, error } = await supabase
			.from('committees')
			.update({ room: 'Committee Room 1' })
			.eq('id', committeeId)
			.select('room');

		expect(error).toBeNull();
		expect(data).toEqual([{ room: 'Committee Room 1' }]);
	});

	it('refuses a change from a chair, who runs the room but not the conference', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(supabase, conferenceId);
		const chair = await createSignedInClient();

		await supabase.from('committee_chairs').insert({
			committee_id: committeeId,
			user_id: chair.userId
		});

		const { data } = await chair.supabase
			.from('committees')
			.update({ room: 'Anywhere I like' })
			.eq('id', committeeId)
			.select('room');

		// A refused update is not an error: the policy hides the row, so nothing
		// matches and nothing changes.
		expect(data).toEqual([]);
	});
});

describe('committees, deleting them', () => {
	it('lets an organiser delete a committee nobody sits in', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(supabase, conferenceId);
		await addSeat(supabase, committeeId, 'France', 'FR');

		const { error } = await supabase.from('committees').delete().eq('id', committeeId);

		expect(error).toBeNull();

		const { data } = await supabase.from('committees').select('id').eq('id', committeeId);
		expect(data).toEqual([]);
	});

	it('refuses to delete a committee once somebody has a seat in it', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(supabase, conferenceId);
		const seatId = await addSeat(supabase, committeeId, 'France', 'FR');
		const delegate = await createSignedInClient();

		await giveSeatTo(supabase, seatId, delegate.userId);

		await supabase.from('committees').delete().eq('id', committeeId);

		const { data } = await supabase.from('committees').select('id').eq('id', committeeId);
		expect(data).toEqual([{ id: committeeId }]);
	});
});

describe('committees.level', () => {
	it("refuses 'none', which is a person's experience and never a committee's", async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();

		const { error } = await supabase.from('committees').insert({
			conference_id: conferenceId,
			name: 'No Level Council',
			slug: `committee-${crypto.randomUUID()}`,
			level: 'none'
		});

		expect(error?.message).toContain('committees_level_not_none');
	});
});

describe('committees_set_updated_at', () => {
	it('moves updated_at forward when a committee changes', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(supabase, conferenceId, 'Human Rights Council');
		const serviceRole = createServiceRoleClient();

		const { data: before } = await serviceRole
			.from('committees')
			.select('updated_at')
			.eq('id', committeeId)
			.single();

		await supabase.from('committees').update({ room: 'Room 1' }).eq('id', committeeId);

		const { data: after } = await serviceRole
			.from('committees')
			.select('updated_at')
			.eq('id', committeeId)
			.single();

		expect(new Date(after?.updated_at ?? '').getTime()).toBeGreaterThan(
			new Date(before?.updated_at ?? '').getTime()
		);
	});
});

describe('committees_protect_columns', () => {
	it('lets an organiser change an ordinary column of their own committee', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(supabase, conferenceId);

		const { data, error } = await supabase
			.from('committees')
			.update({ name: 'General Assembly' })
			.eq('id', committeeId)
			.select('name');

		// The trigger only ever looks at `conference_id`, so every other column of
		// the editor saves as it always did.
		expect(error).toBeNull();
		expect(data).toEqual([{ name: 'General Assembly' }]);
	});

	it("refuses to move a committee into the organiser's other conference", async () => {
		const { supabase, userId, organizationId, conferenceId } = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(supabase, conferenceId);

		// The second conference goes in through the same client and the same
		// organisation, because the point of this test is an organiser who runs
		// both: with two conferences in two different hands the update policy would
		// turn the change away on its own and the trigger would never run.
		const { data: otherConference, error: otherConferenceError } = await supabase
			.from('conferences')
			.insert({
				name: 'Fixture Conference Two',
				slug: `fixture-conference-two-${crypto.randomUUID()}`,
				city: 'Utrecht',
				country_code: 'NL',
				start_date: '2020-03-01',
				end_date: '2020-03-03',
				organization_id: organizationId,
				created_by: userId
			})
			.select('id')
			.single();

		expect(otherConferenceError).toBeNull();

		const { error } = await supabase
			.from('committees')
			.update({ conference_id: otherConference?.id })
			.eq('id', committeeId);

		// Moving the committee would carry its seats, and the delegates in them,
		// into a conference where nothing has asked whether those people already
		// hold a seat.
		expect(error?.message).toContain('A committee cannot be moved to another conference');
	});
});

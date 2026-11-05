import { describe, expect, it } from 'vitest';
import {
	createServiceRoleClient,
	createSignedInClient,
	createVisitorClient
} from './supabase-test-client';
import {
	addChair,
	addCommittee,
	addStaff,
	createConferenceOwnedByMe,
	presetRoleId
} from './conference-fixtures';

// The `committee_chairs` rows of the policy matrix in
// specs/02-architecture/permissions.md, the `ensure_chair_is_staff` trigger and
// `has_committee_permission(id, 'run_room')`.
//
// Since docs/roles-and-permissions.md a `committee_chairs` row is a committee
// assignment and grants nothing on its own: running the room takes the
// `run_room` permission, which the Chair preset holds in the committees its
// member is assigned to. `addChair` writes both; a bare insert here is a test
// about the assignment alone.
//
// Since the final security review a browser may assign to a committee only
// somebody already on the conference team, or itself
// (committee_chairs_already_on_team, finding L8), so the tests put the person
// on the team first with `joinTeam`, the way their invitation would have.

/**
 * Puts somebody on a conference's team with no role, the row accepting an
 * invitation writes. With the service role, because no browser may write a
 * staff row (see the top of conference-fixtures.ts).
 */
async function joinTeam(conferenceId: string, userId: string): Promise<void> {
	const { error } = await createServiceRoleClient()
		.from('conference_staff')
		.insert({ conference_id: conferenceId, user_id: userId });

	if (error) {
		throw new Error(`Could not put the fixture person on the team: ${error.message}`);
	}
}

describe('committee_chairs, putting somebody in charge', () => {
	it('lets an organiser make somebody a chair', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(supabase, conferenceId);
		const chair = await createSignedInClient();
		await joinTeam(conferenceId, chair.userId);

		const { data, error } = await supabase
			.from('committee_chairs')
			.insert({ committee_id: committeeId, user_id: chair.userId, title: 'Vice Chair' })
			.select('title');

		expect(error).toBeNull();
		expect(data).toEqual([{ title: 'Vice Chair' }]);
	});

	it('defaults the title to Chair', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(supabase, conferenceId);
		const chair = await createSignedInClient();
		await joinTeam(conferenceId, chair.userId);

		const { data } = await supabase
			.from('committee_chairs')
			.insert({ committee_id: committeeId, user_id: chair.userId })
			.select('title');

		expect(data).toEqual([{ title: 'Chair' }]);
	});

	it('refuses somebody who does not run the conference', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(supabase, conferenceId);
		const stranger = await createSignedInClient();

		const { error } = await stranger.supabase
			.from('committee_chairs')
			.insert({ committee_id: committeeId, user_id: stranger.userId });

		expect(error).not.toBeNull();
	});

	it('lets an organiser change a title and take a chair off again', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(supabase, conferenceId);
		const chair = await createSignedInClient();
		await joinTeam(conferenceId, chair.userId);

		await supabase
			.from('committee_chairs')
			.insert({ committee_id: committeeId, user_id: chair.userId });

		const { data: renamed } = await supabase
			.from('committee_chairs')
			.update({ title: 'Rapporteur' })
			.eq('committee_id', committeeId)
			.eq('user_id', chair.userId)
			.select('title');

		expect(renamed).toEqual([{ title: 'Rapporteur' }]);

		const { error } = await supabase
			.from('committee_chairs')
			.delete()
			.eq('committee_id', committeeId)
			.eq('user_id', chair.userId);

		expect(error).toBeNull();

		const { data: left } = await supabase
			.from('committee_chairs')
			.select('user_id')
			.eq('committee_id', committeeId);

		expect(left).toEqual([]);
	});

	it('refuses a chair who tries to rename or remove their own chair row', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(supabase, conferenceId);
		const chair = await createSignedInClient();

		await addChair(supabase, committeeId, chair.userId);

		// Running a committee is not running the conference. Assigning people to
		// committees takes manage_team, which the Chair role does not hold.
		const { data: renamed } = await chair.supabase
			.from('committee_chairs')
			.update({ title: 'Secretary General' })
			.eq('committee_id', committeeId)
			.eq('user_id', chair.userId)
			.select('title');

		expect(renamed).toEqual([]);

		await chair.supabase
			.from('committee_chairs')
			.delete()
			.eq('committee_id', committeeId)
			.eq('user_id', chair.userId);

		const { data: still } = await supabase
			.from('committee_chairs')
			.select('title')
			.eq('committee_id', committeeId);

		expect(still).toEqual([{ title: 'Chair' }]);
	});
});

describe('committee_chairs, reading them', () => {
	it('shows a visitor the chairs of a published conference, because the committee page names them', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(supabase, conferenceId);
		const chair = await createSignedInClient();
		await joinTeam(conferenceId, chair.userId);

		await supabase
			.from('committee_chairs')
			.insert({ committee_id: committeeId, user_id: chair.userId, title: 'Chair' });
		await supabase.from('conferences').update({ status: 'published' }).eq('id', conferenceId);

		const visitor = createVisitorClient();
		const { data, error } = await visitor
			.from('committee_chairs')
			.select('title')
			.eq('committee_id', committeeId);

		expect(error).toBeNull();
		expect(data).toEqual([{ title: 'Chair' }]);
	});

	it('hides the chairs of a conference that is still a draft', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(supabase, conferenceId);
		const chair = await createSignedInClient();
		await joinTeam(conferenceId, chair.userId);

		await supabase
			.from('committee_chairs')
			.insert({ committee_id: committeeId, user_id: chair.userId });

		const visitor = createVisitorClient();
		const { data } = await visitor
			.from('committee_chairs')
			.select('title')
			.eq('committee_id', committeeId);

		expect(data).toEqual([]);
	});
});

// A browser now assigns only somebody already on the team, or itself, so the
// trigger's work is the assignments the database writes as its own owner, such
// as accept_invite's. The service role stands in for those here.
describe('ensure_chair_is_staff', () => {
	it('puts a new chair on the conference team, with no role of their own', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(supabase, conferenceId);
		const chair = await createSignedInClient();

		await createServiceRoleClient()
			.from('committee_chairs')
			.insert({ committee_id: committeeId, user_id: chair.userId });

		const { data } = await supabase
			.from('conference_staff')
			.select('user_id')
			.eq('conference_id', conferenceId)
			.eq('user_id', chair.userId);

		expect(data).toEqual([{ user_id: chair.userId }]);

		// The assignment grants nothing by itself; the organiser gives the
		// person a role on the team page.
		const { data: roles } = await supabase
			.from('conference_role_members')
			.select('role_id')
			.eq('conference_id', conferenceId)
			.eq('user_id', chair.userId);

		expect(roles).toEqual([]);
	});

	it('leaves an existing staff row alone, so an organiser who chairs stays an organiser', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(supabase, conferenceId);
		const helper = await createSignedInClient();

		await addStaff(supabase, conferenceId, helper.userId, 'organiser');

		await supabase
			.from('committee_chairs')
			.insert({ committee_id: committeeId, user_id: helper.userId });

		const { data } = await supabase
			.from('conference_role_members')
			.select('role_id')
			.eq('conference_id', conferenceId)
			.eq('user_id', helper.userId);

		expect(data).toEqual([{ role_id: await presetRoleId(supabase, conferenceId, 'Organiser') }]);

		const { data: canManage } = await helper.supabase.rpc('has_permission', {
			conference_id: conferenceId,
			permission: 'administrator'
		});

		expect(canManage).toBe(true);
	});

	it('puts the new person on the team when a chair row is handed over', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(supabase, conferenceId);
		const first = await createSignedInClient();
		const second = await createSignedInClient();

		const service = createServiceRoleClient();

		await service
			.from('committee_chairs')
			.insert({ committee_id: committeeId, user_id: first.userId });

		// A chair row can change hands in place, and the trigger fires on that
		// update too.
		await service
			.from('committee_chairs')
			.update({ user_id: second.userId })
			.eq('committee_id', committeeId)
			.eq('user_id', first.userId);

		const { data } = await supabase
			.from('conference_staff')
			.select('user_id')
			.eq('conference_id', conferenceId)
			.eq('user_id', second.userId);

		expect(data).toEqual([{ user_id: second.userId }]);
	});

	it('puts a chair on the other team when their row is moved to another conference', async () => {
		const { supabase, organizationId, userId, conferenceId } = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(supabase, conferenceId);
		const chair = await createSignedInClient();

		// A second conference in the same organisation, so one organiser runs
		// both and the update policy lets them move the row between them.
		const { data: second } = await supabase
			.from('conferences')
			.insert({
				name: 'Second Conference',
				slug: `second-conference-${crypto.randomUUID()}`,
				city: 'Delft',
				country_code: 'NL',
				start_date: '2027-10-01',
				end_date: '2027-10-03',
				organization_id: organizationId,
				created_by: userId
			})
			.select('id')
			.single();

		const otherCommitteeId = await addCommittee(supabase, second?.id, 'Their Council');

		const service = createServiceRoleClient();

		await service
			.from('committee_chairs')
			.insert({ committee_id: committeeId, user_id: chair.userId });

		// Moving the row has to take a staff row with it. Without that, the person
		// chairs a committee of a conference they are not on the team of.
		await service
			.from('committee_chairs')
			.update({ committee_id: otherCommitteeId })
			.eq('committee_id', committeeId)
			.eq('user_id', chair.userId);

		const { data } = await supabase
			.from('conference_staff')
			.select('user_id')
			.eq('conference_id', second?.id)
			.eq('user_id', chair.userId);

		expect(data).toEqual([{ user_id: chair.userId }]);
	});
});

describe('committee_chairs_already_on_team', () => {
	it('refuses an organiser moving a chair to a conference whose team the chair is not on', async () => {
		const { supabase, organizationId, userId, conferenceId } = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(supabase, conferenceId);
		const chair = await createSignedInClient();
		await joinTeam(conferenceId, chair.userId);

		const { data: second } = await supabase
			.from('conferences')
			.insert({
				name: 'Second Conference',
				slug: `second-conference-${crypto.randomUUID()}`,
				city: 'Delft',
				country_code: 'NL',
				start_date: '2027-10-01',
				end_date: '2027-10-03',
				organization_id: organizationId,
				created_by: userId
			})
			.select('id')
			.single();

		const otherCommitteeId = await addCommittee(supabase, second?.id, 'Their Council');

		await supabase
			.from('committee_chairs')
			.insert({ committee_id: committeeId, user_id: chair.userId });

		// Moving the row would have put the chair on the second team, through
		// ensure_chair_is_staff, without an invitation.
		const { error } = await supabase
			.from('committee_chairs')
			.update({ committee_id: otherCommitteeId })
			.eq('committee_id', committeeId)
			.eq('user_id', chair.userId);

		expect(error?.code).toBe('42501');

		const { data: onSecondTeam } = await supabase
			.from('conference_staff')
			.select('user_id')
			.eq('conference_id', second?.id)
			.eq('user_id', chair.userId);

		expect(onSecondTeam).toEqual([]);

		// Being on that team too changes nothing: since migration
		// 20261022170200 a browser may change a chair row's title and no other
		// column, so a chair moves by being taken off one committee and put on
		// the other. The trigger above still stands behind that grant.
		await joinTeam(second?.id, chair.userId);
		const { error: moveError } = await supabase
			.from('committee_chairs')
			.update({ committee_id: otherCommitteeId })
			.eq('committee_id', committeeId)
			.eq('user_id', chair.userId);

		expect(moveError?.code).toBe('42501');
	});
});

describe('has_committee_permission run_room', () => {
	it('is true for a chair of the committee', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(supabase, conferenceId);
		const chair = await createSignedInClient();

		await addChair(supabase, committeeId, chair.userId);

		const { data } = await chair.supabase.rpc('has_committee_permission', {
			committee_id: committeeId,
			permission: 'run_room'
		});

		expect(data).toBe(true);
	});

	it('is false for somebody assigned to the committee who holds no role', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(supabase, conferenceId);
		const assigned = await createSignedInClient();
		await joinTeam(conferenceId, assigned.userId);

		// The assignment says where they work; the Chair role says what they may
		// do there. Without the role the room stays closed to them.
		await supabase
			.from('committee_chairs')
			.insert({ committee_id: committeeId, user_id: assigned.userId });

		const { data } = await assigned.supabase.rpc('has_committee_permission', {
			committee_id: committeeId,
			permission: 'run_room'
		});

		expect(data).toBe(false);
	});

	it('is false for a Chair in a committee they are not assigned to', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const theirCommittee = await addCommittee(supabase, conferenceId, 'Their Council');
		const otherCommittee = await addCommittee(supabase, conferenceId, 'Other Council');
		const chair = await createSignedInClient();

		await addChair(supabase, theirCommittee, chair.userId);

		const { data } = await chair.supabase.rpc('has_committee_permission', {
			committee_id: otherCommittee,
			permission: 'run_room'
		});

		expect(data).toBe(false);
	});

	it('is true for an organiser, who runs every committee of their conference', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(supabase, conferenceId);

		const { data } = await supabase.rpc('has_committee_permission', {
			committee_id: committeeId,
			permission: 'run_room'
		});

		expect(data).toBe(true);
	});

	it('is false for somebody with nothing to do with the committee', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(supabase, conferenceId);
		const stranger = await createSignedInClient();

		const { data } = await stranger.supabase.rpc('has_committee_permission', {
			committee_id: committeeId,
			permission: 'run_room'
		});

		expect(data).toBe(false);
	});
});

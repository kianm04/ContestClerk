import { describe, expect, it } from 'vitest';
import { createServiceRoleClient, createSignedInClient } from './supabase-test-client';
import {
	addOrganizationMember,
	addStaff,
	createConferenceOwnedByMe,
	giveRole,
	presetRoleId
} from './conference-fixtures';

// The `conference_staff` table and the permission helpers that decide who runs a
// conference: `has_permission(id, 'administrator')`, `is_conference_staff` and the
// `is_platform_admin` branch inside the first of them.
//
// Since docs/roles-and-permissions.md a staff row only says that somebody is on
// the team. What they may do is the roles they hold in `conference_role_members`,
// and the three preset roles every conference is made with (Organiser, Chair,
// Volunteer) stand for the three words the old enum held. The fixture owner runs
// the conference through their organisation (rule 4) and has no staff row of
// their own, so a test about "an organiser's own row" gives a second person the
// Organiser role and signs in as them.

describe('conference_staff, adding people', () => {
	it('refuses even an organiser putting somebody on the team directly: people join by invitation', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const chair = await createSignedInClient();

		// Since the security review (L8) no policy lets anybody insert here. A
		// staff row is written by accept_invite when an invitation is accepted
		// and by ensure_chair_is_staff when somebody is assigned to a committee,
		// both of which run as the database owner.
		const { error } = await supabase.from('conference_staff').insert({
			conference_id: conferenceId,
			user_id: chair.userId,
			title: 'Chair of the Security Council'
		});

		expect(error).not.toBeNull();
	});

	it('refuses somebody who has nothing to do with the conference', async () => {
		const { conferenceId } = await createConferenceOwnedByMe();
		const stranger = await createSignedInClient();

		const { error } = await stranger.supabase
			.from('conference_staff')
			.insert({ conference_id: conferenceId, user_id: stranger.userId });

		expect(error).not.toBeNull();
	});
});

describe('conference_staff, reading the team', () => {
	it('lets a volunteer see the whole team', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const volunteer = await createSignedInClient();
		const organiser = await createSignedInClient();

		await addStaff(supabase, conferenceId, volunteer.userId, 'volunteer');
		await addStaff(supabase, conferenceId, organiser.userId, 'organiser');

		const { data } = await volunteer.supabase
			.from('conference_staff')
			.select('user_id')
			.eq('conference_id', conferenceId);

		expect(data?.length).toBe(2);
	});

	it('lets a volunteer see who holds which role', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const volunteer = await createSignedInClient();
		const organiser = await createSignedInClient();

		await addStaff(supabase, conferenceId, volunteer.userId, 'volunteer');
		await addStaff(supabase, conferenceId, organiser.userId, 'organiser');

		// The team page draws every row's roles, and anybody on the team may open
		// the public half of it, so the memberships are the team's to read.
		const { data } = await volunteer.supabase
			.from('conference_role_members')
			.select('user_id')
			.eq('conference_id', conferenceId);

		expect(data?.length).toBe(2);
	});

	it('shows nothing to somebody who is not on the team', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const stranger = await createSignedInClient();

		await addStaff(supabase, conferenceId, stranger.userId, 'chair');

		const otherStranger = await createSignedInClient();
		const { data } = await otherStranger.supabase
			.from('conference_staff')
			.select('user_id')
			.eq('conference_id', conferenceId);

		expect(data).toEqual([]);
	});
});

describe('conference_staff, changing and removing rows', () => {
	it("lets an organiser change somebody else's title", async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const helper = await createSignedInClient();

		await addStaff(supabase, conferenceId, helper.userId, 'volunteer');

		const { data, error } = await supabase
			.from('conference_staff')
			.update({ title: 'Head of Logistics' })
			.eq('conference_id', conferenceId)
			.eq('user_id', helper.userId)
			.select('title');

		expect(error).toBeNull();
		expect(data).toEqual([{ title: 'Head of Logistics' }]);
	});

	it('refuses an organiser who tries to change their own row', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const organiser = await createSignedInClient();

		await addStaff(supabase, conferenceId, organiser.userId, 'organiser');

		const { data } = await organiser.supabase
			.from('conference_staff')
			.update({ title: 'Supreme Leader' })
			.eq('conference_id', conferenceId)
			.eq('user_id', organiser.userId)
			.select('title');

		expect(data).toEqual([]);
	});

	it('lets an organiser give somebody a second role and take it away again', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const helper = await createSignedInClient();

		await addStaff(supabase, conferenceId, helper.userId, 'volunteer');

		const chairRoleId = await presetRoleId(supabase, conferenceId, 'Chair');
		await giveRole(supabase, conferenceId, helper.userId, chairRoleId);

		const { data: held } = await supabase
			.from('conference_role_members')
			.select('role_id')
			.eq('conference_id', conferenceId)
			.eq('user_id', helper.userId);

		// Roles add up: the Volunteer role is still there beside the new one.
		expect(held?.length).toBe(2);

		const { data: removed, error } = await supabase
			.from('conference_role_members')
			.delete()
			.eq('role_id', chairRoleId)
			.eq('user_id', helper.userId)
			.select('role_id');

		expect(error).toBeNull();
		expect(removed).toEqual([{ role_id: chairRoleId }]);
	});

	it("refuses a membership of another conference's role", async () => {
		const ourConference = await createConferenceOwnedByMe();
		const someoneElse = await createConferenceOwnedByMe();
		const helper = await createSignedInClient();

		await addStaff(ourConference.supabase, ourConference.conferenceId, helper.userId);

		// The row names both the conference and the role, so a page could pair
		// our staff row with a role of somebody else's conference. The
		// conference_role_members_check_conference trigger refuses that.
		const { error } = await ourConference.supabase.from('conference_role_members').insert({
			conference_id: ourConference.conferenceId,
			user_id: helper.userId,
			role_id: await presetRoleId(someoneElse.supabase, someoneElse.conferenceId, 'Chair')
		});

		expect(error?.message).toContain('different conference');
	});

	it('refuses an organiser who tries to give themselves a role', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const organiser = await createSignedInClient();

		await addStaff(supabase, conferenceId, organiser.userId, 'organiser');

		// Nobody changes their own roles, in either direction (rule 6). An
		// insert the policy refuses comes back as an error, because there is no
		// existing row for the policy to hide.
		const { error } = await organiser.supabase.from('conference_role_members').insert({
			conference_id: conferenceId,
			user_id: organiser.userId,
			role_id: await presetRoleId(supabase, conferenceId, 'Chair')
		});

		expect(error).not.toBeNull();
	});

	it('refuses to let one member of the team remove another', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const chair = await createSignedInClient();
		const volunteer = await createSignedInClient();

		await addStaff(supabase, conferenceId, chair.userId, 'chair');
		await addStaff(supabase, conferenceId, volunteer.userId, 'volunteer');

		// A chair is staff, so they can read the team. Removing somebody from it
		// takes the manage_team permission, which the Chair role does not hold.
		const { data } = await chair.supabase
			.from('conference_staff')
			.delete()
			.eq('conference_id', conferenceId)
			.eq('user_id', volunteer.userId)
			.select('user_id');

		expect(data).toEqual([]);
	});

	it('lets an organiser remove somebody, roles and all', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const helper = await createSignedInClient();

		await addStaff(supabase, conferenceId, helper.userId, 'chair');

		const { data, error } = await supabase
			.from('conference_staff')
			.delete()
			.eq('conference_id', conferenceId)
			.eq('user_id', helper.userId)
			.select('user_id');

		expect(error).toBeNull();
		expect(data).toEqual([{ user_id: helper.userId }]);

		// The membership points at the staff row and goes with it.
		const { data: roles } = await supabase
			.from('conference_role_members')
			.select('role_id')
			.eq('conference_id', conferenceId)
			.eq('user_id', helper.userId);

		expect(roles).toEqual([]);
	});

	it('lets somebody step down from the team themselves', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const helper = await createSignedInClient();

		await addStaff(supabase, conferenceId, helper.userId, 'volunteer');

		const { data, error } = await helper.supabase
			.from('conference_staff')
			.delete()
			.eq('conference_id', conferenceId)
			.eq('user_id', helper.userId)
			.select('user_id');

		expect(error).toBeNull();
		expect(data).toEqual([{ user_id: helper.userId }]);
	});
});

describe('has_permission administrator', () => {
	it('lets an invited organiser open the draft, although they are in no organisation', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const invitedOrganiser = await createSignedInClient();

		// Before the staff row exists, the conference is a draft they cannot see.
		const { data: before } = await invitedOrganiser.supabase
			.from('conferences')
			.select('id')
			.eq('id', conferenceId);

		expect(before).toEqual([]);

		await addStaff(supabase, conferenceId, invitedOrganiser.userId, 'organiser');

		const { data: after } = await invitedOrganiser.supabase
			.from('conferences')
			.select('id')
			.eq('id', conferenceId);

		expect(after).toEqual([{ id: conferenceId }]);

		const { data: canManage } = await invitedOrganiser.supabase.rpc('has_permission', {
			conference_id: conferenceId,
			permission: 'administrator'
		});

		expect(canManage).toBe(true);
	});

	it('does not give a chair the run of the conference', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const chair = await createSignedInClient();

		await addStaff(supabase, conferenceId, chair.userId, 'chair');

		// A chair is staff, so they can read the conference, but not rename it.
		const { data } = await chair.supabase
			.from('conferences')
			.update({ name: 'Renamed by a chair' })
			.eq('id', conferenceId)
			.select('name');

		expect(data).toEqual([]);
	});

	it('does not give a volunteer the run of the conference either', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const volunteer = await createSignedInClient();

		await addStaff(supabase, conferenceId, volunteer.userId, 'volunteer');

		const { data: canManage } = await volunteer.supabase.rpc('has_permission', {
			conference_id: conferenceId,
			permission: 'administrator'
		});
		const { data: isStaff } = await volunteer.supabase.rpc('is_conference_staff', {
			conference_id: conferenceId
		});

		expect(canManage).toBe(false);
		expect(isStaff).toBe(true);
	});
});

describe('has_permission administrator, the organisation above the roles', () => {
	it('lets an admin of the organisation run every conference without a staff row', async () => {
		const { supabase, conferenceId, organizationId } = await createConferenceOwnedByMe();
		const admin = await createSignedInClient();

		await addOrganizationMember(organizationId, admin.userId, 'admin');

		const { data: canManage } = await admin.supabase.rpc('has_permission', {
			conference_id: conferenceId,
			permission: 'administrator'
		});

		expect(canManage).toBe(true);

		const { data: staffRows } = await supabase
			.from('conference_staff')
			.select('user_id')
			.eq('conference_id', conferenceId)
			.eq('user_id', admin.userId);

		expect(staffRows).toEqual([]);
	});

	it('does not let a plain member run a conference they were given no role on', async () => {
		const { conferenceId, organizationId } = await createConferenceOwnedByMe();
		const member = await createSignedInClient();

		await addOrganizationMember(organizationId, member.userId, 'member');

		// Decision 1 of docs/roles-and-permissions.md: a member still sees the
		// organisation's conferences listed, drafts included, but what they may
		// do on each comes from the roles they hold on it.
		const { data: canSee } = await member.supabase
			.from('conferences')
			.select('id')
			.eq('id', conferenceId);

		expect(canSee).toEqual([{ id: conferenceId }]);

		const { data: canManage } = await member.supabase.rpc('has_permission', {
			conference_id: conferenceId,
			permission: 'administrator'
		});

		expect(canManage).toBe(false);
	});

	it('gives a plain member the Organiser role on a conference they create', async () => {
		const { organizationId } = await createConferenceOwnedByMe();
		const member = await createSignedInClient();

		await addOrganizationMember(organizationId, member.userId, 'member');

		const { data: created, error } = await member.supabase
			.from('conferences')
			.insert({
				name: "A member's conference",
				slug: `member-conference-${crypto.randomUUID()}`,
				city: 'Leiden',
				country_code: 'NL',
				start_date: '2020-05-01',
				end_date: '2020-05-03',
				organization_id: organizationId,
				created_by: member.userId
			})
			.select('id')
			.single();

		expect(error).toBeNull();

		// The conferences_add_presets trigger (add_conference_presets) wrote the
		// staff row and the membership, so the person who started the conference
		// can carry on.
		const { data: canManage } = await member.supabase.rpc('has_permission', {
			conference_id: created?.id,
			permission: 'administrator'
		});

		expect(canManage).toBe(true);

		const { data: roles } = await member.supabase
			.from('conference_roles')
			.select('name')
			.eq('conference_id', created?.id)
			.order('position');

		expect(roles).toEqual([{ name: 'Organiser' }, { name: 'Chair' }, { name: 'Volunteer' }]);
	});
});

describe('is_platform_admin', () => {
	it('gives a platform administrator the run of a conference they have nothing to do with', async () => {
		const { conferenceId } = await createConferenceOwnedByMe();
		const admin = await createSignedInClient();

		// Nothing in the app can turn the flag on, so this is the only way to get
		// an administrator: straight into the table, the way a founder would with
		// direct access to the database.
		const serviceRole = createServiceRoleClient();
		await serviceRole.from('profiles').update({ is_platform_admin: true }).eq('id', admin.userId);

		const { data: canSee } = await admin.supabase
			.from('conferences')
			.select('id')
			.eq('id', conferenceId);

		expect(canSee).toEqual([{ id: conferenceId }]);

		const { data: canEdit } = await admin.supabase
			.from('conferences')
			.update({ name: 'Renamed by the platform admin' })
			.eq('id', conferenceId)
			.select('name');

		expect(canEdit).toEqual([{ name: 'Renamed by the platform admin' }]);
	});

	it('gives an ordinary user none of that', async () => {
		const { conferenceId } = await createConferenceOwnedByMe();
		const ordinaryUser = await createSignedInClient();

		const { data: canSee } = await ordinaryUser.supabase
			.from('conferences')
			.select('id')
			.eq('id', conferenceId);

		expect(canSee).toEqual([]);

		const { data: canEdit } = await ordinaryUser.supabase
			.from('conferences')
			.update({ name: 'Renamed by a stranger' })
			.eq('id', conferenceId)
			.select('name');

		expect(canEdit).toEqual([]);
	});
});

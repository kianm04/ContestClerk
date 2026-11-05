import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	createServiceRoleClient,
	createSignedInClient,
	createVisitorClient
} from './supabase-test-client';
import {
	addCommittee,
	addOrganizationMember,
	createConferenceOwnedByMe,
	giveSeatTo,
	type ConferenceFixture
} from './conference-fixtures';

// The roles a conference has and the permissions they grant: the two tables,
// the helpers every policy asks and the rank rule, from section 7 of
// docs/roles-and-permissions.md and migration 20261007120000_conference_roles.
//
// Every fixture here is built through the organisation owner's own client, so
// the rows only exist if the policies allow them. The owner never holds a role
// of their own: rule 4 makes an owner an administrator of every conference of
// the organisation, which is the first thing the tests below check.

/** One role as the table holds it, in the columns the tests compare. */
type RoleRow = {
	id: string;
	name: string;
	position: number;
	scope: 'conference' | 'committees';
	permissions: string[];
	is_public: boolean;
};

/** The roles of one conference, highest first, as anybody on the team may read them. */
async function readRoles(supabase: SupabaseClient, conferenceId: string): Promise<RoleRow[]> {
	const { data, error } = await supabase
		.from('conference_roles')
		.select('id, name, position, scope, permissions, is_public')
		.eq('conference_id', conferenceId)
		.order('position');

	if (error) {
		throw new Error(`Could not read the roles: ${error.message}`);
	}

	return (data ?? []) as RoleRow[];
}

/** The id of one of a conference's preset roles, by name. */
async function presetId(
	supabase: SupabaseClient,
	conferenceId: string,
	name: string
): Promise<string> {
	const roles = await readRoles(supabase, conferenceId);
	const role = roles.find((candidate) => candidate.name === name);

	if (!role) {
		throw new Error(`The conference has no role called ${name}`);
	}

	return role.id;
}

/**
 * Puts somebody on the team with no role. Nobody may insert a staff row
 * directly since the security review (they come from `accept_invite` and
 * `ensure_chair_is_staff`), so this does with the service role what accepting
 * an invitation would have done.
 */
async function joinTeam(conferenceId: string, userId: string): Promise<void> {
	const { error } = await createServiceRoleClient()
		.from('conference_staff')
		.insert({ conference_id: conferenceId, user_id: userId });

	if (error) {
		throw new Error(`Could not add the fixture team member: ${error.message}`);
	}
}

/** Gives a team member a role, through whichever client is handed in. */
function giveRole(client: SupabaseClient, conferenceId: string, userId: string, roleId: string) {
	return client
		.from('conference_role_members')
		.insert({ conference_id: conferenceId, user_id: userId, role_id: roleId })
		.select('role_id');
}

/** What `makeRole` may be told about the role it makes. */
type NewRole = {
	name: string;
	position?: number;
	scope?: 'conference' | 'committees';
	permissions?: string[];
	isPublic?: boolean;
};

/** Makes a role through whichever client is handed in, answering the raw result. */
function makeRole(client: SupabaseClient, conferenceId: string, role: NewRole) {
	return client
		.from('conference_roles')
		.insert({
			conference_id: conferenceId,
			name: role.name,
			position: role.position ?? 5,
			scope: role.scope ?? 'conference',
			permissions: role.permissions ?? [],
			is_public: role.isPublic ?? false
		})
		.select('id')
		.single();
}

/** The same, through the owner, for a role a test only needs to exist. */
async function addRole(
	owner: SupabaseClient,
	conferenceId: string,
	role: NewRole
): Promise<string> {
	const { data, error } = await makeRole(owner, conferenceId, role);

	if (error || !data) {
		throw new Error(`Could not make the fixture role: ${error?.message}`);
	}

	return data.id;
}

/** Signs up a new person and puts them on the team holding one role. */
async function addMemberWithRole(
	fixture: ConferenceFixture,
	roleId: string,
	fullName = 'Team member'
) {
	const person = await createSignedInClient(fullName);

	await joinTeam(fixture.conferenceId, person.userId);

	const { error } = await giveRole(fixture.supabase, fixture.conferenceId, person.userId, roleId);

	if (error) {
		throw new Error(`Could not give the fixture role: ${error.message}`);
	}

	return person;
}

/** Asks one of the yes-or-no helpers as whoever `client` is signed in as. */
async function ask(
	client: SupabaseClient,
	helper: string,
	helperArguments: Record<string, string | number | string[]>
): Promise<boolean> {
	const { data, error } = await client.rpc(helper, helperArguments);

	if (error) {
		throw new Error(`${helper} failed: ${error.message}`);
	}

	return data === true;
}

describe('the preset roles (preset_conference_roles and the conferences_add_presets trigger)', () => {
	it('gives every new conference Organiser, Chair and Volunteer', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();

		const roles = await readRoles(supabase, conferenceId);

		expect(roles.map((role) => [role.name, role.position, role.scope, role.is_public])).toEqual([
			['Organiser', 0, 'conference', true],
			['Chair', 1, 'committees', true],
			['Volunteer', 2, 'conference', false]
		]);
		expect(roles[0].permissions).toEqual(['administrator']);
		expect(roles[1].permissions).toEqual([
			'run_room',
			'review_papers',
			'write_chair_notes',
			'propose_awards',
			'send_announcements',
			'manage_committees',
			'read_participants',
			'answer_directives'
		]);
		expect(roles[2].permissions).toEqual([]);
	});

	it('gives an owner no staff row: is_conference_owner already makes them an administrator', async () => {
		const { supabase, conferenceId, userId } = await createConferenceOwnedByMe();

		const { data: staffRows } = await supabase
			.from('conference_staff')
			.select('user_id')
			.eq('conference_id', conferenceId)
			.eq('user_id', userId);

		expect(staffRows).toEqual([]);
		expect(
			await ask(supabase, 'has_permission', {
				conference_id: conferenceId,
				permission: 'decide_applications'
			})
		).toBe(true);
		expect(
			await ask(supabase, 'has_permission', {
				conference_id: conferenceId,
				permission: 'administrator'
			})
		).toBe(true);
	});

	it('gives a plain organisation member who creates a conference the Organiser role', async () => {
		const owner = await createConferenceOwnedByMe();
		const member = await createSignedInClient('Plain member');

		await addOrganizationMember(owner.organizationId, member.userId, 'member');

		const { data: conference, error } = await member.supabase
			.from('conferences')
			.insert({
				name: 'Made by a member',
				slug: `member-conference-${crypto.randomUUID()}`,
				city: 'Utrecht',
				country_code: 'NL',
				start_date: '2020-03-01',
				end_date: '2020-03-03',
				organization_id: owner.organizationId,
				created_by: member.userId
			})
			.select('id')
			.single();

		expect(error).toBeNull();

		const organiserRole = await presetId(member.supabase, conference!.id, 'Organiser');
		const { data: memberships } = await member.supabase
			.from('conference_role_members')
			.select('role_id')
			.eq('conference_id', conference!.id)
			.eq('user_id', member.userId);

		expect(memberships).toEqual([{ role_id: organiserRole }]);
		expect(
			await ask(member.supabase, 'has_permission', {
				conference_id: conference!.id,
				permission: 'administrator'
			})
		).toBe(true);
	});

	it('gives a plain organisation member nothing on a conference somebody else made (decision 1)', async () => {
		const owner = await createConferenceOwnedByMe();
		const member = await createSignedInClient('Plain member');

		await addOrganizationMember(owner.organizationId, member.userId, 'member');

		// They still see the organisation's draft listed, which is what lets them
		// ask an administrator for a role.
		const { data: visible } = await member.supabase
			.from('conferences')
			.select('id')
			.eq('id', owner.conferenceId);

		expect(visible).toEqual([{ id: owner.conferenceId }]);
		expect(
			await ask(member.supabase, 'is_conference_staff', { conference_id: owner.conferenceId })
		).toBe(false);
		expect(
			await ask(member.supabase, 'has_permission', {
				conference_id: owner.conferenceId,
				permission: 'administrator'
			})
		).toBe(false);
	});

	it('makes an organisation admin an administrator of every conference', async () => {
		const owner = await createConferenceOwnedByMe();
		const admin = await createSignedInClient('Org admin');

		await addOrganizationMember(owner.organizationId, admin.userId, 'admin');

		expect(
			await ask(admin.supabase, 'has_permission', {
				conference_id: owner.conferenceId,
				permission: 'administrator'
			})
		).toBe(true);

		const { data: rank } = await admin.supabase.rpc('my_rank', {
			conference_id: owner.conferenceId
		});

		expect(rank).toBe(-1);
	});
});

describe('has_permission, conference-wide', () => {
	it('answers everything for the Organiser role, which is administrator', async () => {
		const fixture = await createConferenceOwnedByMe();
		const organiserRole = await presetId(fixture.supabase, fixture.conferenceId, 'Organiser');
		const organiser = await addMemberWithRole(fixture, organiserRole);

		expect(
			await ask(organiser.supabase, 'has_permission', {
				conference_id: fixture.conferenceId,
				permission: 'manage_invoices'
			})
		).toBe(true);
		expect(
			await ask(organiser.supabase, 'has_permission', {
				conference_id: fixture.conferenceId,
				permission: 'administrator'
			})
		).toBe(true);

		const { data: permissions } = await organiser.supabase.rpc('my_permissions', {
			conference_id: fixture.conferenceId
		});

		expect(permissions).toEqual([{ permission: 'administrator', scope: 'conference' }]);
	});

	it('answers only what a custom role holds', async () => {
		const fixture = await createConferenceOwnedByMe();
		const readerRole = await addRole(fixture.supabase, fixture.conferenceId, {
			name: 'Delegate affairs',
			permissions: ['read_applications', 'read_participants']
		});
		const reader = await addMemberWithRole(fixture, readerRole);

		expect(
			await ask(reader.supabase, 'has_permission', {
				conference_id: fixture.conferenceId,
				permission: 'read_applications'
			})
		).toBe(true);
		expect(
			await ask(reader.supabase, 'has_permission', {
				conference_id: fixture.conferenceId,
				permission: 'decide_applications'
			})
		).toBe(false);
		expect(
			await ask(reader.supabase, 'has_permission', {
				conference_id: fixture.conferenceId,
				permission: 'administrator'
			})
		).toBe(false);
		expect(
			await ask(reader.supabase, 'is_conference_staff', { conference_id: fixture.conferenceId })
		).toBe(true);

		const { data: permitted } = await reader.supabase.rpc('permitted_conference_ids', {
			permission: 'read_applications'
		});
		const { data: notPermitted } = await reader.supabase.rpc('permitted_conference_ids', {
			permission: 'decide_applications'
		});

		expect(permitted).toEqual([fixture.conferenceId]);
		expect(notPermitted).toEqual([]);
	});

	it('answers nothing for a Volunteer, who is on the team all the same', async () => {
		const fixture = await createConferenceOwnedByMe();
		const volunteerRole = await presetId(fixture.supabase, fixture.conferenceId, 'Volunteer');
		const volunteer = await addMemberWithRole(fixture, volunteerRole);

		expect(
			await ask(volunteer.supabase, 'is_conference_staff', { conference_id: fixture.conferenceId })
		).toBe(true);
		expect(
			await ask(volunteer.supabase, 'has_permission', {
				conference_id: fixture.conferenceId,
				permission: 'read_participants'
			})
		).toBe(false);

		const { data: permissions } = await volunteer.supabase.rpc('my_permissions', {
			conference_id: fixture.conferenceId
		});

		expect(permissions).toEqual([]);
	});

	it('answers nothing for a stranger', async () => {
		const fixture = await createConferenceOwnedByMe();
		const stranger = await createSignedInClient('Stranger');

		expect(
			await ask(stranger.supabase, 'is_conference_staff', { conference_id: fixture.conferenceId })
		).toBe(false);
		expect(
			await ask(stranger.supabase, 'has_permission', {
				conference_id: fixture.conferenceId,
				permission: 'read_participants'
			})
		).toBe(false);
	});
});

describe('has_committee_permission, per committee', () => {
	it('narrows a committees-scoped role to the committees the member is assigned to', async () => {
		const fixture = await createConferenceOwnedByMe();
		const ownCommittee = await addCommittee(
			fixture.supabase,
			fixture.conferenceId,
			'Security Council'
		);
		const otherCommittee = await addCommittee(fixture.supabase, fixture.conferenceId, 'ECOSOC');
		const chairRole = await presetId(fixture.supabase, fixture.conferenceId, 'Chair');
		const chair = await addMemberWithRole(fixture, chairRole, 'Chair');

		await fixture.supabase
			.from('committee_chairs')
			.insert({ committee_id: ownCommittee, user_id: chair.userId });

		expect(
			await ask(chair.supabase, 'has_committee_permission', {
				committee_id: ownCommittee,
				permission: 'run_room'
			})
		).toBe(true);
		expect(
			await ask(chair.supabase, 'has_committee_permission', {
				committee_id: otherCommittee,
				permission: 'run_room'
			})
		).toBe(false);
		expect(
			await ask(chair.supabase, 'has_permission', {
				conference_id: fixture.conferenceId,
				permission: 'run_room'
			})
		).toBe(false);
		// The redefined helper the room tables ask.
		expect(
			await ask(chair.supabase, 'has_committee_permission', {
				committee_id: ownCommittee,
				permission: 'run_room'
			})
		).toBe(true);
		expect(
			await ask(chair.supabase, 'has_committee_permission', {
				committee_id: otherCommittee,
				permission: 'run_room'
			})
		).toBe(false);

		const { data: committees } = await chair.supabase.rpc('permitted_committee_ids', {
			permission: 'run_room'
		});
		const { data: conferences } = await chair.supabase.rpc('permitted_conference_ids', {
			permission: 'run_room'
		});

		expect(committees).toEqual([ownCommittee]);
		expect(conferences).toEqual([]);
	});

	it('grants nothing from a committees-scoped role to somebody assigned to no committee', async () => {
		const fixture = await createConferenceOwnedByMe();
		const committee = await addCommittee(fixture.supabase, fixture.conferenceId);
		const chairRole = await presetId(fixture.supabase, fixture.conferenceId, 'Chair');
		const unassigned = await addMemberWithRole(fixture, chairRole, 'Unassigned chair');

		expect(
			await ask(unassigned.supabase, 'has_committee_permission', {
				committee_id: committee,
				permission: 'run_room'
			})
		).toBe(false);
	});

	it('lets a conference-scoped role run every room', async () => {
		const fixture = await createConferenceOwnedByMe();
		const first = await addCommittee(fixture.supabase, fixture.conferenceId, 'First');
		const second = await addCommittee(fixture.supabase, fixture.conferenceId, 'Second');
		const academicsRole = await addRole(fixture.supabase, fixture.conferenceId, {
			name: 'Head of academics',
			permissions: ['run_room', 'review_papers']
		});
		const head = await addMemberWithRole(fixture, academicsRole, 'Head of academics');

		expect(
			await ask(head.supabase, 'has_committee_permission', {
				committee_id: first,
				permission: 'run_room'
			})
		).toBe(true);
		expect(
			await ask(head.supabase, 'has_committee_permission', {
				committee_id: second,
				permission: 'run_room'
			})
		).toBe(true);

		const { data: committees } = await head.supabase.rpc('permitted_committee_ids', {
			permission: 'run_room'
		});

		expect(committees?.sort()).toEqual([first, second].sort());
	});

	it('reports each permission once, at the widest scope it is held', async () => {
		const fixture = await createConferenceOwnedByMe();
		const chairRole = await presetId(fixture.supabase, fixture.conferenceId, 'Chair');
		const pressRole = await addRole(fixture.supabase, fixture.conferenceId, {
			name: 'Press',
			permissions: ['send_announcements']
		});
		const person = await addMemberWithRole(fixture, chairRole, 'Chair and press');

		await giveRole(fixture.supabase, fixture.conferenceId, person.userId, pressRole);

		const { data: permissions } = await person.supabase.rpc('my_permissions', {
			conference_id: fixture.conferenceId
		});

		expect(permissions).toContainEqual({ permission: 'send_announcements', scope: 'conference' });
		expect(permissions).toContainEqual({ permission: 'run_room', scope: 'committees' });
		expect(
			permissions?.filter((row: { permission: string }) => row.permission === 'send_announcements')
		).toHaveLength(1);
	});
});

describe('writing roles, as an administrator', () => {
	it('lets an administrator make, rename, reorder and delete an empty role', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const roleId = await addRole(supabase, conferenceId, {
			name: 'Finance',
			permissions: ['manage_invoices']
		});

		const { data: renamed, error: renameError } = await supabase
			.from('conference_roles')
			.update({ name: 'Treasury', position: 9 })
			.eq('id', roleId)
			.select('name, position');

		expect(renameError).toBeNull();
		expect(renamed).toEqual([{ name: 'Treasury', position: 9 }]);

		const { data: deleted } = await supabase
			.from('conference_roles')
			.delete()
			.eq('id', roleId)
			.select('id');

		expect(deleted).toEqual([{ id: roleId }]);
	});

	it('refuses to delete a role somebody holds', async () => {
		const fixture = await createConferenceOwnedByMe();
		const roleId = await addRole(fixture.supabase, fixture.conferenceId, { name: 'Finance' });

		await addMemberWithRole(fixture, roleId);

		const { error } = await fixture.supabase.from('conference_roles').delete().eq('id', roleId);

		expect(error).not.toBeNull();
	});

	it('refuses two roles with the same name, however it is capitalised', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();

		const { error } = await makeRole(supabase, conferenceId, { name: 'organiser' });

		expect(error).not.toBeNull();
	});
});

describe('writing roles, the rank rule', () => {
	/**
	 * A "Deputy" at position 1 who may manage roles and the team, and read
	 * applications: enough to try everything the rule forbids.
	 */
	async function deputyOn(fixture: ConferenceFixture) {
		const deputyRole = await addRole(fixture.supabase, fixture.conferenceId, {
			name: 'Deputy',
			position: 1,
			permissions: ['manage_roles', 'manage_team', 'read_applications']
		});

		return addMemberWithRole(fixture, deputyRole, 'Deputy');
	}

	it('lets them make a role below their own with permissions they hold', async () => {
		const fixture = await createConferenceOwnedByMe();
		const deputy = await deputyOn(fixture);

		const { error } = await makeRole(deputy.supabase, fixture.conferenceId, {
			name: 'Reader',
			position: 4,
			permissions: ['read_applications']
		});

		expect(error).toBeNull();
	});

	it('refuses a role at or above their own position', async () => {
		const fixture = await createConferenceOwnedByMe();
		const deputy = await deputyOn(fixture);

		const { error: above } = await makeRole(deputy.supabase, fixture.conferenceId, {
			name: 'Above',
			position: 0
		});
		const { error: peer } = await makeRole(deputy.supabase, fixture.conferenceId, {
			name: 'Peer',
			position: 1
		});

		expect(above).not.toBeNull();
		expect(peer).not.toBeNull();
	});

	it('refuses a permission they do not hold themselves', async () => {
		const fixture = await createConferenceOwnedByMe();
		const deputy = await deputyOn(fixture);

		const { error } = await makeRole(deputy.supabase, fixture.conferenceId, {
			name: 'Decider',
			position: 4,
			permissions: ['read_applications', 'decide_applications']
		});

		expect(error).not.toBeNull();
	});

	it('refuses to put a permission held only per committee on a conference-wide role', async () => {
		const fixture = await createConferenceOwnedByMe();
		const deputy = await deputyOn(fixture);
		const chairRole = await presetId(fixture.supabase, fixture.conferenceId, 'Chair');

		await giveRole(fixture.supabase, fixture.conferenceId, deputy.userId, chairRole);

		const { error: conferenceWide } = await makeRole(deputy.supabase, fixture.conferenceId, {
			name: 'Room runner',
			position: 4,
			permissions: ['run_room']
		});
		const { error: perCommittee } = await makeRole(deputy.supabase, fixture.conferenceId, {
			name: 'Co-chair',
			position: 4,
			scope: 'committees',
			permissions: ['run_room']
		});

		expect(conferenceWide).not.toBeNull();
		expect(perCommittee).toBeNull();
	});

	it('hides a role above them from edits and deletes', async () => {
		const fixture = await createConferenceOwnedByMe();
		const deputy = await deputyOn(fixture);
		const organiserRole = await presetId(fixture.supabase, fixture.conferenceId, 'Organiser');

		const { data: changed } = await deputy.supabase
			.from('conference_roles')
			.update({ name: 'Renamed by the deputy' })
			.eq('id', organiserRole)
			.select('id');
		const { data: deleted } = await deputy.supabase
			.from('conference_roles')
			.delete()
			.eq('id', organiserRole)
			.select('id');

		expect(changed).toEqual([]);
		expect(deleted).toEqual([]);
	});

	it('lets them give and take a role below their own, to and from somebody else', async () => {
		const fixture = await createConferenceOwnedByMe();
		const deputy = await deputyOn(fixture);
		const volunteerRole = await presetId(fixture.supabase, fixture.conferenceId, 'Volunteer');
		const newcomer = await createSignedInClient('Newcomer');

		await joinTeam(fixture.conferenceId, newcomer.userId);

		const { error: giveError } = await giveRole(
			deputy.supabase,
			fixture.conferenceId,
			newcomer.userId,
			volunteerRole
		);

		expect(giveError).toBeNull();

		const { data: taken } = await deputy.supabase
			.from('conference_role_members')
			.delete()
			.eq('role_id', volunteerRole)
			.eq('user_id', newcomer.userId)
			.select('user_id');

		expect(taken).toEqual([{ user_id: newcomer.userId }]);
	});

	it('refuses to give a role above their own, or any role to themselves', async () => {
		const fixture = await createConferenceOwnedByMe();
		const deputy = await deputyOn(fixture);
		const organiserRole = await presetId(fixture.supabase, fixture.conferenceId, 'Organiser');
		const volunteerRole = await presetId(fixture.supabase, fixture.conferenceId, 'Volunteer');
		const newcomer = await createSignedInClient('Newcomer');

		await joinTeam(fixture.conferenceId, newcomer.userId);

		const { error: aboveError } = await giveRole(
			deputy.supabase,
			fixture.conferenceId,
			newcomer.userId,
			organiserRole
		);
		const { error: selfError } = await giveRole(
			deputy.supabase,
			fixture.conferenceId,
			deputy.userId,
			volunteerRole
		);

		expect(aboveError).not.toBeNull();
		expect(selfError).not.toBeNull();
	});

	it('refuses to take their own role off', async () => {
		const fixture = await createConferenceOwnedByMe();
		const deputy = await deputyOn(fixture);

		const { data: taken } = await deputy.supabase
			.from('conference_role_members')
			.delete()
			.eq('conference_id', fixture.conferenceId)
			.eq('user_id', deputy.userId)
			.select('user_id');

		expect(taken).toEqual([]);
	});
});

describe('conference_role_members, the shape of a membership', () => {
	it('refuses a role for somebody who is not on the team', async () => {
		const fixture = await createConferenceOwnedByMe();
		const volunteerRole = await presetId(fixture.supabase, fixture.conferenceId, 'Volunteer');
		const outsider = await createSignedInClient('Outsider');

		const { error } = await giveRole(
			fixture.supabase,
			fixture.conferenceId,
			outsider.userId,
			volunteerRole
		);

		expect(error).not.toBeNull();
	});

	it('refuses a role of another conference (check_role_member_conference)', async () => {
		const fixture = await createConferenceOwnedByMe();
		const other = await createConferenceOwnedByMe();
		const otherVolunteerRole = await presetId(other.supabase, other.conferenceId, 'Volunteer');
		const person = await createSignedInClient('Person');

		await joinTeam(fixture.conferenceId, person.userId);

		// The owner of the first conference is also, for this test, made an
		// administrator of the second so that only the trigger can refuse.
		await addOrganizationMember(other.organizationId, fixture.userId, 'admin');

		const { error } = await giveRole(
			fixture.supabase,
			fixture.conferenceId,
			person.userId,
			otherVolunteerRole
		);

		expect(error?.message).toContain('different conference');
	});

	it('shows a participant the holders of public roles (role_is_public), and nothing else', async () => {
		const fixture = await createConferenceOwnedByMe();
		const organiserRole = await presetId(fixture.supabase, fixture.conferenceId, 'Organiser');
		const volunteerRole = await presetId(fixture.supabase, fixture.conferenceId, 'Volunteer');
		const organiser = await addMemberWithRole(fixture, organiserRole, 'Organiser');

		await addMemberWithRole(fixture, volunteerRole, 'Volunteer');

		// A delegate in a seat is a participant, as in the conference_staff test
		// below.
		const committee = await addCommittee(fixture.supabase, fixture.conferenceId);
		const { data: seat } = await fixture.supabase
			.from('seats')
			.insert({ committee_id: committee, name: 'France', country_code: 'FR' })
			.select('id')
			.single();
		const delegate = await createSignedInClient('Delegate');

		await giveSeatTo(fixture.supabase, seat!.id, delegate.userId);

		const { data: memberships } = await delegate.supabase
			.from('conference_role_members')
			.select('user_id, role_id')
			.eq('conference_id', fixture.conferenceId);

		expect(memberships).toEqual([{ user_id: organiser.userId, role_id: organiserRole }]);
	});

	it('lets the team read who holds which role, and a stranger nobody', async () => {
		const fixture = await createConferenceOwnedByMe();
		const volunteerRole = await presetId(fixture.supabase, fixture.conferenceId, 'Volunteer');
		const volunteer = await addMemberWithRole(fixture, volunteerRole);
		const stranger = await createSignedInClient('Stranger');

		const { data: seenByTeam } = await volunteer.supabase
			.from('conference_role_members')
			.select('user_id')
			.eq('conference_id', fixture.conferenceId);
		const { data: seenByStranger } = await stranger.supabase
			.from('conference_role_members')
			.select('user_id')
			.eq('conference_id', fixture.conferenceId);

		expect(seenByTeam).toEqual([{ user_id: volunteer.userId }]);
		expect(seenByStranger).toEqual([]);
	});
});

describe('conference_staff under the permissions', () => {
	it('lets a team manager change the title of somebody below them and remove them, but not an administrator', async () => {
		const fixture = await createConferenceOwnedByMe();
		const managerRole = await addRole(fixture.supabase, fixture.conferenceId, {
			name: 'Team manager',
			position: 3,
			permissions: ['manage_team']
		});
		const manager = await addMemberWithRole(fixture, managerRole, 'Manager');
		const organiserRole = await presetId(fixture.supabase, fixture.conferenceId, 'Organiser');
		const organiser = await addMemberWithRole(fixture, organiserRole, 'Organiser');
		const newcomer = await createSignedInClient('Newcomer');

		// Nobody adds a staff row directly, a team manager included: people join
		// by accepting an invitation or being assigned to a committee (L8 of the
		// security review).
		const { error: addError } = await manager.supabase
			.from('conference_staff')
			.insert({ conference_id: fixture.conferenceId, user_id: newcomer.userId });

		expect(addError).not.toBeNull();

		await joinTeam(fixture.conferenceId, newcomer.userId);

		const { data: titled } = await manager.supabase
			.from('conference_staff')
			.update({ title: 'Registration desk' })
			.eq('conference_id', fixture.conferenceId)
			.eq('user_id', newcomer.userId)
			.select('title');

		expect(titled).toEqual([{ title: 'Registration desk' }]);

		const { data: ownTitle } = await manager.supabase
			.from('conference_staff')
			.update({ title: 'Self-appointed' })
			.eq('conference_id', fixture.conferenceId)
			.eq('user_id', manager.userId)
			.select('title');

		expect(ownTitle).toEqual([]);

		const { data: removedOrganiser } = await manager.supabase
			.from('conference_staff')
			.delete()
			.eq('conference_id', fixture.conferenceId)
			.eq('user_id', organiser.userId)
			.select('user_id');

		expect(removedOrganiser).toEqual([]);

		const { data: removedNewcomer } = await manager.supabase
			.from('conference_staff')
			.delete()
			.eq('conference_id', fixture.conferenceId)
			.eq('user_id', newcomer.userId)
			.select('user_id');

		expect(removedNewcomer).toEqual([{ user_id: newcomer.userId }]);
	});

	it('lets anybody leave, and their roles go with them', async () => {
		const fixture = await createConferenceOwnedByMe();
		const volunteerRole = await presetId(fixture.supabase, fixture.conferenceId, 'Volunteer');
		const volunteer = await addMemberWithRole(fixture, volunteerRole);

		const { data: left } = await volunteer.supabase
			.from('conference_staff')
			.delete()
			.eq('conference_id', fixture.conferenceId)
			.eq('user_id', volunteer.userId)
			.select('user_id');

		expect(left).toEqual([{ user_id: volunteer.userId }]);

		const { data: memberships } = await fixture.supabase
			.from('conference_role_members')
			.select('user_id')
			.eq('user_id', volunteer.userId);

		expect(memberships).toEqual([]);
	});

	it('shows a participant the holders of public roles only', async () => {
		const fixture = await createConferenceOwnedByMe();
		const organiserRole = await presetId(fixture.supabase, fixture.conferenceId, 'Organiser');
		const volunteerRole = await presetId(fixture.supabase, fixture.conferenceId, 'Volunteer');
		const organiser = await addMemberWithRole(fixture, organiserRole, 'Organiser');

		await addMemberWithRole(fixture, volunteerRole, 'Volunteer');

		// A delegate in a seat is a participant.
		const committee = await addCommittee(fixture.supabase, fixture.conferenceId);
		const { data: seat } = await fixture.supabase
			.from('seats')
			.insert({ committee_id: committee, name: 'France', country_code: 'FR' })
			.select('id')
			.single();
		const delegate = await createSignedInClient('Delegate');

		await giveSeatTo(fixture.supabase, seat!.id, delegate.userId);

		const { data: team } = await delegate.supabase
			.from('conference_staff')
			.select('user_id')
			.eq('conference_id', fixture.conferenceId);

		expect(team).toEqual([{ user_id: organiser.userId }]);
	});
});

describe('reading roles', () => {
	it('shows a visitor the public roles of a published conference and nothing of a draft', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const visitor = createVisitorClient();

		const { data: ofDraft } = await visitor
			.from('conference_roles')
			.select('name')
			.eq('conference_id', conferenceId);

		expect(ofDraft).toEqual([]);

		await supabase.from('conferences').update({ status: 'published' }).eq('id', conferenceId);

		const { data: ofPublished } = await visitor
			.from('conference_roles')
			.select('name')
			.eq('conference_id', conferenceId)
			.order('position');

		expect(ofPublished).toEqual([{ name: 'Organiser' }, { name: 'Chair' }]);
	});
});

describe('the rank helpers, asked directly', () => {
	// can_manage_role, can_place_role, can_manage_member and can_grant are what
	// the policies above ask. user_rank and holder_has_permission are the two
	// internal helpers they are built on, granted to nobody and so only provable
	// through these four and through my_rank.
	it('answers a Deputy about roles, positions, people and permissions', async () => {
		const fixture = await createConferenceOwnedByMe();
		const deputyRole = await addRole(fixture.supabase, fixture.conferenceId, {
			name: 'Deputy',
			position: 1,
			permissions: ['manage_roles', 'manage_team', 'read_applications']
		});
		const deputy = await addMemberWithRole(fixture, deputyRole, 'Deputy');
		const organiserRole = await presetId(fixture.supabase, fixture.conferenceId, 'Organiser');
		const volunteerRole = await presetId(fixture.supabase, fixture.conferenceId, 'Volunteer');
		const volunteer = await addMemberWithRole(fixture, volunteerRole, 'Volunteer');
		const organiser = await addMemberWithRole(fixture, organiserRole, 'Organiser');
		const conference_id = fixture.conferenceId;

		expect(await ask(deputy.supabase, 'can_manage_role', { role_id: volunteerRole })).toBe(true);
		expect(await ask(deputy.supabase, 'can_manage_role', { role_id: organiserRole })).toBe(false);
		expect(await ask(deputy.supabase, 'can_manage_role', { role_id: deputyRole })).toBe(false);

		expect(await ask(deputy.supabase, 'can_place_role', { conference_id, role_position: 4 })).toBe(
			true
		);
		expect(await ask(deputy.supabase, 'can_place_role', { conference_id, role_position: 1 })).toBe(
			false
		);

		expect(
			await ask(deputy.supabase, 'can_manage_member', { conference_id, user_id: volunteer.userId })
		).toBe(true);
		expect(
			await ask(deputy.supabase, 'can_manage_member', { conference_id, user_id: organiser.userId })
		).toBe(false);
		// Their own rank is not below their own rank.
		expect(
			await ask(deputy.supabase, 'can_manage_member', { conference_id, user_id: deputy.userId })
		).toBe(false);

		expect(
			await ask(deputy.supabase, 'can_grant', {
				conference_id,
				permissions: ['read_applications'],
				scope: 'conference'
			})
		).toBe(true);
		expect(
			await ask(deputy.supabase, 'can_grant', {
				conference_id,
				permissions: ['read_applications', 'decide_applications'],
				scope: 'conference'
			})
		).toBe(false);
	});

	it('ranks an owner at -1 and gives a stranger no rank at all (user_rank)', async () => {
		const fixture = await createConferenceOwnedByMe();
		const stranger = await createSignedInClient('Stranger');

		const { data: ownerRank } = await fixture.supabase.rpc('my_rank', {
			conference_id: fixture.conferenceId
		});
		const { data: strangerRank } = await stranger.supabase.rpc('my_rank', {
			conference_id: fixture.conferenceId
		});

		expect(ownerRank).toBe(-1);
		expect(strangerRank).toBeNull();
	});

	it('makes a platform admin an administrator everywhere (is_platform_admin_account, holder_has_permission)', async () => {
		const { conferenceId } = await createConferenceOwnedByMe();
		const admin = await createSignedInClient('Platform admin');

		// Nothing in the app can turn the flag on, so the service role sets it, the
		// way conference-staff.test.ts does.
		const serviceRole = createServiceRoleClient();
		await serviceRole.from('profiles').update({ is_platform_admin: true }).eq('id', admin.userId);

		expect(
			await ask(admin.supabase, 'has_permission', {
				conference_id: conferenceId,
				permission: 'manage_roles'
			})
		).toBe(true);

		const { data: rank } = await admin.supabase.rpc('my_rank', { conference_id: conferenceId });

		expect(rank).toBe(-1);
	});
});

describe('conference_roles housekeeping', () => {
	it('stamps updated_at on every change (conference_roles_set_updated_at)', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const volunteerRole = await presetId(supabase, conferenceId, 'Volunteer');

		const { data: before } = await supabase
			.from('conference_roles')
			.select('updated_at')
			.eq('id', volunteerRole)
			.single();

		await supabase.from('conference_roles').update({ name: 'Helper' }).eq('id', volunteerRole);

		const { data: after } = await supabase
			.from('conference_roles')
			.select('updated_at')
			.eq('id', volunteerRole)
			.single();

		expect(new Date(after!.updated_at).getTime()).toBeGreaterThan(
			new Date(before!.updated_at).getTime()
		);
	});
});

import { beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSignedInClient, type SignedInClient } from './supabase-test-client';
import {
	createConferenceOwnedByMe,
	giveRole,
	presetRoleId,
	type ConferenceFixture
} from './conference-fixtures';

// The three functions the team page and the roles editor call, from migration
// 20261007130000_team_and_roles_screens and section 6 of
// docs/roles-and-permissions.md: "Edit roles" (set_member_roles), "Move up" and
// "Move down" (move_conference_role), and the rows "From the organisation"
// (list_conference_owners).
//
// Every conference here has, in order: Organiser (0), Deputy (1, may manage
// the team and the roles), Chair (3), Volunteer (4) and Press (5). The deputy
// is the reader the rank rule is about: below Organiser and Deputy, above the
// rest.

/** A conference with the five roles above and a deputy on its team. */
type RankedConference = ConferenceFixture & {
	deputy: SignedInClient;
	roleIds: Record<'organiser' | 'deputy' | 'chair' | 'volunteer' | 'press', string>;
};

/** Moves one of the presets to a new place, through the owner, who may put a role anywhere. */
async function placeRole(owner: SupabaseClient, roleId: string, position: number): Promise<void> {
	const { error } = await owner.from('conference_roles').update({ position }).eq('id', roleId);

	if (error) {
		throw new Error(`Could not move the fixture role: ${error.message}`);
	}
}

/** Makes a role at a given place, through the owner. */
async function makeRole(
	owner: SupabaseClient,
	conferenceId: string,
	name: string,
	position: number,
	permissions: string[] = []
): Promise<string> {
	const { data, error } = await owner
		.from('conference_roles')
		.insert({ conference_id: conferenceId, name, position, permissions })
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not make the fixture role: ${error?.message}`);
	}

	return data.id;
}

async function createRankedConference(): Promise<RankedConference> {
	const fixture = await createConferenceOwnedByMe();
	const owner = fixture.supabase;
	const organiser = await presetRoleId(owner, fixture.conferenceId, 'Organiser');
	const chair = await presetRoleId(owner, fixture.conferenceId, 'Chair');
	const volunteer = await presetRoleId(owner, fixture.conferenceId, 'Volunteer');

	await placeRole(owner, volunteer, 4);
	await placeRole(owner, chair, 3);

	const deputyRole = await makeRole(owner, fixture.conferenceId, 'Deputy', 1, [
		'manage_team',
		'manage_roles'
	]);
	const press = await makeRole(owner, fixture.conferenceId, 'Press', 5);
	const deputy = await createSignedInClient('Sofia Deputy');

	await giveRole(owner, fixture.conferenceId, deputy.userId, deputyRole);

	return {
		...fixture,
		deputy,
		roleIds: { organiser, deputy: deputyRole, chair, volunteer, press }
	};
}

/** The roles somebody holds on the conference, as ids, read by the owner. */
async function heldRoleIds(conference: RankedConference, userId: string): Promise<string[]> {
	const { data, error } = await conference.supabase
		.from('conference_role_members')
		.select('role_id')
		.eq('conference_id', conference.conferenceId)
		.eq('user_id', userId);

	if (error) {
		throw new Error(`Could not read the memberships: ${error.message}`);
	}

	return (data ?? []).map((row) => row.role_id).sort();
}

/** The conference's roles by name, in the order the pages show them. */
async function roleOrder(conference: RankedConference): Promise<string[]> {
	const { data, error } = await conference.supabase
		.from('conference_roles')
		.select('name, position')
		.eq('conference_id', conference.conferenceId)
		.order('position')
		.order('name');

	if (error) {
		throw new Error(`Could not read the roles: ${error.message}`);
	}

	return (data ?? []).map((row) => row.name);
}

/** Calls set_member_roles as `client`. */
function setRoles(
	client: SupabaseClient,
	conference: RankedConference,
	userId: string,
	roleIds: string[]
) {
	return client.rpc('set_member_roles', {
		conference_id: conference.conferenceId,
		user_id: userId,
		role_ids: roleIds
	});
}

describe('set_member_roles', () => {
	let conference: RankedConference;
	let teammate: SignedInClient;

	beforeEach(async () => {
		conference = await createRankedConference();
		teammate = await createSignedInClient('Tomasz Teammate');
		await giveRole(
			conference.supabase,
			conference.conferenceId,
			teammate.userId,
			conference.roleIds.volunteer
		);
	});

	it('gives and takes several roles below the caller at once', async () => {
		const { chair, volunteer, press } = conference.roleIds;

		// The owner adds Chair, so that the deputy's one call both takes a role
		// off (Chair, which is below them) and gives one (Press). Taking a role
		// off asks only the rank rule; giving one asks the grant rule too, which
		// is why the deputy gives Press and Volunteer here and not Chair.
		await giveRole(conference.supabase, conference.conferenceId, teammate.userId, chair);

		const { error } = await setRoles(conference.deputy.supabase, conference, teammate.userId, [
			volunteer,
			press
		]);

		expect(error).toBeNull();
		expect(await heldRoleIds(conference, teammate.userId)).toEqual([volunteer, press].sort());

		await setRoles(conference.deputy.supabase, conference, teammate.userId, [press]);

		expect(await heldRoleIds(conference, teammate.userId)).toEqual([press]);
	});

	it('refuses a role carrying permissions the caller lacks, and changes nothing (guard_role_member_grant)', async () => {
		// Chair runs a room and the deputy cannot, so the deputy may not hand
		// Chair out, however far below them it sits: giving a role asks the same
		// can_grant that making one does (L7 of the security review).
		const { chair, volunteer } = conference.roleIds;
		const { error } = await setRoles(conference.deputy.supabase, conference, teammate.userId, [
			chair
		]);

		expect(error?.code).toBe('42501');
		expect(await heldRoleIds(conference, teammate.userId)).toEqual([volunteer]);
	});

	it('refuses a role at or above the caller, and changes nothing', async () => {
		const { organiser, deputy, volunteer } = conference.roleIds;

		for (const roleId of [organiser, deputy]) {
			const { error } = await setRoles(conference.deputy.supabase, conference, teammate.userId, [
				roleId
			]);

			expect(error?.code).toBe('42501');
		}

		// The volunteer role the call would have taken off is still there: the
		// whole call is undone, not only the refused half.
		expect(await heldRoleIds(conference, teammate.userId)).toEqual([volunteer]);
	});

	it('refuses to take off a role above the caller, and changes nothing', async () => {
		const { organiser, volunteer } = conference.roleIds;

		await giveRole(conference.supabase, conference.conferenceId, teammate.userId, organiser);

		const { error } = await setRoles(conference.deputy.supabase, conference, teammate.userId, [
			volunteer
		]);

		expect(error?.code).toBe('42501');
		expect(error?.message).toBe('You can only take off roles below your own.');
		expect(await heldRoleIds(conference, teammate.userId)).toEqual([organiser, volunteer].sort());
	});

	it('never lets somebody change their own roles', async () => {
		const { deputy, press } = conference.roleIds;
		const { error } = await setRoles(
			conference.deputy.supabase,
			conference,
			conference.deputy.userId,
			[deputy, press]
		);

		expect(error?.code).toBe('42501');
		expect(await heldRoleIds(conference, conference.deputy.userId)).toEqual([deputy]);
	});

	it('refuses somebody who may not manage the team', async () => {
		const { press } = conference.roleIds;
		const { error } = await setRoles(teammate.supabase, conference, conference.deputy.userId, [
			press
		]);

		expect(error).not.toBeNull();
		expect(await heldRoleIds(conference, conference.deputy.userId)).toEqual([
			conference.roleIds.deputy
		]);
	});

	it('lets an owner give any role, and take every role away', async () => {
		const { organiser } = conference.roleIds;

		await setRoles(conference.supabase, conference, teammate.userId, [organiser]);
		expect(await heldRoleIds(conference, teammate.userId)).toEqual([organiser]);

		await setRoles(conference.supabase, conference, teammate.userId, []);
		expect(await heldRoleIds(conference, teammate.userId)).toEqual([]);
	});
});

describe('move_conference_role', () => {
	let conference: RankedConference;

	beforeEach(async () => {
		conference = await createRankedConference();
	});

	/** Calls move_conference_role as `client`. */
	function move(client: SupabaseClient, roleId: string, direction: string) {
		return client.rpc('move_conference_role', { role_id: roleId, direction });
	}

	it('swaps a role with the one above it, and with the one below it', async () => {
		const { press } = conference.roleIds;

		expect((await move(conference.deputy.supabase, press, 'up')).error).toBeNull();
		expect(await roleOrder(conference)).toEqual([
			'Organiser',
			'Deputy',
			'Chair',
			'Press',
			'Volunteer'
		]);

		expect((await move(conference.deputy.supabase, press, 'down')).error).toBeNull();
		expect(await roleOrder(conference)).toEqual([
			'Organiser',
			'Deputy',
			'Chair',
			'Volunteer',
			'Press'
		]);
	});

	it('refuses to swap with a role holding permissions the caller lacks', async () => {
		// Chair can run a room and the deputy cannot, so the deputy may not
		// change Chair, its place included: section 7's update check is
		// can_grant on the row as it will be.
		const { error } = await move(conference.deputy.supabase, conference.roleIds.volunteer, 'up');

		expect(error?.code).toBe('42501');
		expect(await roleOrder(conference)).toEqual([
			'Organiser',
			'Deputy',
			'Chair',
			'Volunteer',
			'Press'
		]);
	});

	it('refuses to move a role up into the caller’s own place', async () => {
		// Volunteer holds nothing, so only the rank rule can stop the swap.
		await placeRole(conference.supabase, conference.roleIds.volunteer, 2);

		const { error } = await move(conference.deputy.supabase, conference.roleIds.volunteer, 'up');

		expect(error?.code).toBe('42501');
		expect(await roleOrder(conference)).toEqual([
			'Organiser',
			'Deputy',
			'Volunteer',
			'Chair',
			'Press'
		]);
	});

	it('refuses to move a role at or above the caller', async () => {
		const { error } = await move(conference.deputy.supabase, conference.roleIds.organiser, 'down');

		expect(error?.code).toBe('42501');
		expect((await roleOrder(conference))[0]).toBe('Organiser');
	});

	it('does nothing to the first role moved up or the last moved down', async () => {
		expect((await move(conference.supabase, conference.roleIds.organiser, 'up')).error).toBeNull();
		expect((await move(conference.supabase, conference.roleIds.press, 'down')).error).toBeNull();
		expect(await roleOrder(conference)).toEqual([
			'Organiser',
			'Deputy',
			'Chair',
			'Volunteer',
			'Press'
		]);
	});

	it('separates two roles that share a place', async () => {
		await makeRole(conference.supabase, conference.conferenceId, 'Archive', 9);
		const second = await makeRole(conference.supabase, conference.conferenceId, 'Bursary', 9);

		await move(conference.supabase, second, 'up');

		const order = await roleOrder(conference);

		expect(order.indexOf('Bursary')).toBeLessThan(order.indexOf('Archive'));
	});

	it('knows only up and down', async () => {
		const { error } = await move(conference.supabase, conference.roleIds.press, 'sideways');

		expect(error?.code).toBe('22023');
	});
});

describe('list_conference_owners', () => {
	it('lists the owner to the owner and to the team, and to nobody else', async () => {
		const conference = await createRankedConference();
		const stranger = await createSignedInClient('Stranger');
		const expected = [{ user_id: conference.userId, organization_role: 'owner' }];

		for (const client of [conference.supabase, conference.deputy.supabase]) {
			const { data, error } = await client.rpc('list_conference_owners', {
				conference_id: conference.conferenceId
			});

			expect(error).toBeNull();
			expect(data).toEqual(expected);
		}

		const { data } = await stranger.supabase.rpc('list_conference_owners', {
			conference_id: conference.conferenceId
		});

		expect(data).toEqual([]);
	});
});

import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	createServiceRoleClient,
	createSignedInClient,
	type SignedInClient
} from './supabase-test-client';
import {
	addCommittee,
	addRole,
	addSession,
	createCommitteeRoom,
	createConferenceOwnedByMe,
	giveRole,
	presetRoleId,
	type CommitteeRoomFixture,
	type ConferenceFixture
} from './conference-fixtures';

// The holes the security review of 2026-10-10 found in the roles model, and
// the migration that closes them (20261022122000_conference_roles_hardening):
//
//   H4  a role can never move to another conference, whoever asks;
//   L5  assigning people to committees follows the rank rule;
//   L6  retitling somebody follows the rank rule, and a title has a ceiling;
//   L7  giving a role, or inviting somebody to one, takes holding its permissions;
//   L8  nobody writes a staff row directly, and nobody is put on the team by
//       being assigned to a committee: they come from accepting an invitation
//       (the second half is 20261022170000_final_review_fixes);
//   L9  who gave a role is recorded and cannot be forged;
//   M17 session notes belong to write_chair_notes, as chair_notes do;
//   I26 confirm_awards counts conference-wide only.
//
// The reader of most tests is a "Deputy": somebody at position 1 who may manage
// the team and the roles but is not an administrator, which is exactly the
// person the rank rule and the grant rule are written about. As everywhere in
// this folder, a refused insert comes back as an error, while a refused update
// or delete comes back as no rows, so those tests read the row back through a
// client that can see it.

/** The roles the deputy fixture makes, by id. */
type DeputyRoleIds = {
	organiser: string;
	deputy: string;
	volunteer: string;
	/** Holds no permission at all, so the deputy may give it. */
	runner: string;
	/** Carries manage_invoices, which the deputy does not hold, so they may not give it. */
	treasurer: string;
};

type DeputyFixture = ConferenceFixture & {
	deputy: SignedInClient;
	/** Holds the Organiser role, position 0: above the deputy. */
	organiser: SignedInClient;
	/** Holds the Volunteer role, position 2: below the deputy. */
	volunteer: SignedInClient;
	roleIds: DeputyRoleIds;
};

/** Makes a role at a given place, through the owner, who may put a role anywhere. */
async function makeRole(
	owner: SupabaseClient,
	conferenceId: string,
	name: string,
	position: number,
	permissions: string[]
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

/**
 * Puts somebody on the team with no role. Since L8 nobody may insert a staff
 * row directly, so this does with the service role what accepting an
 * invitation would have done.
 */
async function putOnTeam(conferenceId: string, userId: string): Promise<void> {
	const { error } = await createServiceRoleClient()
		.from('conference_staff')
		.insert({ conference_id: conferenceId, user_id: userId });

	if (error) {
		throw new Error(`Could not put the fixture person on the team: ${error.message}`);
	}
}

async function createConferenceWithDeputy(): Promise<DeputyFixture> {
	const fixture = await createConferenceOwnedByMe();
	const owner = fixture.supabase;
	const organiserRole = await presetRoleId(owner, fixture.conferenceId, 'Organiser');
	const volunteerRole = await presetRoleId(owner, fixture.conferenceId, 'Volunteer');
	const deputyRole = await makeRole(owner, fixture.conferenceId, 'Deputy', 1, [
		'manage_team',
		'manage_roles'
	]);
	const runnerRole = await makeRole(owner, fixture.conferenceId, 'Runner', 5, []);
	const treasurerRole = await makeRole(owner, fixture.conferenceId, 'Treasurer', 6, [
		'manage_invoices'
	]);

	const deputy = await createSignedInClient('Sofia Deputy');
	const organiser = await createSignedInClient('Omar Organiser');
	const volunteer = await createSignedInClient('Vera Volunteer');

	await giveRole(owner, fixture.conferenceId, deputy.userId, deputyRole);
	await giveRole(owner, fixture.conferenceId, organiser.userId, organiserRole);
	await giveRole(owner, fixture.conferenceId, volunteer.userId, volunteerRole);

	return {
		...fixture,
		deputy,
		organiser,
		volunteer,
		roleIds: {
			organiser: organiserRole,
			deputy: deputyRole,
			volunteer: volunteerRole,
			runner: runnerRole,
			treasurer: treasurerRole
		}
	};
}

/**
 * A second conference that `person` owns outright, the way anybody can: make
 * an organisation (its creator becomes an owner) and a conference in it. The
 * same rows `createConferenceOwnedByMe` writes, for an account that already
 * exists.
 */
async function conferenceOwnedBy(person: SignedInClient): Promise<string> {
	const suffix = crypto.randomUUID();
	const { data: organization, error: organizationError } = await person.supabase
		.from('organizations')
		.insert({ name: 'Second org', slug: `second-org-${suffix}`, created_by: person.userId })
		.select('id')
		.single();

	if (organizationError || !organization) {
		throw new Error(`Could not create the second organisation: ${organizationError?.message}`);
	}

	const { data: conference, error: conferenceError } = await person.supabase
		.from('conferences')
		.insert({
			name: 'Second Conference',
			slug: `second-conference-${suffix}`,
			city: 'Utrecht',
			country_code: 'NL',
			start_date: '2020-03-01',
			end_date: '2020-03-03',
			organization_id: organization.id,
			created_by: person.userId
		})
		.select('id')
		.single();

	if (conferenceError || !conference) {
		throw new Error(`Could not create the second conference: ${conferenceError?.message}`);
	}

	return conference.id;
}

/** The conference a role sits on, read past every policy so a moved role would show up. */
async function conferenceOfRole(roleId: string): Promise<string | null> {
	const { data } = await createServiceRoleClient()
		.from('conference_roles')
		.select('conference_id')
		.eq('id', roleId)
		.single();

	return data?.conference_id ?? null;
}

describe('H4: a role stays on its conference', () => {
	it('refuses a deputy who owns another conference moving a role there (protect_conference_roles_conference, conference_roles_protect_conference)', async () => {
		const fixture = await createConferenceWithDeputy();
		const ownConference = await conferenceOwnedBy(fixture.deputy);

		// The deputy manages Runner here (position 5 is below theirs) and is an
		// administrator of their own conference, so before the trigger both
		// halves of the update policy let this through, and every holder of
		// Runner would then be a member of a role the deputy could rewrite to
		// administrator.
		const { error } = await fixture.deputy.supabase
			.from('conference_roles')
			.update({ conference_id: ownConference })
			.eq('id', fixture.roleIds.runner)
			.select('id');

		expect(error?.message).toContain('cannot be moved');
		expect(await conferenceOfRole(fixture.roleIds.runner)).toBe(fixture.conferenceId);
	});

	it('refuses the move for every caller, the service role included', async () => {
		const fixture = await createConferenceWithDeputy();
		const other = await createConferenceOwnedByMe();

		const { error } = await createServiceRoleClient()
			.from('conference_roles')
			.update({ conference_id: other.conferenceId })
			.eq('id', fixture.roleIds.runner);

		expect(error?.message).toContain('cannot be moved');
	});
});

describe('L5: assigning people to committees follows the rank rule', () => {
	it('refuses a deputy assigning themselves, or unassigning somebody above them, and lets them assign somebody below', async () => {
		const fixture = await createConferenceWithDeputy();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);

		await fixture.supabase
			.from('committee_chairs')
			.insert({ committee_id: committeeId, user_id: fixture.organiser.userId });

		// Nobody may manage themselves under the rank rule (one's own rank is
		// not below one's own rank), so a deputy cannot put themselves on a
		// committee; an administrator can, because the rule does not bind them.
		const { error: selfError } = await fixture.deputy.supabase
			.from('committee_chairs')
			.insert({ committee_id: committeeId, user_id: fixture.deputy.userId });

		expect(selfError).not.toBeNull();

		const { data: unassigned } = await fixture.deputy.supabase
			.from('committee_chairs')
			.delete()
			.eq('committee_id', committeeId)
			.eq('user_id', fixture.organiser.userId)
			.select('user_id');

		expect(unassigned).toEqual([]);

		const { error: belowError } = await fixture.deputy.supabase
			.from('committee_chairs')
			.insert({ committee_id: committeeId, user_id: fixture.volunteer.userId });

		expect(belowError).toBeNull();
	});
});

describe('L6: titles follow the rank rule and have a ceiling', () => {
	it('refuses a deputy retitling somebody above them, and lets them retitle somebody below', async () => {
		const fixture = await createConferenceWithDeputy();

		const { data: above } = await fixture.deputy.supabase
			.from('conference_staff')
			.update({ title: 'Demoted' })
			.eq('conference_id', fixture.conferenceId)
			.eq('user_id', fixture.organiser.userId)
			.select('title');

		expect(above).toEqual([]);

		const { data: below } = await fixture.deputy.supabase
			.from('conference_staff')
			.update({ title: 'Registration desk' })
			.eq('conference_id', fixture.conferenceId)
			.eq('user_id', fixture.volunteer.userId)
			.select('title');

		expect(below).toEqual([{ title: 'Registration desk' }]);
	});

	it('caps a staff title at 80 characters (conference_staff_title_length)', async () => {
		const fixture = await createConferenceWithDeputy();

		const { error: tooLong } = await fixture.supabase
			.from('conference_staff')
			.update({ title: 'x'.repeat(81) })
			.eq('conference_id', fixture.conferenceId)
			.eq('user_id', fixture.volunteer.userId);

		// 23514 is Postgres for "a check constraint refused the row".
		expect(tooLong?.code).toBe('23514');

		const { error: justFits } = await fixture.supabase
			.from('conference_staff')
			.update({ title: 'x'.repeat(80) })
			.eq('conference_id', fixture.conferenceId)
			.eq('user_id', fixture.volunteer.userId);

		expect(justFits).toBeNull();
	});
});

describe('L7: giving a role takes holding its permissions', () => {
	it('refuses a deputy giving a role whose permissions they lack (guard_role_member_grant, conference_role_members_guard_grant, can_grant_role_permissions)', async () => {
		const fixture = await createConferenceWithDeputy();
		const newcomer = await createSignedInClient('Newcomer');

		await putOnTeam(fixture.conferenceId, newcomer.userId);

		// Treasurer is below the deputy, so the rank rule alone would let this
		// through: the deputy would be handing out manage_invoices, which they
		// do not hold, to anybody, a second account of their own included.
		const { error: lacking } = await fixture.deputy.supabase
			.from('conference_role_members')
			.insert({
				conference_id: fixture.conferenceId,
				user_id: newcomer.userId,
				role_id: fixture.roleIds.treasurer
			});

		expect(lacking?.code).toBe('42501');

		const { error: viaDialog } = await fixture.deputy.supabase.rpc('set_member_roles', {
			conference_id: fixture.conferenceId,
			user_id: newcomer.userId,
			role_ids: [fixture.roleIds.treasurer]
		});

		expect(viaDialog?.code).toBe('42501');

		const { error: held } = await fixture.deputy.supabase.from('conference_role_members').insert({
			conference_id: fixture.conferenceId,
			user_id: newcomer.userId,
			role_id: fixture.roleIds.runner
		});

		expect(held).toBeNull();
	});

	it('refuses a deputy inviting somebody to a role whose permissions they lack (guard_invite_role_rank, invites_guard_role_rank)', async () => {
		const fixture = await createConferenceWithDeputy();

		/** One invitation to `roleId`, sent by the deputy. */
		function invite(roleId: string) {
			return fixture.deputy.supabase.from('invites').insert({
				kind: 'conference_staff',
				conference_id: fixture.conferenceId,
				email: `invited-${crypto.randomUUID()}@example.com`,
				role_id: roleId,
				token: crypto.randomUUID().replaceAll('-', ''),
				invited_by: fixture.deputy.userId
			});
		}

		const { error: lacking } = await invite(fixture.roleIds.treasurer);
		const { error: held } = await invite(fixture.roleIds.runner);

		expect(lacking?.code).toBe('42501');
		expect(held).toBeNull();
	});
});

describe('L8: nobody writes a staff row directly', () => {
	it('refuses even an administrator adding somebody to the team directly, or by assigning them to a committee', async () => {
		const fixture = await createConferenceWithDeputy();
		const newcomer = await createSignedInClient('Newcomer');

		// Staff rows come from accept_invite, which runs as the database owner.
		// The team page sends invitations; nothing in the app inserts here.
		const { error } = await fixture.supabase
			.from('conference_staff')
			.insert({ conference_id: fixture.conferenceId, user_id: newcomer.userId });

		expect(error).not.toBeNull();

		// Nor the way round it: ensure_chair_is_staff runs as the owner and put
		// whoever was assigned to a committee on the team, so the assignment of
		// somebody not on it is refused first (committee_chairs_already_on_team).
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
		const { error: assignError } = await fixture.supabase
			.from('committee_chairs')
			.insert({ committee_id: committeeId, user_id: newcomer.userId });

		expect(assignError?.code).toBe('42501');
		expect(assignError?.message).toContain('Invite them first');

		const { data: onTeam } = await fixture.supabase
			.from('conference_staff')
			.select('user_id')
			.eq('conference_id', fixture.conferenceId)
			.eq('user_id', newcomer.userId);

		expect(onTeam).toEqual([]);

		// Somebody already on the team is assigned as before.
		const { error: memberError } = await fixture.supabase
			.from('committee_chairs')
			.insert({ committee_id: committeeId, user_id: fixture.volunteer.userId });

		expect(memberError).toBeNull();
	});
});

describe('L9: who gave a role is recorded', () => {
	it('records the giver and refuses a forged granted_by', async () => {
		const fixture = await createConferenceWithDeputy();
		const newcomer = await createSignedInClient('Newcomer');

		await putOnTeam(fixture.conferenceId, newcomer.userId);

		const { error: forged } = await fixture.deputy.supabase.from('conference_role_members').insert({
			conference_id: fixture.conferenceId,
			user_id: newcomer.userId,
			role_id: fixture.roleIds.runner,
			granted_by: fixture.userId
		});

		expect(forged).not.toBeNull();

		const { error } = await fixture.deputy.supabase.from('conference_role_members').insert({
			conference_id: fixture.conferenceId,
			user_id: newcomer.userId,
			role_id: fixture.roleIds.runner
		});

		expect(error).toBeNull();

		const { data } = await fixture.supabase
			.from('conference_role_members')
			.select('granted_by')
			.eq('role_id', fixture.roleIds.runner)
			.eq('user_id', newcomer.userId);

		expect(data).toEqual([{ granted_by: fixture.deputy.userId }]);
	});
});

/**
 * A new team member with one role that applies in the room's committee, which
 * `committee_chairs` records, the way committee-permissions.test.ts does it.
 */
async function assignedWith(
	room: CommitteeRoomFixture,
	permissions: string[]
): Promise<SignedInClient> {
	const person = await createSignedInClient('Team Member');
	const roleId = await addRole(room.supabase, room.conferenceId, {
		name: `Role ${crypto.randomUUID().slice(0, 8)}`,
		scope: 'committees',
		permissions
	});

	await giveRole(room.supabase, room.conferenceId, person.userId, roleId);

	const { error } = await room.supabase
		.from('committee_chairs')
		.insert({ committee_id: room.committeeId, user_id: person.userId });

	if (error) {
		throw new Error(`Could not assign the fixture person a committee: ${error.message}`);
	}

	return person;
}

describe('M17: session notes belong to write_chair_notes', () => {
	it('shows a co-chair who only runs the clock no session notes, and lets a note keeper read and save them', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const secondSessionId = await addSession(room.chair.supabase, room.committeeId, 'Session II');

		const { error: started } = await room.chair.supabase
			.from('committee_session_notes')
			.insert({ session_id: sessionId, committee_id: room.committeeId, body: 'Opening.' });

		expect(started).toBeNull();

		const clock = await assignedWith(room, ['run_room']);
		const keeper = await assignedWith(room, ['write_chair_notes']);

		// Session notes are remarks about named people, like chair_notes: a role
		// trimmed to running the clock is exactly the one that should not see them.
		const { data: seenByClock } = await clock.supabase
			.from('committee_session_notes')
			.select('body')
			.eq('committee_id', room.committeeId);
		const { data: savedByClock } = await clock.supabase
			.from('committee_session_notes')
			.update({ body: 'Rewritten by the clock.' })
			.eq('session_id', sessionId)
			.select('body');
		const { error: startedByClock } = await clock.supabase
			.from('committee_session_notes')
			.insert({ session_id: secondSessionId, committee_id: room.committeeId, body: 'Late.' });

		expect(seenByClock).toEqual([]);
		expect(savedByClock).toEqual([]);
		expect(startedByClock).not.toBeNull();

		const { data: seenByKeeper } = await keeper.supabase
			.from('committee_session_notes')
			.select('body')
			.eq('committee_id', room.committeeId);
		const { data: savedByKeeper } = await keeper.supabase
			.from('committee_session_notes')
			.update({ body: 'Opening, then sanctions.' })
			.eq('session_id', sessionId)
			.select('body, revision');

		expect(seenByKeeper).toEqual([{ body: 'Opening.' }]);
		expect(savedByKeeper).toEqual([{ body: 'Opening, then sanctions.', revision: 2 }]);
	});
});

describe('I26: confirm_awards counts conference-wide only', () => {
	it('lets a per-committee holder of confirm_awards confirm nothing, and a conference-wide one confirm', async () => {
		const room = await createCommitteeRoom();
		const proposer = await assignedWith(room, ['propose_awards']);
		const perCommittee = await assignedWith(room, ['confirm_awards']);
		const academics = await createSignedInClient('Head of Academics');
		const academicsRole = await addRole(room.supabase, room.conferenceId, {
			name: 'Head of academics',
			permissions: ['confirm_awards']
		});

		await giveRole(room.supabase, room.conferenceId, academics.userId, academicsRole);

		const { data: award, error: proposed } = await proposer.supabase
			.from('awards')
			.insert({
				committee_id: room.committeeId,
				seat_id: room.seatId,
				kind: 'best_delegate',
				title: 'Best Delegate'
			})
			.select('id')
			.single();

		expect(proposed).toBeNull();

		const { data: confirmable } = await perCommittee.supabase.rpc('confirmable_committee_ids');
		const { data: byPerCommittee } = await perCommittee.supabase
			.from('awards')
			.update({ status: 'confirmed' })
			.eq('id', award?.id ?? '')
			.select('status');
		const { data: byAcademics } = await academics.supabase
			.from('awards')
			.update({ status: 'confirmed' })
			.eq('id', award?.id ?? '')
			.select('status');

		expect(confirmable).toEqual([]);
		expect(byPerCommittee).toEqual([]);
		expect(byAcademics).toEqual([{ status: 'confirmed' }]);
	});
});

import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient, createSignedInClient } from './supabase-test-client';
import {
	addOrganizationMember,
	addRole,
	createConferenceOwnedByMe,
	giveRole,
	presetRoleId,
	type ConferenceFixture
} from './conference-fixtures';

// What supabase/migrations/20261023121000_invitations_hold_while_sent.sql
// closed, around findings H1, M11, M15 and L1 of
// docs/security-review-2026-10-10.md:
//
// * accepting asks that the sender could still send the invitation: still an
//   admin of the organisation, or still holding manage_team above the role
//   and every permission the role gives;
// * a browser cannot make an invitation last longer than fourteen days;
// * a token is url-safe characters only, so it cannot steer the bell's link;
// * a team manager withdraws only invitations to roles below their own;
// * no browser may update an invitation at all.
//
// tests/db/security-invites.test.ts covers the earlier invitation fixes, and
// nothing here repeats it.

/** A token is 32 url-safe characters. Any unique text of that length does for a test. */
function makeToken(): string {
	return crypto.randomUUID().replaceAll('-', '');
}

/** The SQLSTATE for a check constraint that refused a row. */
const CHECK_VIOLATION = '23514';

/** The SQLSTATE for a table the role may not write. */
const PERMISSION_DENIED = '42501';

/** The longest an invitation may last, in milliseconds. */
const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;

/** How far the test machine's clock and the database's may disagree. */
const CLOCK_SLACK = 60 * 1000;

/** An organisation invitation for `email`, sent through the sender's own client. */
async function inviteToOrganization(
	sender: SupabaseClient,
	senderId: string,
	organizationId: string,
	email: string
): Promise<string> {
	const { data, error } = await sender
		.from('invites')
		.insert({
			kind: 'organization_member',
			organization_id: organizationId,
			email,
			role: 'member',
			token: makeToken(),
			invited_by: senderId
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the fixture invitation: ${error?.message}`);
	}

	return data.id;
}

/** A team invitation to `roleId` for `email`, sent through the sender's own client. */
async function inviteToTeam(
	sender: SupabaseClient,
	senderId: string,
	conferenceId: string,
	roleId: string,
	email: string
): Promise<string> {
	const { data, error } = await sender
		.from('invites')
		.insert({
			kind: 'conference_staff',
			conference_id: conferenceId,
			role_id: roleId,
			email,
			token: makeToken(),
			invited_by: senderId
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the fixture invitation: ${error?.message}`);
	}

	return data.id;
}

/** Whether the invitation row is still there, read past every policy. */
async function invitationExists(inviteId: string): Promise<boolean> {
	const { data, error } = await createServiceRoleClient()
		.from('invites')
		.select('id')
		.eq('id', inviteId);

	expect(error).toBeNull();

	return (data ?? []).length === 1;
}

/**
 * A conference with a "Team lead" at position 1 who may manage the team, the
 * sort of deputy whose say-so these tests take away. The owner, at the top,
 * makes the role and gives it.
 */
async function conferenceWithATeamLead(): Promise<{
	owner: ConferenceFixture;
	lead: Awaited<ReturnType<typeof createSignedInClient>>;
	leadRoleId: string;
	volunteerRoleId: string;
}> {
	const owner = await createConferenceOwnedByMe();
	const lead = await createSignedInClient('Team Lead');

	const leadRoleId = await addRole(owner.supabase, owner.conferenceId, {
		name: 'Team lead',
		permissions: ['manage_team']
	});

	const { error } = await owner.supabase
		.from('conference_roles')
		.update({ position: 1 })
		.eq('id', leadRoleId);

	expect(error).toBeNull();

	await giveRole(owner.supabase, owner.conferenceId, lead.userId, leadRoleId);

	const volunteerRoleId = await presetRoleId(owner.supabase, owner.conferenceId, 'Volunteer');

	return { owner, lead, leadRoleId, volunteerRoleId };
}

describe('an invitation answers to the person who sent it (security review H1)', () => {
	it('still works while an organisation admin who sent it is an admin', async () => {
		const owner = await createConferenceOwnedByMe();
		const admin = await createSignedInClient('Admin');
		const invitee = await createSignedInClient('Invitee');
		await addOrganizationMember(owner.organizationId, admin.userId, 'admin');

		const inviteId = await inviteToOrganization(
			admin.supabase,
			admin.userId,
			owner.organizationId,
			invitee.email
		);

		const { error } = await invitee.supabase.rpc('accept_invite_by_id', { invite_id: inviteId });

		expect(error).toBeNull();
	});

	it('is refused once the admin who sent it has left the organisation', async () => {
		const owner = await createConferenceOwnedByMe();
		const admin = await createSignedInClient('Admin');
		const invitee = await createSignedInClient('Invitee');
		await addOrganizationMember(owner.organizationId, admin.userId, 'admin');

		const inviteId = await inviteToOrganization(
			admin.supabase,
			admin.userId,
			owner.organizationId,
			invitee.email
		);

		const { error: removeError } = await createServiceRoleClient()
			.from('organization_members')
			.delete()
			.eq('organization_id', owner.organizationId)
			.eq('user_id', admin.userId);

		expect(removeError).toBeNull();

		const { error } = await invitee.supabase.rpc('accept_invite_by_id', { invite_id: inviteId });

		expect(error?.message).toContain('can no longer invite people to this organisation');

		const { data: membership } = await createServiceRoleClient()
			.from('organization_members')
			.select('user_id')
			.eq('organization_id', owner.organizationId)
			.eq('user_id', invitee.userId);

		expect(membership).toEqual([]);
	});

	it('is refused once the admin who sent it is only a member', async () => {
		const owner = await createConferenceOwnedByMe();
		const admin = await createSignedInClient('Admin');
		const invitee = await createSignedInClient('Invitee');
		await addOrganizationMember(owner.organizationId, admin.userId, 'admin');

		const inviteId = await inviteToOrganization(
			admin.supabase,
			admin.userId,
			owner.organizationId,
			invitee.email
		);

		const { error: demoteError } = await createServiceRoleClient()
			.from('organization_members')
			.update({ role: 'member' })
			.eq('organization_id', owner.organizationId)
			.eq('user_id', admin.userId);

		expect(demoteError).toBeNull();

		const { error } = await invitee.supabase.rpc('accept_invite_by_id', { invite_id: inviteId });

		expect(error?.message).toContain('can no longer invite people to this organisation');
	});

	it('still works while the team lead who sent it can give the role', async () => {
		const { owner, lead, volunteerRoleId } = await conferenceWithATeamLead();
		const invitee = await createSignedInClient('Invitee');

		const inviteId = await inviteToTeam(
			lead.supabase,
			lead.userId,
			owner.conferenceId,
			volunteerRoleId,
			invitee.email
		);

		const { error } = await invitee.supabase.rpc('accept_invite_by_id', { invite_id: inviteId });

		expect(error).toBeNull();
	});

	it('is refused once the team lead who sent it has lost their role', async () => {
		const { owner, lead, leadRoleId, volunteerRoleId } = await conferenceWithATeamLead();
		const invitee = await createSignedInClient('Invitee');

		const inviteId = await inviteToTeam(
			lead.supabase,
			lead.userId,
			owner.conferenceId,
			volunteerRoleId,
			invitee.email
		);

		const { error: removeError } = await owner.supabase
			.from('conference_role_members')
			.delete()
			.eq('role_id', leadRoleId)
			.eq('user_id', lead.userId);

		expect(removeError).toBeNull();

		const { error } = await invitee.supabase.rpc('accept_invite_by_id', { invite_id: inviteId });

		expect(error?.message).toContain('can no longer give this role');

		const { data: staff } = await createServiceRoleClient()
			.from('conference_staff')
			.select('user_id')
			.eq('conference_id', owner.conferenceId)
			.eq('user_id', invitee.userId);

		expect(staff).toEqual([]);
	});

	it('is refused once the role it offers has been moved up to the team lead', async () => {
		const { owner, lead } = await conferenceWithATeamLead();
		const invitee = await createSignedInClient('Invitee');

		const runnerRoleId = await addRole(owner.supabase, owner.conferenceId, {
			name: 'Runner',
			permissions: []
		});

		const { error: lowerError } = await owner.supabase
			.from('conference_roles')
			.update({ position: 5 })
			.eq('id', runnerRoleId);

		expect(lowerError).toBeNull();

		const inviteId = await inviteToTeam(
			lead.supabase,
			lead.userId,
			owner.conferenceId,
			runnerRoleId,
			invitee.email
		);

		const { error: raiseError } = await owner.supabase
			.from('conference_roles')
			.update({ position: 1 })
			.eq('id', runnerRoleId);

		expect(raiseError).toBeNull();

		const { error } = await invitee.supabase.rpc('accept_invite_by_id', { invite_id: inviteId });

		expect(error?.message).toContain('can no longer give this role');
	});

	it('is refused once the team lead who sent it has lost a permission the role gives', async () => {
		const { owner, lead, leadRoleId } = await conferenceWithATeamLead();
		const invitee = await createSignedInClient('Invitee');

		function setLeadPermissions(permissions: string[]) {
			return owner.supabase.from('conference_roles').update({ permissions }).eq('id', leadRoleId);
		}

		// The lead may read welfare details while they send the invitation, so
		// sending it is allowed, and then loses that before it is accepted.
		const welfareRoleId = await addRole(owner.supabase, owner.conferenceId, {
			name: 'Welfare officer',
			permissions: ['read_welfare_details']
		});

		const { error: lowerError } = await owner.supabase
			.from('conference_roles')
			.update({ position: 5 })
			.eq('id', welfareRoleId);

		expect(lowerError).toBeNull();
		expect((await setLeadPermissions(['manage_team', 'read_welfare_details'])).error).toBeNull();

		const inviteId = await inviteToTeam(
			lead.supabase,
			lead.userId,
			owner.conferenceId,
			welfareRoleId,
			invitee.email
		);

		expect((await setLeadPermissions(['manage_team'])).error).toBeNull();

		const { error } = await invitee.supabase.rpc('accept_invite_by_id', { invite_id: inviteId });

		expect(error?.message).toContain('can no longer give this role');

		const { data: roles } = await createServiceRoleClient()
			.from('conference_role_members')
			.select('role_id')
			.eq('conference_id', owner.conferenceId)
			.eq('user_id', invitee.userId);

		expect(roles).toEqual([]);
	});

	it('still works when the organisation owner sent it', async () => {
		const owner = await createConferenceOwnedByMe();
		const invitee = await createSignedInClient('Invitee');
		const organiserRoleId = await presetRoleId(owner.supabase, owner.conferenceId, 'Organiser');

		const inviteId = await inviteToTeam(
			owner.supabase,
			owner.userId,
			owner.conferenceId,
			organiserRoleId,
			invitee.email
		);

		const { error } = await invitee.supabase.rpc('accept_invite_by_id', { invite_id: inviteId });

		expect(error).toBeNull();
	});
});

describe('an invitation lasts fourteen days at most', () => {
	it('stores a far-off expiry as fourteen days from now', async () => {
		const owner = await createConferenceOwnedByMe();
		const sentAt = Date.now();

		const { data, error } = await owner.supabase
			.from('invites')
			.insert({
				kind: 'organization_member',
				organization_id: owner.organizationId,
				email: `far-off-${crypto.randomUUID()}@example.com`,
				role: 'member',
				token: makeToken(),
				invited_by: owner.userId,
				expires_at: '2099-01-01T00:00:00Z'
			})
			.select('expires_at')
			.single();

		expect(error).toBeNull();
		expect(new Date(data!.expires_at).getTime()).toBeLessThanOrEqual(
			sentAt + FOURTEEN_DAYS + CLOCK_SLACK
		);
	});

	it('keeps a shorter expiry somebody chose', async () => {
		const owner = await createConferenceOwnedByMe();
		const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

		const { data, error } = await owner.supabase
			.from('invites')
			.insert({
				kind: 'organization_member',
				organization_id: owner.organizationId,
				email: `tomorrow-${crypto.randomUUID()}@example.com`,
				role: 'member',
				token: makeToken(),
				invited_by: owner.userId,
				expires_at: tomorrow
			})
			.select('expires_at')
			.single();

		expect(error).toBeNull();
		expect(new Date(data!.expires_at).getTime()).toBe(new Date(tomorrow).getTime());
	});
});

describe('a token is url-safe characters only (security review L1)', () => {
	it('refuses a token that would steer the bell to another page', async () => {
		const owner = await createConferenceOwnedByMe();

		const { error } = await owner.supabase.from('invites').insert({
			kind: 'organization_member',
			organization_id: owner.organizationId,
			email: `steer-${crypto.randomUUID()}@example.com`,
			role: 'member',
			token: `${makeToken()}/../../settings?x=1`,
			invited_by: owner.userId
		});

		expect(error?.code).toBe(CHECK_VIOLATION);
	});
});

describe('a team manager withdraws only what they could have sent', () => {
	it('cannot withdraw an invitation to a role above their own', async () => {
		const { owner, lead } = await conferenceWithATeamLead();
		const organiserRoleId = await presetRoleId(owner.supabase, owner.conferenceId, 'Organiser');

		const inviteId = await inviteToTeam(
			owner.supabase,
			owner.userId,
			owner.conferenceId,
			organiserRoleId,
			`organiser-${crypto.randomUUID()}@example.com`
		);

		const { data, error } = await lead.supabase
			.from('invites')
			.delete()
			.eq('id', inviteId)
			.select('id');

		expect(error).toBeNull();
		expect(data).toEqual([]);
		expect(await invitationExists(inviteId)).toBe(true);
	});

	it('can withdraw an invitation to a role below their own that somebody else sent', async () => {
		const { owner, lead, volunteerRoleId } = await conferenceWithATeamLead();

		const inviteId = await inviteToTeam(
			owner.supabase,
			owner.userId,
			owner.conferenceId,
			volunteerRoleId,
			`volunteer-${crypto.randomUUID()}@example.com`
		);

		const { data, error } = await lead.supabase
			.from('invites')
			.delete()
			.eq('id', inviteId)
			.select('id');

		expect(error).toBeNull();
		expect(data).toEqual([{ id: inviteId }]);
	});

	it('lets the owner withdraw any of the conference’s invitations', async () => {
		const { owner, lead, volunteerRoleId } = await conferenceWithATeamLead();

		const inviteId = await inviteToTeam(
			lead.supabase,
			lead.userId,
			owner.conferenceId,
			volunteerRoleId,
			`volunteer-${crypto.randomUUID()}@example.com`
		);

		const { data, error } = await owner.supabase
			.from('invites')
			.delete()
			.eq('id', inviteId)
			.select('id');

		expect(error).toBeNull();
		expect(data).toEqual([{ id: inviteId }]);
	});
});

describe('no browser updates an invitation', () => {
	it('refuses the person who sent it, rather than changing nothing', async () => {
		const owner = await createConferenceOwnedByMe();
		const inviteId = await inviteToOrganization(
			owner.supabase,
			owner.userId,
			owner.organizationId,
			`update-${crypto.randomUUID()}@example.com`
		);

		const { error } = await owner.supabase
			.from('invites')
			.update({ expires_at: '2099-01-01T00:00:00Z' })
			.eq('id', inviteId);

		expect(error?.code).toBe(PERMISSION_DENIED);
	});
});

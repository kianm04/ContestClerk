import { describe, expect, it } from 'vitest';
import { createSignedInClient } from './supabase-test-client';
import { addOrganizationMember, createConferenceOwnedByMe } from './conference-fixtures';

// Organisations, their members, the trigger that keeps an owner in place, and
// delete_my_account. See the `organizations` and `organization_members` rows of
// specs/02-architecture/permissions.md and the account deletion section of
// specs/02-architecture/auth-and-onboarding.md.

/** Signs somebody up and gives them an organisation they own. */
async function createOrganizationOwnedByMe() {
	const { supabase, userId, email } = await createSignedInClient();

	const { data, error } = await supabase
		.from('organizations')
		.insert({
			name: 'Owned org',
			slug: `owned-org-${crypto.randomUUID()}`,
			created_by: userId
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not create the test organisation: ${error?.message}`);
	}

	return { supabase, userId, email, organizationId: data.id };
}

describe('organizations, changing one', () => {
	it('lets an owner rename their organisation', async () => {
		const { supabase, organizationId } = await createOrganizationOwnedByMe();

		const { data, error } = await supabase
			.from('organizations')
			.update({ name: 'A better name', country_code: 'NL' })
			.eq('id', organizationId)
			.select('name');

		expect(error).toBeNull();
		expect(data).toEqual([{ name: 'A better name' }]);
	});

	it('refuses an ordinary member who tries to rename it', async () => {
		const { organizationId } = await createOrganizationOwnedByMe();
		const member = await createSignedInClient();

		await addOrganizationMember(organizationId, member.userId, 'member');

		const { data } = await member.supabase
			.from('organizations')
			.update({ name: 'Renamed by a member' })
			.eq('id', organizationId)
			.select('name');

		expect(data).toEqual([]);
	});

	it('refuses to let the app write the Stripe account id', async () => {
		const { supabase, organizationId } = await createOrganizationOwnedByMe();

		const { error } = await supabase
			.from('organizations')
			.update({ stripe_account_id: 'acct_made_up' })
			.eq('id', organizationId);

		expect(error?.message).toContain('Stripe');
	});
});

describe('organizations, deleting one', () => {
	it('lets an owner delete an organisation that runs nothing', async () => {
		const { supabase, organizationId } = await createOrganizationOwnedByMe();

		const { data, error } = await supabase
			.from('organizations')
			.delete()
			.eq('id', organizationId)
			.select('id');

		expect(error).toBeNull();
		expect(data).toEqual([{ id: organizationId }]);
	});

	it('refuses once the organisation has a conference', async () => {
		const { supabase, organizationId } = await createConferenceOwnedByMe();

		const { data } = await supabase
			.from('organizations')
			.delete()
			.eq('id', organizationId)
			.select('id');

		expect(data).toEqual([]);
	});
});

describe('organization_members', () => {
	it('lets the members of an organisation see each other', async () => {
		const { organizationId } = await createOrganizationOwnedByMe();
		const member = await createSignedInClient();

		await addOrganizationMember(organizationId, member.userId, 'member');

		const { data } = await member.supabase
			.from('organization_members')
			.select('role')
			.eq('organization_id', organizationId);

		expect(data?.length).toBe(2);
	});

	it('shows the members to nobody outside the organisation', async () => {
		const { organizationId } = await createOrganizationOwnedByMe();
		const stranger = await createSignedInClient();

		const { data } = await stranger.supabase
			.from('organization_members')
			.select('role')
			.eq('organization_id', organizationId);

		expect(data).toEqual([]);
	});

	it("refuses to let an ordinary member change somebody's role", async () => {
		const { organizationId, userId } = await createOrganizationOwnedByMe();
		const member = await createSignedInClient();

		await addOrganizationMember(organizationId, member.userId, 'member');

		const { data } = await member.supabase
			.from('organization_members')
			.update({ role: 'admin' })
			.eq('organization_id', organizationId)
			.eq('user_id', userId)
			.select('role');

		expect(data).toEqual([]);
	});

	it('refuses to let an ordinary member throw somebody else out', async () => {
		const { organizationId, userId } = await createOrganizationOwnedByMe();
		const member = await createSignedInClient();

		await addOrganizationMember(organizationId, member.userId, 'member');

		const { data } = await member.supabase
			.from('organization_members')
			.delete()
			.eq('organization_id', organizationId)
			.eq('user_id', userId)
			.select('user_id');

		expect(data).toEqual([]);
	});

	it('refuses to let somebody add themselves to an organisation', async () => {
		const { organizationId } = await createOrganizationOwnedByMe();
		const stranger = await createSignedInClient();

		const { error } = await stranger.supabase
			.from('organization_members')
			.insert({ organization_id: organizationId, user_id: stranger.userId, role: 'owner' });

		expect(error).not.toBeNull();
	});

	it('lets a member leave by themselves', async () => {
		const { organizationId } = await createOrganizationOwnedByMe();
		const member = await createSignedInClient();

		await addOrganizationMember(organizationId, member.userId, 'member');

		const { data, error } = await member.supabase
			.from('organization_members')
			.delete()
			.eq('organization_id', organizationId)
			.eq('user_id', member.userId)
			.select('user_id');

		expect(error).toBeNull();
		expect(data).toEqual([{ user_id: member.userId }]);
	});
});

describe('prevent_last_owner_removal', () => {
	it('refuses to let the only owner step down to admin', async () => {
		const { supabase, organizationId, userId } = await createOrganizationOwnedByMe();

		const { error } = await supabase
			.from('organization_members')
			.update({ role: 'admin' })
			.eq('organization_id', organizationId)
			.eq('user_id', userId);

		expect(error?.message).toContain('at least one owner');
	});

	it('refuses to let the only owner leave', async () => {
		const { supabase, organizationId, userId } = await createOrganizationOwnedByMe();

		const { error } = await supabase
			.from('organization_members')
			.delete()
			.eq('organization_id', organizationId)
			.eq('user_id', userId);

		expect(error?.message).toContain('at least one owner');
	});

	it('allows it once somebody else is an owner too', async () => {
		const { supabase, organizationId, userId } = await createOrganizationOwnedByMe();
		const successor = await createSignedInClient();

		await addOrganizationMember(organizationId, successor.userId, 'owner');

		const { data, error } = await supabase
			.from('organization_members')
			.update({ role: 'admin' })
			.eq('organization_id', organizationId)
			.eq('user_id', userId)
			.select('role');

		expect(error).toBeNull();
		expect(data).toEqual([{ role: 'admin' }]);
	});
});

describe('delete_my_account', () => {
	it('deletes the account and everything that hangs off it', async () => {
		const { supabase, userId } = await createSignedInClient();

		const { error } = await supabase.rpc('delete_my_account');

		expect(error).toBeNull();

		// The profile went with the account. Somebody else looking for it finds
		// nothing, which is what "the account is gone" looks like from outside.
		const other = await createSignedInClient();
		const { data } = await other.supabase.from('profiles').select('id').eq('id', userId);

		expect(data).toEqual([]);
	});

	it('refuses while the person is the only owner of an organisation', async () => {
		const { supabase } = await createOrganizationOwnedByMe();

		const { error } = await supabase.rpc('delete_my_account');

		expect(error?.message).toContain('owner');
	});
});

describe('set_stripe_account', () => {
	it('lets an owner store the Stripe account id', async () => {
		const { supabase, organizationId } = await createOrganizationOwnedByMe();

		// One Stripe account pays one organisation (the unique index of migration
		// 20261022130000), and the database is not reset between runs of this
		// file, so a fixed id would be accepted once and refused for ever after.
		const stripeAccountId = `acct_owner_${crypto.randomUUID()}`;

		const { error } = await supabase.rpc('set_stripe_account', {
			organization_id: organizationId,
			stripe_account_id: stripeAccountId
		});

		expect(error).toBeNull();

		// The column itself is no longer granted to a browser (migration
		// 20261022130000, security review L3); an owner reads the id back through
		// the organization_private_settings view.
		const { data } = await supabase
			.from('organization_private_settings')
			.select('stripe_account_id')
			.eq('organization_id', organizationId)
			.single();

		expect(data?.stripe_account_id).toBe(stripeAccountId);
	});

	it('refuses an ordinary member of the same organisation', async () => {
		const { organizationId } = await createOrganizationOwnedByMe();
		const member = await createSignedInClient();

		await addOrganizationMember(organizationId, member.userId, 'member');

		const { error } = await member.supabase.rpc('set_stripe_account', {
			organization_id: organizationId,
			stripe_account_id: 'acct_member_test'
		});

		expect(error?.message).toContain('owner or an admin');
	});

	// The function exists because the column is refused to a browser outright:
	// the protect_stripe_columns trigger of migration 0002 turns a plain update
	// down whoever is asking, so this is the only door.
	it('is the only way in: a plain update is refused even for the owner', async () => {
		const { supabase, organizationId } = await createOrganizationOwnedByMe();

		const { error } = await supabase
			.from('organizations')
			.update({ stripe_account_id: 'acct_written_by_hand' })
			.eq('id', organizationId);

		expect(error?.message).toContain('Stripe details');
	});
});

describe('is_organization_admin', () => {
	// The helper the organisations update policy and set_stripe_account both
	// ask, and the one the settings page reads to decide whether to draw its
	// forms. Nothing called it through .rpc() before this, so the page's
	// read-only state rested on nothing the database had confirmed.
	it('says yes to an owner', async () => {
		const { supabase, organizationId } = await createOrganizationOwnedByMe();

		const { data, error } = await supabase.rpc('is_organization_admin', {
			org_id: organizationId
		});

		expect(error).toBeNull();
		expect(data).toBe(true);
	});

	it('says yes to an admin', async () => {
		const { organizationId } = await createOrganizationOwnedByMe();
		const admin = await createSignedInClient();

		await addOrganizationMember(organizationId, admin.userId, 'admin');

		const { data } = await admin.supabase.rpc('is_organization_admin', {
			org_id: organizationId
		});

		expect(data).toBe(true);
	});

	it('says no to an ordinary member', async () => {
		const { organizationId } = await createOrganizationOwnedByMe();
		const member = await createSignedInClient();

		await addOrganizationMember(organizationId, member.userId, 'member');

		const { data } = await member.supabase.rpc('is_organization_admin', {
			org_id: organizationId
		});

		expect(data).toBe(false);
	});

	it('says no to somebody who is not a member at all', async () => {
		const { organizationId } = await createOrganizationOwnedByMe();
		const stranger = await createSignedInClient();

		const { data } = await stranger.supabase.rpc('is_organization_admin', {
			org_id: organizationId
		});

		expect(data).toBe(false);
	});
});

describe('organization_has_email', () => {
	// The invitation form on /manage/organizations/[orgSlug] asks this before it
	// writes an invites row, because turning an address into an account means
	// reading auth.users and no policy grants that table to anybody. See
	// supabase/migrations/20260919170000_organization_has_email.sql.
	it('says yes about an address that is already a member', async () => {
		const { supabase, organizationId, email } = await createOrganizationOwnedByMe();

		const { data, error } = await supabase.rpc('organization_has_email', {
			org_id: organizationId,
			email
		});

		expect(error).toBeNull();
		expect(data).toBe(true);
	});

	it('says yes whatever case the address is typed in', async () => {
		const { supabase, organizationId, email } = await createOrganizationOwnedByMe();

		const { data } = await supabase.rpc('organization_has_email', {
			org_id: organizationId,
			email: email.toUpperCase()
		});

		expect(data).toBe(true);
	});

	it('says no about an address nobody has an account for', async () => {
		const { supabase, organizationId } = await createOrganizationOwnedByMe();

		const { data } = await supabase.rpc('organization_has_email', {
			org_id: organizationId,
			email: `nobody-${crypto.randomUUID()}@example.com`
		});

		expect(data).toBe(false);
	});

	it('says no about an account that belongs to no organisation', async () => {
		const { supabase, organizationId } = await createOrganizationOwnedByMe();
		const stranger = await createSignedInClient();

		const { data } = await supabase.rpc('organization_has_email', {
			org_id: organizationId,
			email: stranger.email
		});

		expect(data).toBe(false);
	});

	// The guard is the whole point of the function: without it anybody signed in
	// could ask whether a given person belongs to a given organisation, which is
	// exactly the fact auth.users is kept private to protect.
	it('refuses an ordinary member of the organisation', async () => {
		const { organizationId, email } = await createOrganizationOwnedByMe();
		const member = await createSignedInClient();

		await addOrganizationMember(organizationId, member.userId, 'member');

		const { error } = await member.supabase.rpc('organization_has_email', {
			org_id: organizationId,
			email
		});

		expect(error?.message).toContain('cannot manage that organisation');
	});

	it('refuses somebody who is not a member at all', async () => {
		const { organizationId, email } = await createOrganizationOwnedByMe();
		const stranger = await createSignedInClient();

		const { error } = await stranger.supabase.rpc('organization_has_email', {
			org_id: organizationId,
			email
		});

		expect(error?.message).toContain('cannot manage that organisation');
	});
});

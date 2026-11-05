import { describe, expect, it } from 'vitest';
import {
	createServiceRoleClient,
	createSignedInClient,
	createVisitorClient
} from './supabase-test-client';

// The `profiles` and `profile_details` tables, their triggers and their
// policies. Each test states one rule from specs/02-architecture/permissions.md
// or one trigger from specs/02-architecture/data-model.md, and checks it against
// the real database, once for somebody who is allowed and once for somebody who
// is not.

describe('handle_new_user', () => {
	it('gives a brand-new account a profile with the name from the register form', async () => {
		const { supabase, userId } = await createSignedInClient('Amira Haddad');

		const { data: profile, error } = await supabase
			.from('profiles')
			.select('full_name, experience_level')
			.eq('id', userId)
			.single();

		expect(error).toBeNull();
		expect(profile).toEqual({ full_name: 'Amira Haddad', experience_level: 'none' });

		// The two columns only the person themself may read come through
		// `my_profile_state` (20261022132000_internal_notes_grants.sql).
		const { data: state, error: stateError } = await supabase
			.from('my_profile_state')
			.select('is_platform_admin, onboarding_completed_at')
			.eq('id', userId)
			.single();

		expect(stateError).toBeNull();
		expect(state).toEqual({
			is_platform_admin: false,
			// Null is what sends the person to /welcome on their first sign-in.
			onboarding_completed_at: null
		});
	});

	it('copies the email address into profile_details', async () => {
		const { supabase, userId, email } = await createSignedInClient();

		const { data: details } = await supabase
			.from('profile_details')
			.select('email')
			.eq('user_id', userId)
			.single();

		expect(details?.email).toBe(email);
	});
});

describe('sync_user_email', () => {
	it('follows a changed address on the account through to profile_details', async () => {
		const { supabase, userId } = await createSignedInClient();
		const newEmail = `changed-${crypto.randomUUID()}@example.com`;

		// Changing the address is normally the person confirming an email from
		// /settings. The admin API does the same thing to auth.users without the
		// round trip, which is what the trigger is watching.
		const admin = createServiceRoleClient();
		const { error: changeError } = await admin.auth.admin.updateUserById(userId, {
			email: newEmail
		});

		expect(changeError).toBeNull();

		const { data: details } = await supabase
			.from('profile_details')
			.select('email')
			.eq('user_id', userId)
			.single();

		expect(details?.email).toBe(newEmail);
	});
});

describe('profiles, reading', () => {
	it('lets a signed-in user read somebody else', async () => {
		const other = await createSignedInClient('Other Person');
		const { supabase } = await createSignedInClient();

		const { data: profile, error } = await supabase
			.from('profiles')
			.select('full_name')
			.eq('id', other.userId)
			.single();

		expect(error).toBeNull();
		expect(profile?.full_name).toBe('Other Person');
	});

	it('shows a visitor who is not signed in nothing at all', async () => {
		await createSignedInClient();
		const supabase = createVisitorClient();

		const { data } = await supabase.from('profiles').select('full_name');

		expect(data).toEqual([]);
	});
});

describe('profiles, writing', () => {
	it('lets a user finish their own onboarding', async () => {
		const { supabase, userId } = await createSignedInClient();

		const { data, error } = await supabase
			.from('profiles')
			.update({
				institution_name: 'Sample University',
				country_code: 'NL',
				experience_level: 'beginner',
				onboarding_completed_at: new Date().toISOString()
			})
			.eq('id', userId)
			.select('institution_name, experience_level');

		expect(error).toBeNull();
		expect(data).toEqual([{ institution_name: 'Sample University', experience_level: 'beginner' }]);
	});

	it("refuses to change somebody else's profile", async () => {
		const other = await createSignedInClient();
		const { supabase } = await createSignedInClient();

		// An update nobody is allowed to make changes no rows rather than failing,
		// so the proof is that nothing came back.
		const { data } = await supabase
			.from('profiles')
			.update({ full_name: 'Renamed by a stranger' })
			.eq('id', other.userId)
			.select('full_name');

		expect(data).toEqual([]);
	});

	it('refuses to let somebody make themselves a platform admin', async () => {
		const { supabase, userId } = await createSignedInClient();

		const { error } = await supabase
			.from('profiles')
			.update({ is_platform_admin: true })
			.eq('id', userId);

		expect(error?.message).toContain('is_platform_admin');
	});

	it('refuses a bio longer than 500 characters', async () => {
		const { supabase, userId } = await createSignedInClient();

		const { error } = await supabase
			.from('profiles')
			.update({ bio: 'x'.repeat(501) })
			.eq('id', userId);

		expect(error).not.toBeNull();
	});
});

describe('profile_details', () => {
	it('lets a user read and change their own private details', async () => {
		const { supabase, userId } = await createSignedInClient();

		const { data, error } = await supabase
			.from('profile_details')
			.update({ phone: '+31 6 12345678', dietary_requirements: 'Vegetarian' })
			.eq('user_id', userId)
			.select('phone, dietary_requirements');

		expect(error).toBeNull();
		expect(data).toEqual([{ phone: '+31 6 12345678', dietary_requirements: 'Vegetarian' }]);
	});

	it("never shows one user another user's private details", async () => {
		const other = await createSignedInClient();
		const { supabase } = await createSignedInClient();

		const { data } = await supabase
			.from('profile_details')
			.select('email')
			.eq('user_id', other.userId);

		expect(data).toEqual([]);
	});

	it("refuses to change somebody else's private details", async () => {
		const other = await createSignedInClient();
		const { supabase } = await createSignedInClient();

		const { data } = await supabase
			.from('profile_details')
			.update({ phone: '+00 0 00000000' })
			.eq('user_id', other.userId)
			.select('phone');

		expect(data).toEqual([]);
	});
});

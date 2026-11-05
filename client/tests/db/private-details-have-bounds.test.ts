import { describe, expect, it } from 'vitest';
import { createServiceRoleClient, createSignedInClient } from './supabase-test-client';

// What supabase/migrations/20261023122000_private_details_have_bounds.sql
// closed, around finding L67 of docs/security-review-2026-10-10.md:
//
// * the free-text fields of `profile_details` have the lengths the profile
//   editor asks for;
// * a person's own row takes the five fields the app writes, and not the
//   email address, which is the account's.
//
// The same file gives three views security_barrier (L16). That is a setting
// on the view, which no browser role can read, and the tests of each view
// (delegations, private details, seats) still pass with it on.

/** The SQLSTATE for a check constraint that refused a row. */
const CHECK_VIOLATION = '23514';

/** The SQLSTATE for a column the role may not write. */
const PERMISSION_DENIED = '42501';

/** Each bounded field and the most characters it takes. */
const BOUNDS = {
	phone: 30,
	dietary_requirements: 300,
	emergency_contact_name: 80,
	emergency_contact_phone: 30
};

describe('profile_details lengths (security review L67)', () => {
	for (const [column, longest] of Object.entries(BOUNDS)) {
		it(`takes ${longest} characters of ${column} and refuses ${longest + 1}`, async () => {
			const person = await createSignedInClient();

			const { error: atTheBound } = await person.supabase
				.from('profile_details')
				.update({ [column]: '1'.repeat(longest) })
				.eq('user_id', person.userId);

			expect(atTheBound).toBeNull();

			const { error: overTheBound } = await person.supabase
				.from('profile_details')
				.update({ [column]: '1'.repeat(longest + 1) })
				.eq('user_id', person.userId);

			expect(overTheBound?.code).toBe(CHECK_VIOLATION);
		});
	}
});

describe('the email on profile_details is the account’s', () => {
	it('refuses a person writing their own row’s email', async () => {
		const person = await createSignedInClient();

		const { error } = await person.supabase
			.from('profile_details')
			.update({ email: 'somebody-else@example.com' })
			.eq('user_id', person.userId);

		expect(error?.code).toBe(PERMISSION_DENIED);

		const { data } = await createServiceRoleClient()
			.from('profile_details')
			.select('email')
			.eq('user_id', person.userId)
			.single();

		expect(data?.email).toBe(person.email);
	});

	it('still saves the five fields the forms write', async () => {
		const person = await createSignedInClient();

		const { data, error } = await person.supabase
			.from('profile_details')
			.update({
				date_of_birth: '2007-05-01',
				phone: '+31 6 1234 5678',
				dietary_requirements: 'Vegetarian',
				emergency_contact_name: 'Maria Perez',
				emergency_contact_phone: '+31 6 8765 4321'
			})
			.eq('user_id', person.userId)
			.select('phone');

		expect(error).toBeNull();
		expect(data).toEqual([{ phone: '+31 6 1234 5678' }]);
	});
});

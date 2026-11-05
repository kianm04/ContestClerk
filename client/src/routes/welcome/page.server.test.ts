import { describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the action are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';

// Supabase is stood in for, so these tests are about what the page does with an
// answer rather than about reading and writing rows for real. The policies
// behind those rows are covered by `tests/db/profiles.test.ts`, and filling the
// form in by `tests/e2e/welcome.spec.ts`.

/** The `profiles` row a signed-in person has, as `getMyProfile` selects it. */
const PROFILE_ROW = {
	full_name: 'Daniel Perez',
	avatar_path: null,
	institution_name: null,
	country_code: null,
	experience_level: 'none',
	pronouns: null,
	bio: null
};

/** The `profile_details` row that goes with it. Everything optional is empty. */
const DETAILS_ROW = {
	email: 'daniel@example.com',
	date_of_birth: null,
	phone: null,
	dietary_requirements: null,
	emergency_contact_name: null,
	emergency_contact_phone: null
};

/**
 * A stand-in Supabase client that answers the three selects `getMyProfile`
 * makes (the profile, its details, and the person's own `my_profile_state`
 * row, which is where the onboarding moment lives) and records the two
 * updates `updateMyProfile` makes.
 *
 * The real client is a builder: `.from(...).select(...).eq(...).single()`. Each
 * step here gives back an object with the next step on it, which is the
 * smallest thing that behaves the same way.
 */
function supabaseWithProfile(onboardingCompletedAt: string | null) {
	const updates: Record<string, Record<string, unknown>> = {};
	const rowsByTable: Record<string, unknown> = {
		profiles: PROFILE_ROW,
		profile_details: DETAILS_ROW,
		my_profile_state: { onboarding_completed_at: onboardingCompletedAt }
	};

	const supabase = {
		from(table: string) {
			return {
				select: () => ({
					eq: () => ({
						single: async () => ({ data: rowsByTable[table] ?? null, error: null })
					})
				}),
				update: (values: Record<string, unknown>) => {
					updates[table] = values;

					return { eq: async () => ({ error: null }) };
				}
			};
		}
	};

	return { supabase, updates };
}

/** The few pieces of a page visit that `load` actually reads. */
function makeLoadEvent(search: string, supabase: unknown): PageServerLoadEvent {
	return {
		url: new URL(`http://localhost/welcome${search}`),
		locals: { supabase, getVerifiedClaims: async () => ({ sub: 'user-1', email: 'd@example.com' }) }
	} as unknown as PageServerLoadEvent;
}

/** A post from the welcome form. */
function makeFormEvent(
	fields: Record<string, string>,
	supabase: unknown,
	cookies = { set: vi.fn() }
): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	return {
		url: new URL('http://localhost/welcome'),
		request: { formData: async () => formData },
		cookies,
		locals: { supabase, getVerifiedClaims: async () => ({ sub: 'user-1', email: 'd@example.com' }) }
	} as unknown as RequestEvent;
}

/** A form that passes every check. Each test changes one field of it. */
const COMPLETE_FORM = {
	fullName: 'Daniel Perez',
	institution: 'Delft University',
	countryCode: 'NL',
	experienceLevel: 'intermediate',
	dateOfBirth: '2005-06-01',
	phone: '+31 6 1234 5678',
	dietaryRequirements: '',
	emergencyContactName: '',
	emergencyContactPhone: ''
};

/**
 * Run something that is expected to redirect, and give back the redirect.
 *
 * SvelteKit's `redirect` works by throwing, so the only way to see where it was
 * sending the reader is to catch it.
 */
async function catchRedirect(run: () => unknown): Promise<{ status: number; location: string }> {
	try {
		await run();
	} catch (thrown) {
		return thrown as { status: number; location: string };
	}

	throw new Error('Nothing was thrown, so nothing redirected.');
}

describe('load', () => {
	it('starts the form with the name the account signed up with', async () => {
		const { supabase } = supabaseWithProfile(null);

		const result = await load(makeLoadEvent('', supabase));

		expect(result).toMatchObject({
			next: '/',
			// Experience is empty rather than the column's 'none', because 'none' is
			// the real answer "First time" and nobody has given it yet. `+page.server.ts`
			// says why at greater length.
			values: { fullName: 'Daniel Perez', institution: '', countryCode: '', experienceLevel: '' }
		});
	});

	it('hands the page the `next` the address carries', async () => {
		const { supabase } = supabaseWithProfile(null);

		const result = await load(makeLoadEvent('?next=%2Fnotifications', supabase));

		expect(result).toMatchObject({ next: '/notifications' });
	});

	it('refuses a `next` pointing at another website', async () => {
		const { supabase } = supabaseWithProfile(null);

		const result = await load(makeLoadEvent('?next=%2F%2Fevil.example', supabase));

		expect(result).toMatchObject({ next: '/' });
	});

	it('sends somebody who has already finished onboarding away', async () => {
		const { supabase } = supabaseWithProfile('2026-09-15T10:00:00Z');

		const redirect = await catchRedirect(() => load(makeLoadEvent('', supabase)));

		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe('/home');
	});

	it('sends them home even when the address named somewhere else', async () => {
		const { supabase } = supabaseWithProfile('2026-09-15T10:00:00Z');

		const redirect = await catchRedirect(() =>
			load(makeLoadEvent('?next=%2Fnotifications', supabase))
		);

		// `welcome.md` sends anybody but a new account to `/home`. `next` works the
		// other way round: the form carries it so that finishing onboarding goes on
		// to the page somebody was heading for.
		expect(redirect.location).toBe('/home');
	});
});

describe('the welcome action', () => {
	it('refuses a second post from somebody who has already finished', async () => {
		const { supabase, updates } = supabaseWithProfile('2026-09-15T10:00:00Z');

		const redirect = await catchRedirect(() =>
			actions.default(makeFormEvent(COMPLETE_FORM, supabase))
		);

		// Nothing was written. Without this check a second post would rewrite the
		// profile and empty every optional detail the post left out.
		expect(updates).toEqual({});
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe('/home');
	});

	it('saves both rows and marks onboarding finished', async () => {
		const { supabase, updates } = supabaseWithProfile(null);
		const cookies = { set: vi.fn() };

		const redirect = await catchRedirect(() =>
			actions.default(makeFormEvent(COMPLETE_FORM, supabase, cookies))
		);

		expect(updates.profiles).toMatchObject({
			full_name: 'Daniel Perez',
			institution_name: 'Delft University',
			country_code: 'NL',
			experience_level: 'intermediate'
		});
		expect(updates.profiles.onboarding_completed_at).toEqual(expect.any(String));
		expect(updates.profile_details).toMatchObject({
			date_of_birth: '2005-06-01',
			phone: '+31 6 1234 5678'
		});
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe('/home');
	});

	it('saves an optional field left empty as nothing at all', async () => {
		const { supabase, updates } = supabaseWithProfile(null);

		await catchRedirect(() =>
			actions.default(makeFormEvent({ ...COMPLETE_FORM, dateOfBirth: '', phone: '' }, supabase))
		);

		expect(updates.profile_details).toMatchObject({
			date_of_birth: null,
			phone: null,
			dietary_requirements: null,
			emergency_contact_name: null,
			emergency_contact_phone: null
		});
	});

	it('leaves the message that the next page shows', async () => {
		const { supabase } = supabaseWithProfile(null);
		const cookies = { set: vi.fn() };

		await catchRedirect(() => actions.default(makeFormEvent(COMPLETE_FORM, supabase, cookies)));

		expect(cookies.set).toHaveBeenCalledWith(
			'flash',
			JSON.stringify({ tone: 'success', message: 'Welcome to MUNMeet.' }),
			expect.objectContaining({ path: '/' })
		);
	});

	it('goes on to the page the hidden field carried', async () => {
		const { supabase } = supabaseWithProfile(null);

		const redirect = await catchRedirect(() =>
			actions.default(makeFormEvent({ ...COMPLETE_FORM, next: '/notifications' }, supabase))
		);

		expect(redirect.location).toBe('/notifications');
	});

	it('refuses a page on another website', async () => {
		const { supabase } = supabaseWithProfile(null);

		const redirect = await catchRedirect(() =>
			actions.default(makeFormEvent({ ...COMPLETE_FORM, next: '//evil.example' }, supabase))
		);

		// Nowhere in particular, so the signed-in home page is where they land.
		expect(redirect.location).toBe('/home');
	});

	it('sends the form back with every message and every value when it is wrong', async () => {
		const { supabase, updates } = supabaseWithProfile(null);

		const result = await actions.default(
			makeFormEvent({ ...COMPLETE_FORM, fullName: '', institution: '', countryCode: '' }, supabase)
		);

		expect(result).toMatchObject({
			status: 400,
			data: {
				values: { experienceLevel: 'intermediate', phone: '+31 6 1234 5678' },
				errors: {
					fullName: 'Please enter your name.',
					institution: 'Please enter your school, university or club.',
					countryCode: 'Please pick a country.'
				}
			}
		});

		// Nothing was written, so a second try starts from the same place.
		expect(updates.profiles).toBeUndefined();
		expect(updates.profile_details).toBeUndefined();
	});
});

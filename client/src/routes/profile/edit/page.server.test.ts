import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the actions are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';

// The data-access functions are stood in for, so these tests are about what
// `load` and the four actions do with what comes back rather than about reading
// and writing rows and files for real. The policies behind those rows are
// covered by `tests/db/profiles.test.ts`, and filling the forms in by the
// browser tests.
vi.mock('$lib/server/profiles', () => ({
	getMyProfile: vi.fn(),
	updateProfile: vi.fn(),
	updateProfileDetails: vi.fn(),
	uploadAvatar: vi.fn(),
	removeAvatar: vi.fn()
}));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

import { setFlash } from '$lib/server/flash';
import {
	getMyProfile,
	removeAvatar,
	updateProfile,
	updateProfileDetails,
	uploadAvatar
} from '$lib/server/profiles';

/**
 * A stand-in Supabase client that answers the one question `requireOnboarded`
 * asks: has this account finished the welcome page?
 *
 * `requireOnboarded` is deliberately not mocked, because which gate this page
 * is behind is part of what these tests are checking. The real client is a
 * builder, `.from(...).select(...).eq(...).maybeSingle().overrideTypes()`, so
 * each step here gives back an object with the next step on it, which is the
 * smallest thing that behaves the same way.
 */
function supabaseWithOnboarding(onboardingCompletedAt: string | null) {
	return {
		from: () => ({
			select: () => ({
				eq: () => ({
					maybeSingle: () => ({
						overrideTypes: async () => ({
							data: { onboarding_completed_at: onboardingCompletedAt },
							error: null
						})
					})
				})
			})
		})
	};
}

/** Somebody signed in who has finished the welcome page. */
const SIGNED_IN = {
	supabase: supabaseWithOnboarding('2026-09-15T10:00:00Z'),
	getVerifiedClaims: async () => ({ sub: 'user-1', email: 'daniel@example.org' })
};

/** Somebody signed in who has not finished it yet. */
const NOT_ONBOARDED = {
	supabase: supabaseWithOnboarding(null),
	getVerifiedClaims: async () => ({ sub: 'user-1', email: 'daniel@example.org' })
};

/** Nobody signed in. */
const SIGNED_OUT = {
	supabase: supabaseWithOnboarding(null),
	getVerifiedClaims: async () => null
};

/** The two rows `getMyProfile` gives back for the account in these tests. */
const MY_PROFILE = {
	profile: {
		fullName: 'Daniel Perez',
		avatarPath: null,
		institutionName: 'Delft University',
		countryCode: 'NL',
		experienceLevel: 'intermediate' as const,
		pronouns: 'he/him',
		bio: 'Four years of committees.',
		onboardingCompletedAt: '2026-09-15T10:00:00Z'
	},
	details: {
		email: 'daniel@example.org',
		dateOfBirth: '2005-06-01',
		phone: '+31 6 1234 5678',
		dietaryRequirements: 'Vegetarian',
		emergencyContactName: 'Ana Perez',
		emergencyContactPhone: '+31 6 8765 4321'
	}
};

/** The six fields the public form sends, all of them acceptable. */
const PUBLIC_FORM = {
	fullName: 'Daniel Perez',
	institutionName: 'Delft University',
	countryCode: 'NL',
	experienceLevel: 'intermediate',
	pronouns: 'he/him',
	bio: 'Four years of committees.'
};

/** The five fields the private form sends, all of them acceptable. */
const PRIVATE_FORM = {
	dateOfBirth: '2005-06-01',
	phone: '+31 6 1234 5678',
	dietaryRequirements: 'Vegetarian',
	emergencyContactName: 'Ana Perez',
	emergencyContactPhone: '+31 6 8765 4321'
};

/**
 * The few pieces of a request that `load` and the actions here actually read.
 *
 * SvelteKit hands them a great many more, so the cast says "this is enough";
 * anything the code reaches for that is missing fails the test loudly. The
 * address is the plain page address: SvelteKit really adds `?/updatePublic` to
 * it when a named action is posted to, and `requireOnboarded` drops that again
 * before putting the address in `?next=`, so leaving it off changes nothing
 * here and keeps the expected redirects readable.
 */
function makeEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		url: new URL('http://localhost/profile/edit'),
		locals: SIGNED_IN,
		cookies: {},
		...overrides
	};
}

/** That stand-in, as the `load` function's own event type. */
function makeLoadEvent(overrides: Record<string, unknown> = {}): PageServerLoadEvent {
	return makeEvent(overrides) as unknown as PageServerLoadEvent;
}

/** A form post carrying the fields one of the two text forms sends. */
function makeFormEvent(
	fields: Record<string, string>,
	overrides: Record<string, unknown> = {}
): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	return makeEvent({
		request: { formData: async () => formData },
		...overrides
	}) as unknown as RequestEvent;
}

/** How many bytes a megabyte is here, so the sizes below read as sizes. */
const BYTES_IN_A_MEGABYTE = 1024 * 1024;

/**
 * A file of the given type and size, with no meaningful contents.
 *
 * Only the type and the size are checked, so the bytes themselves can be a
 * block of zeroes. `new File(...)` is part of Node itself from version 20 on,
 * as it is part of every browser.
 */
function makeFile(name: string, type: string, sizeInBytes: number): File {
	return new File([new Uint8Array(sizeInBytes)], name, { type });
}

/**
 * A form post carrying a file, which is what the avatar form sends.
 *
 * `makeFormEvent` above takes text only, because text is all the other two
 * forms send. Whatever is passed here goes into the form under the name
 * `avatar`: a `File` is what a browser sends, and a plain string stands for a
 * request somebody put together by hand.
 */
function makeAvatarEvent(
	avatar: File | string,
	overrides: Record<string, unknown> = {}
): RequestEvent {
	const formData = new FormData();
	formData.set('avatar', avatar);

	return makeEvent({
		request: { formData: async () => formData },
		...overrides
	}) as unknown as RequestEvent;
}

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

/**
 * What an action returns when it does not redirect.
 *
 * Only one shape reaches a test: a `fail`, which gives back `{ status, data }`,
 * where `data` is what the action passed to it. Every form's half is described,
 * so a test can ask for the one it expects and for the absence of the others.
 */
type ActionResult = {
	status?: number;
	data?: {
		form?: string;
		values?: Record<string, string>;
		errors?: Record<string, string>;
		detailsValues?: Record<string, string>;
		detailsErrors?: Record<string, string>;
		avatarErrors?: Record<string, string>;
	};
};

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(getMyProfile).mockResolvedValue(MY_PROFILE);
});

describe('load', () => {
	it('turns the two rows into the two sets of form values', async () => {
		const result = await load(makeLoadEvent());

		// `toEqual` rather than `toMatchObject`, so this also says what is not
		// here: the email address is not a field of any of the three forms. The
		// avatar is not a set of values either, only the picture the form shows
		// and the name it falls back to.
		expect(result).toEqual({
			values: PUBLIC_FORM,
			detailsValues: PRIVATE_FORM,
			avatar: { fullName: 'Daniel Perez', avatarPath: null }
		});
	});

	it('sends an account that has not finished onboarding to the welcome page', async () => {
		const redirect = await catchRedirect(() => load(makeLoadEvent({ locals: NOT_ONBOARDED })));

		// `requireOnboarded`, not `requireUser`: there is nothing to edit here
		// until the welcome questions have been answered.
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe('/welcome?next=%2Fprofile%2Fedit');
	});

	it('sends a visitor to the sign in page, with this page to come back to', async () => {
		const redirect = await catchRedirect(() => load(makeLoadEvent({ locals: SIGNED_OUT })));

		expect(redirect.location).toBe('/login?next=%2Fprofile%2Fedit');
	});
});

describe('the updatePublic action', () => {
	it('saves what was typed and says so on the profile page', async () => {
		const redirect = await catchRedirect(() => actions.updatePublic(makeFormEvent(PUBLIC_FORM)));

		expect(updateProfile).toHaveBeenCalledWith(SIGNED_IN.supabase, 'user-1', PUBLIC_FORM);
		expect(setFlash).toHaveBeenCalledWith({}, { tone: 'success', message: 'Profile saved.' });
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe('/profile');
	});

	it('sends the form back with the message and every value when the name is empty', async () => {
		const result = (await actions.updatePublic(
			makeFormEvent({ ...PUBLIC_FORM, fullName: '' })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.form).toBe('public');
		expect(result.data?.errors?.fullName).toBe('Please enter your name.');
		expect(result.data?.values).toEqual({ ...PUBLIC_FORM, fullName: '' });

		// Nothing was written, so a second try starts from the same place.
		expect(updateProfile).not.toHaveBeenCalled();
		expect(setFlash).not.toHaveBeenCalled();
	});

	it('carries nothing belonging to the private form, so it cannot blank it', async () => {
		const result = (await actions.updatePublic(
			makeFormEvent({ ...PUBLIC_FORM, fullName: '' })
		)) as ActionResult;

		expect(result.data?.detailsValues).toBeUndefined();
		expect(result.data?.detailsErrors).toBeUndefined();
	});

	it('sends a visitor to the sign in page rather than saving anything', async () => {
		const redirect = await catchRedirect(() =>
			actions.updatePublic(makeFormEvent(PUBLIC_FORM, { locals: SIGNED_OUT }))
		);

		expect(redirect.location).toBe('/login?next=%2Fprofile%2Fedit');
		expect(updateProfile).not.toHaveBeenCalled();
	});
});

describe('the updatePrivate action', () => {
	it('saves what was typed and says so on the profile page', async () => {
		const redirect = await catchRedirect(() => actions.updatePrivate(makeFormEvent(PRIVATE_FORM)));

		expect(updateProfileDetails).toHaveBeenCalledWith(SIGNED_IN.supabase, 'user-1', PRIVATE_FORM);
		expect(setFlash).toHaveBeenCalledWith({}, { tone: 'success', message: 'Details saved.' });
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe('/profile');
	});

	it('asks for a phone number when an emergency contact has a name and no number', async () => {
		const result = (await actions.updatePrivate(
			makeFormEvent({ ...PRIVATE_FORM, emergencyContactPhone: '' })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.form).toBe('private');
		expect(result.data?.detailsErrors?.emergencyContactPhone).toBe(
			'Please add a phone number for your emergency contact.'
		);
		expect(result.data?.detailsValues).toEqual({ ...PRIVATE_FORM, emergencyContactPhone: '' });

		expect(updateProfileDetails).not.toHaveBeenCalled();
		expect(setFlash).not.toHaveBeenCalled();
	});

	it('carries nothing belonging to the public form, so it cannot blank it', async () => {
		const result = (await actions.updatePrivate(
			makeFormEvent({ ...PRIVATE_FORM, emergencyContactPhone: '' })
		)) as ActionResult;

		expect(result.data?.values).toBeUndefined();
		expect(result.data?.errors).toBeUndefined();
	});

	it('sends a visitor to the sign in page rather than saving anything', async () => {
		const redirect = await catchRedirect(() =>
			actions.updatePrivate(makeFormEvent(PRIVATE_FORM, { locals: SIGNED_OUT }))
		);

		expect(redirect.location).toBe('/login?next=%2Fprofile%2Fedit');
		expect(updateProfileDetails).not.toHaveBeenCalled();
	});
});

describe('the updateAvatar action', () => {
	it('uploads the picture and says so on the profile page', async () => {
		const photo = makeFile('photo.jpg', 'image/jpeg', 1024);

		const redirect = await catchRedirect(() => actions.updateAvatar(makeAvatarEvent(photo)));

		expect(uploadAvatar).toHaveBeenCalledWith(SIGNED_IN.supabase, 'user-1', photo);
		expect(setFlash).toHaveBeenCalledWith({}, { tone: 'success', message: 'Photo updated.' });
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe('/profile');
	});

	it('refuses a PDF and uploads nothing', async () => {
		const positionPaper = makeFile('paper.pdf', 'application/pdf', 1024);

		const result = (await actions.updateAvatar(makeAvatarEvent(positionPaper))) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.form).toBe('avatar');
		expect(result.data?.avatarErrors?.avatar).toBe('Please choose a JPEG, PNG or WebP image.');

		// Nothing was uploaded, so the picture that was there is still there.
		expect(uploadAvatar).not.toHaveBeenCalled();
		expect(setFlash).not.toHaveBeenCalled();
	});

	it('refuses a picture of six megabytes', async () => {
		const tooLarge = makeFile('photo.jpg', 'image/jpeg', 6 * BYTES_IN_A_MEGABYTE);

		const result = (await actions.updateAvatar(makeAvatarEvent(tooLarge))) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.avatarErrors?.avatar).toBe('The image must be smaller than 5 MB.');

		expect(uploadAvatar).not.toHaveBeenCalled();
		expect(setFlash).not.toHaveBeenCalled();
	});

	it('tells a post that carried no file what a file of the wrong type is told', async () => {
		// Nothing this page can send: the form always carries a file box. A
		// request put together by hand might put plain text under that name,
		// and plain text is not a picture either.
		const result = (await actions.updateAvatar(
			makeAvatarEvent('avatars/someone.jpg')
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.avatarErrors?.avatar).toBe('Please choose a JPEG, PNG or WebP image.');
		expect(uploadAvatar).not.toHaveBeenCalled();
	});

	it('carries nothing belonging to either text form, so it cannot blank them', async () => {
		const positionPaper = makeFile('paper.pdf', 'application/pdf', 1024);

		const result = (await actions.updateAvatar(makeAvatarEvent(positionPaper))) as ActionResult;

		expect(result.data?.values).toBeUndefined();
		expect(result.data?.errors).toBeUndefined();
		expect(result.data?.detailsValues).toBeUndefined();
		expect(result.data?.detailsErrors).toBeUndefined();
	});

	it('sends a visitor to the sign in page rather than uploading anything', async () => {
		const photo = makeFile('photo.jpg', 'image/jpeg', 1024);

		const redirect = await catchRedirect(() =>
			actions.updateAvatar(makeAvatarEvent(photo, { locals: SIGNED_OUT }))
		);

		expect(redirect.location).toBe('/login?next=%2Fprofile%2Fedit');
		expect(uploadAvatar).not.toHaveBeenCalled();
	});
});

describe('the removeAvatar action', () => {
	it('clears the picture and says so on the profile page', async () => {
		// The button that posts here sits inside the avatar form, so a browser
		// sends that form's fields with it. This action reads none of them.
		const redirect = await catchRedirect(() => actions.removeAvatar(makeFormEvent({})));

		expect(removeAvatar).toHaveBeenCalledWith(SIGNED_IN.supabase, 'user-1');
		expect(setFlash).toHaveBeenCalledWith({}, { tone: 'success', message: 'Photo removed.' });
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe('/profile');
	});

	it('sends a visitor to the sign in page rather than deleting anything', async () => {
		const redirect = await catchRedirect(() =>
			actions.removeAvatar(makeFormEvent({}, { locals: SIGNED_OUT }))
		);

		expect(redirect.location).toBe('/login?next=%2Fprofile%2Fedit');
		expect(removeAvatar).not.toHaveBeenCalled();
	});
});

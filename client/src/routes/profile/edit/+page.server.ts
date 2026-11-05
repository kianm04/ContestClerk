import { fail, redirect } from '@sveltejs/kit';
import {
	hasFieldErrors,
	validateAvatarFile,
	validateDetailsForm,
	validateProfileForm,
	type DetailsFormValues,
	type ProfileFormValues
} from '$lib/profiles';
// The two form readers and "saved" messages live in `$lib` because the
// browser uses them too, to say "Profile saved." the moment it is pressed.
import {
	DETAILS_SAVED_FLASH,
	PROFILE_SAVED_FLASH,
	readDetailsForm,
	readProfileForm
} from '$lib/profile-presses';
import { profileUrl } from '$lib/urls';
import { requireOnboarded } from '$lib/server/access';
import { setFlash } from '$lib/server/flash';
// The `removeAvatar` action further down this file has the same name as the
// function that does its work, so the function is imported under another name
// rather than being hidden by the action.
import {
	getMyProfile,
	removeAvatar as removeStoredAvatar,
	updateProfile,
	updateProfileDetails,
	uploadAvatar
} from '$lib/server/profiles';
import type { Actions, PageServerLoad } from './$types';

/** What it says once a new picture has been uploaded. */
const PHOTO_SAVED_FLASH = 'Photo updated.';

/** What it says once the picture has been taken away again. */
const PHOTO_REMOVED_FLASH = 'Photo removed.';

/**
 * Runs on the server before the page is rendered, and again after every action
 * on it. Whatever it returns arrives in `+page.svelte` as `data`.
 *
 * `requireOnboarded` rather than `requireUser`: it sends a visitor to `/login`
 * and an account that has not answered the welcome questions to `/welcome`,
 * because there is nothing to edit here until those answers exist.
 *
 * `05-pages/delegate/profile.md` also asks this `load` for the country options.
 * They are deliberately not returned: `03-design/components.md` says
 * `CountrySelect` builds the list itself out of `$lib/countries.ts`, so no page
 * has to pass one, and it already does.
 */
export const load: PageServerLoad = async ({ url, locals }) => {
	const user = await requireOnboarded(locals, url);
	const { profile, details } = await getMyProfile(locals.supabase, user.id);

	// The two rows become the two sets of form values: one entry per field on
	// the page, as text, which is all an `<input>` can hold.
	const values: ProfileFormValues = {
		fullName: profile.fullName,
		institutionName: profile.institutionName,
		countryCode: profile.countryCode,
		experienceLevel: profile.experienceLevel,
		pronouns: profile.pronouns,
		bio: profile.bio
	};

	const detailsValues: DetailsFormValues = {
		dateOfBirth: details.dateOfBirth,
		phone: details.phone,
		dietaryRequirements: details.dietaryRequirements,
		emergencyContactName: details.emergencyContactName,
		emergencyContactPhone: details.emergencyContactPhone
	};

	// The avatar form is not a set of typed-in values: it shows the picture that
	// is saved now, and needs the name for its alt text and for the initials it
	// draws when there is no picture at all.
	const avatar = {
		fullName: profile.fullName,
		avatarPath: profile.avatarPath
	};

	return { values, detailsValues, avatar };
};

export const actions: Actions = {
	/**
	 * Save the half of the profile that organisers and chairs can see.
	 *
	 * An action is its own request, so it asks who is signed in again rather
	 * than trusting that `load` ran first.
	 *
	 * `form: 'public'` on the failure is what lets the page draw these messages
	 * under this form and not under the other one, the way `/settings` uses its
	 * `card` field. Only this form's values travel back, so a failure here
	 * cannot blank what was typed into the private form below it.
	 */
	updatePublic: async ({ request, cookies, url, locals }) => {
		const user = await requireOnboarded(locals, url);

		const formData = await request.formData();
		const values = readProfileForm(formData);
		const errors = validateProfileForm(values);

		if (hasFieldErrors(errors)) {
			// `fail` sends the page back with a 400 status and this result as
			// `form`, so every field keeps what was typed and shows its own message.
			return fail(400, { form: 'public' as const, values, errors });
		}

		await updateProfile(locals.supabase, user.id, values);

		// A redirecting action cannot return anything, so the message travels in a
		// one-shot cookie that the root layout reads and throws away.
		setFlash(cookies, { tone: 'success', message: PROFILE_SAVED_FLASH });
		redirect(303, profileUrl());
	},

	/**
	 * Save the half that only the organisers of conferences you attend can see.
	 *
	 * The same shape as `updatePublic` above, including the re-check of who is
	 * signed in and the `form` field that keeps one form's messages off the
	 * other.
	 */
	updatePrivate: async ({ request, cookies, url, locals }) => {
		const user = await requireOnboarded(locals, url);

		const formData = await request.formData();
		const detailsValues = readDetailsForm(formData);
		const detailsErrors = validateDetailsForm(detailsValues);

		if (hasFieldErrors(detailsErrors)) {
			return fail(400, { form: 'private' as const, detailsValues, detailsErrors });
		}

		await updateProfileDetails(locals.supabase, user.id, detailsValues);

		setFlash(cookies, { tone: 'success', message: DETAILS_SAVED_FLASH });
		redirect(303, profileUrl());
	},

	/**
	 * Put the chosen picture in the `public-media` bucket and point the profile
	 * at it.
	 *
	 * Like the two actions above it re-checks who is signed in, and carries
	 * `form: 'avatar'` so the page knows which of its three forms a message
	 * belongs to. Unlike them it sends no values back on a failure: a browser
	 * will not let a page put a file into a file box again, so there is nothing
	 * to keep.
	 */
	updateAvatar: async ({ request, cookies, url, locals }) => {
		const user = await requireOnboarded(locals, url);

		const formData = await request.formData();
		const chosenFile = formData.get('avatar');

		// `formData.get` gives back a file, plain text or nothing at all. Only
		// this page's own form sends a file; a request put together by hand
		// might send anything, and neither plain text nor a missing field is a
		// picture, so both are told what a file of the wrong type is told.
		// Checking an empty type says that in one place rather than two.
		if (!(chosenFile instanceof File)) {
			const avatarErrors = validateAvatarFile({ type: '', size: 0 });
			return fail(400, { form: 'avatar' as const, avatarErrors });
		}

		const avatarErrors = validateAvatarFile(chosenFile);

		if (hasFieldErrors(avatarErrors)) {
			return fail(400, { form: 'avatar' as const, avatarErrors });
		}

		await uploadAvatar(locals.supabase, user.id, chosenFile);

		setFlash(cookies, { tone: 'success', message: PHOTO_SAVED_FLASH });
		redirect(303, profileUrl());
	},

	/**
	 * Take the picture away again, so the profile shows initials once more.
	 *
	 * This action reads no fields at all: which picture to delete is whichever
	 * one the signed-in account has, which the server already knows.
	 */
	removeAvatar: async ({ cookies, url, locals }) => {
		const user = await requireOnboarded(locals, url);

		await removeStoredAvatar(locals.supabase, user.id);

		setFlash(cookies, { tone: 'success', message: PHOTO_REMOVED_FLASH });
		redirect(303, profileUrl());
	}
};

import { fail, redirect } from '@sveltejs/kit';
import { destinationAfterAuth, safeRedirectPath } from '$lib/auth';
import { hasWelcomeFormErrors, validateWelcomeForm, type WelcomeFormValues } from '$lib/profiles';
import { signedInHomeUrl } from '$lib/urls';
import { requireUser } from '$lib/server/access';
import { setFlash } from '$lib/server/flash';
import { getMyProfile, updateMyProfile } from '$lib/server/profiles';
import type { Actions, PageServerLoad } from './$types';

/** The message the person sees on the page they land on after saving. */
const SAVED_FLASH = 'Welcome to MUNMeet.';

/**
 * Read the nine fields of the welcome form out of a posted form.
 *
 * Everything arrives as text, including the date and the experience level, and
 * everything is kept exactly as it was typed so that a form sent back after an
 * error still holds what the person wrote. The trimming happens later, in
 * `updateMyProfile`, where the values become columns.
 */
function readWelcomeForm(formData: FormData): WelcomeFormValues {
	return {
		fullName: String(formData.get('fullName') ?? ''),
		institution: String(formData.get('institution') ?? ''),
		countryCode: String(formData.get('countryCode') ?? ''),
		experienceLevel: String(formData.get('experienceLevel') ?? ''),
		dateOfBirth: String(formData.get('dateOfBirth') ?? ''),
		phone: String(formData.get('phone') ?? ''),
		dietaryRequirements: String(formData.get('dietaryRequirements') ?? ''),
		emergencyContactName: String(formData.get('emergencyContactName') ?? ''),
		emergencyContactPhone: String(formData.get('emergencyContactPhone') ?? '')
	};
}

/**
 * Runs on the server before the page is rendered. Whatever it returns arrives
 * in `+page.svelte` as `data`.
 *
 * This is the one signed-in page that is not behind `requireOnboarded`, for the
 * obvious reason: it is the page that finishes onboarding. It guards itself the
 * other way round, sending anybody who has already finished away again. The
 * action below repeats that check, because a form can be posted without this
 * `load` ever running.
 */
export const load: PageServerLoad = async ({ url, locals }) => {
	const user = await requireUser(locals, url);

	// The page the person was heading for when the gate caught them. It is
	// checked here, where it comes in, so everything downstream is working with
	// an address that points inside this site.
	const next = safeRedirectPath(url.searchParams.get('next'));
	const { profile, details } = await getMyProfile(locals.supabase, user.id);

	// Somebody who has already answered these questions is sent home, not on to
	// `next`. `05-pages/auth/welcome.md` says `/home` for anybody but a new
	// account, and `next` is for the other direction: the form carries it so
	// that finishing onboarding continues an invite or apply link.
	if (profile.onboardingCompletedAt) {
		redirect(303, signedInHomeUrl());
	}

	// The form starts with whatever the account already has: the name from sign
	// up, and everything else empty.
	//
	// Experience is the exception. Its column is `not null default 'none'`, and
	// 'none' is itself a real answer ("First time"), so showing the column here
	// would tick an answer nobody gave and make "Please pick your experience
	// level." impossible to reach. `05-pages/auth/welcome.md` says the form
	// starts empty apart from the name, so an unfinished profile shows no choice
	// and the person picks one. Nothing is lost: this page is only ever reached
	// while onboarding is unfinished, and until it is finished nothing has
	// written to the column.
	const values: WelcomeFormValues = {
		fullName: profile.fullName,
		institution: profile.institutionName,
		countryCode: profile.countryCode,
		experienceLevel: '',
		dateOfBirth: details.dateOfBirth,
		phone: details.phone,
		dietaryRequirements: details.dietaryRequirements,
		emergencyContactName: details.emergencyContactName,
		emergencyContactPhone: details.emergencyContactPhone
	};

	return { next, values };
};

export const actions: Actions = {
	/**
	 * An unnamed action, because there is only one form on this page. A plain
	 * `<form method="post">` with no `action` attribute posts to this.
	 *
	 * An action is its own request, so it checks who is signed in again rather
	 * than trusting that `load` ran, and checks the same onboarding rule: a form
	 * posted a second time would otherwise rewrite the profile and empty every
	 * optional detail the post left out.
	 */
	default: async ({ request, cookies, url, locals }) => {
		const user = await requireUser(locals, url);
		const { profile } = await getMyProfile(locals.supabase, user.id);

		if (profile.onboardingCompletedAt) {
			redirect(303, signedInHomeUrl());
		}

		const formData = await request.formData();
		const values = readWelcomeForm(formData);
		const next = safeRedirectPath(String(formData.get('next') ?? ''));
		const errors = validateWelcomeForm(values);

		if (hasWelcomeFormErrors(errors)) {
			// `fail` sends the page back with a 400 status and this result as `form`,
			// so every field keeps what was typed and shows its own message.
			return fail(400, { values, errors });
		}

		await updateMyProfile(locals.supabase, user.id, values);

		// A redirect cannot carry a result back, so the message travels in a
		// one-shot cookie that the root layout reads and throws away.
		setFlash(cookies, { tone: 'success', message: SAVED_FLASH });
		redirect(303, destinationAfterAuth(next, signedInHomeUrl()));
	}
};

/**
 * What saving either half of `/profile/edit` says the moment it is pressed
 * (T142), and how both the browser and the server read those two forms.
 *
 * Both forms go through an instant form (`createInstantForm` in
 * `$lib/instant-form.svelte.ts`), so "Profile saved." shows at once rather
 * than after the answer. The browser checks the fields with the same
 * `validateProfileForm` the server uses, so a form the server will send back
 * with its fields marked never says "saved" first.
 */
import type { InstantPress } from '$lib/instant-form.svelte';
import {
	hasFieldErrors,
	validateDetailsForm,
	validateProfileForm,
	type DetailsFormValues,
	type ProfileFormValues
} from '$lib/profiles';

/** What `/profile` says at the top once the public half has been saved. */
export const PROFILE_SAVED_FLASH = 'Profile saved.';

/** What it says once the private half has been saved. */
export const DETAILS_SAVED_FLASH = 'Details saved.';

/**
 * Read the six public fields out of a posted form.
 *
 * Everything arrives as text, and everything is kept exactly as it was typed,
 * so that a form sent back after an error still holds what the person wrote.
 * The trimming happens later, in `updateProfile`, where the values become
 * columns.
 */
export function readProfileForm(formData: FormData): ProfileFormValues {
	return {
		fullName: String(formData.get('fullName') ?? ''),
		institutionName: String(formData.get('institutionName') ?? ''),
		countryCode: String(formData.get('countryCode') ?? ''),
		experienceLevel: String(formData.get('experienceLevel') ?? ''),
		pronouns: String(formData.get('pronouns') ?? ''),
		bio: String(formData.get('bio') ?? '')
	};
}

/** The same for the five private fields, also kept exactly as they were typed. */
export function readDetailsForm(formData: FormData): DetailsFormValues {
	return {
		dateOfBirth: String(formData.get('dateOfBirth') ?? ''),
		phone: String(formData.get('phone') ?? ''),
		dietaryRequirements: String(formData.get('dietaryRequirements') ?? ''),
		emergencyContactName: String(formData.get('emergencyContactName') ?? ''),
		emergencyContactPhone: String(formData.get('emergencyContactPhone') ?? '')
	};
}

/** The toast shown at once for "Save profile", or null when the server will refuse it. */
export function describeProfileSaved(press: InstantPress): string | null {
	const errors = validateProfileForm(readProfileForm(press.formData));

	return hasFieldErrors(errors) ? null : PROFILE_SAVED_FLASH;
}

/** The toast shown at once for "Save details", or null when the server will refuse it. */
export function describeDetailsSaved(press: InstantPress): string | null {
	const errors = validateDetailsForm(readDetailsForm(press.formData));

	return hasFieldErrors(errors) ? null : DETAILS_SAVED_FLASH;
}

/** The first sentence of the toast when "Save profile" failed. */
export function describeProfileFailure(): string {
	return 'Your profile was not saved.';
}

/** The first sentence of the toast when "Save details" failed. */
export function describeDetailsFailure(): string {
	return 'Your details were not saved.';
}

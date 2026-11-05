/**
 * The checks and the wording of the account settings page, `/settings`.
 *
 * Nothing in here talks to Supabase or to Svelte, so it can be read and tested
 * on its own. The two addresses-and-passwords checks it builds on live in
 * `$lib/auth.ts`, which every other form that asks for an email or a password
 * already uses; what is here is only the part that is particular to changing an
 * account you already have.
 */

import { validateEmail, validatePassword } from '$lib/auth';

/** The word somebody has to type before their account is deleted. */
export const DELETE_CONFIRMATION_WORD = 'DELETE';

/** Which of the three cards on `/settings` a message belongs under. */
export type SettingsCard = 'email' | 'password' | 'delete';

/**
 * One message shown under one card after a form was posted.
 *
 * All three forms are on the same page, so an action's result has to say which
 * card it is about; without that, a failed password change would also appear
 * under the email field. `tone` is a `Notice` tone.
 */
export type SettingsMessage = {
	card: SettingsCard;
	tone: 'success' | 'warning' | 'error';
	text: string;
};

/** An organisation the signed-in person is the only owner of. */
export type SoleOwnership = {
	id: string;
	name: string;
	/**
	 * The organisation's address, which the warning on `/settings` links to, so
	 * that somebody told they are the only owner can go straight to the page
	 * where another owner is made.
	 */
	slug: string;
};

/**
 * Returns a message to show under the email field, or `null` when the address
 * can be asked for.
 *
 * `currentEmail` is the address the account already has. Asking Supabase to
 * change it to itself sends a confirmation email that changes nothing, so it is
 * refused here instead.
 */
export function validateEmailChange(newEmail: string, currentEmail: string): string | null {
	const problem = validateEmail(newEmail);

	if (problem) {
		return problem;
	}

	// Addresses are not case sensitive in practice, and Supabase stores them
	// lowercased, so "Daniel@example.org" is the same address as the one on the
	// account rather than a new one. Anything with spaces in it has already been
	// turned away by `validateEmail` above, the way it is everywhere else in the
	// app, so there is nothing to trim here.
	if (newEmail.toLowerCase() === currentEmail.toLowerCase()) {
		return 'That is already your email address.';
	}

	return null;
}

/**
 * Returns a message to show under the password fields, or `null` when the new
 * password can be saved.
 *
 * It says nothing about the current password: that one is checked by asking
 * Supabase whether it still signs the person in, which is a network call and so
 * belongs in `$lib/server/accounts.ts`.
 */
export function validateNewPassword(newPassword: string, repeatPassword: string): string | null {
	const problem = validatePassword(newPassword);

	if (problem) {
		return problem;
	}

	if (newPassword !== repeatPassword) {
		return 'The two new passwords do not match.';
	}

	return null;
}

/**
 * Returns a message to show under the current password field, or `null` when
 * something was typed into it.
 *
 * Whether it is right is Supabase's to say, which is a network call and so
 * belongs in `$lib/server/accounts.ts`. An empty box is never right, though,
 * and saying so here is quicker than asking.
 */
export function validateCurrentPassword(typed: string): string | null {
	if (typed === '') {
		return 'Enter your current password.';
	}

	return null;
}

/**
 * Returns a message to show under the delete field, or `null` when the person
 * really did type the word.
 *
 * The comparison is exact, capitals and all. Typing DELETE is the whole point
 * of the field: something that can be done by accident is not a confirmation.
 */
export function validateDeleteConfirmation(typed: string): string | null {
	if (typed.trim() !== DELETE_CONFIRMATION_WORD) {
		return `Type ${DELETE_CONFIRMATION_WORD} to confirm.`;
	}

	return null;
}

/**
 * What the delete card says when the person is the only owner of an
 * organisation, which the database refuses to leave without one.
 *
 * It is a sentence per organisation, so somebody who owns two is told about
 * both rather than about whichever the database happened to notice first.
 */
export function describeSoleOwnership(organizationName: string): string {
	return `You are the only owner of ${organizationName}. Make somebody else an owner, or delete the organisation, before deleting your account.`;
}

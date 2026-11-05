import { describe, expect, it } from 'vitest';
import {
	DELETE_CONFIRMATION_WORD,
	describeSoleOwnership,
	validateCurrentPassword,
	validateDeleteConfirmation,
	validateEmailChange,
	validateNewPassword
} from './accounts';

describe('validateEmailChange', () => {
	it('accepts a different, usable address', () => {
		expect(validateEmailChange('new@example.org', 'daniel@example.org')).toBeNull();
	});

	it('asks for an address when the field is empty', () => {
		expect(validateEmailChange('', 'daniel@example.org')).toBe('Please enter your email address.');
	});

	it('refuses something that is not an address at all', () => {
		expect(validateEmailChange('not-an-address', 'daniel@example.org')).toBe(
			'That does not look like an email address.'
		);
	});

	it('refuses the address the account already has', () => {
		expect(validateEmailChange('daniel@example.org', 'daniel@example.org')).toBe(
			'That is already your email address.'
		);
	});

	it('treats a differently capitalised address as the same one', () => {
		expect(validateEmailChange('Daniel@Example.org', 'daniel@example.org')).toBe(
			'That is already your email address.'
		);
	});

	it('turns an address with spaces round it away, as every other form does', () => {
		expect(validateEmailChange(' daniel@example.org ', 'somebody@example.org')).toBe(
			'That does not look like an email address.'
		);
	});
});

describe('validateNewPassword', () => {
	it('accepts a long enough password that was typed twice the same', () => {
		expect(validateNewPassword('a-good-password', 'a-good-password')).toBeNull();
	});

	it('refuses a password shorter than eight characters', () => {
		expect(validateNewPassword('short', 'short')).toBe('Please use at least 8 characters.');
	});

	it('refuses two new passwords that do not match', () => {
		expect(validateNewPassword('a-good-password', 'a-good-passward')).toBe(
			'The two new passwords do not match.'
		);
	});

	it('complains about the length before the repeat, so the field at fault is named first', () => {
		expect(validateNewPassword('short', 'different')).toBe('Please use at least 8 characters.');
	});
});

describe('validateDeleteConfirmation', () => {
	it('accepts the word itself', () => {
		expect(validateDeleteConfirmation(DELETE_CONFIRMATION_WORD)).toBeNull();
	});

	it('accepts the word with spaces round it, which a paste can leave behind', () => {
		expect(validateDeleteConfirmation('  DELETE ')).toBeNull();
	});

	it('refuses an empty field', () => {
		expect(validateDeleteConfirmation('')).toBe('Type DELETE to confirm.');
	});

	it('refuses the word in lower case, because a confirmation is meant to be deliberate', () => {
		expect(validateDeleteConfirmation('delete')).toBe('Type DELETE to confirm.');
	});

	it('refuses anything else', () => {
		expect(validateDeleteConfirmation('delete my account')).toBe('Type DELETE to confirm.');
	});
});

describe('describeSoleOwnership', () => {
	it('names the organisation and says what to do about it', () => {
		expect(describeSoleOwnership('Amsterdam MUN')).toBe(
			'You are the only owner of Amsterdam MUN. Make somebody else an owner, or delete the organisation, before deleting your account.'
		);
	});
});

describe('validateCurrentPassword', () => {
	it('accepts whatever was typed, because only Supabase can say if it is right', () => {
		expect(validateCurrentPassword('the-old-password')).toBeNull();
	});

	it('asks for the current password when the box was left empty', () => {
		// Asked here rather than sent to Supabase: an empty password is never
		// right, and the network call would only say so more slowly.
		expect(validateCurrentPassword('')).toBe('Enter your current password.');
	});
});

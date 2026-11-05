import { describe, expect, it } from 'vitest';
import type { InstantPress } from '$lib/instant-form.svelte';
import {
	describeDetailsFailure,
	describeDetailsSaved,
	describeProfileFailure,
	describeProfileSaved,
	readDetailsForm,
	readProfileForm
} from './profile-presses';

/** A press of one of the edit forms with `fields` filled in. */
function press(fields: Record<string, string>): InstantPress {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) formData.set(name, value);

	return {
		id: 1,
		action: new URL('http://localhost/profile/edit?/updatePublic'),
		formData,
		expected: null
	};
}

const COMPLETE_PROFILE = {
	fullName: 'Ana Silva',
	institutionName: 'Lisbon School',
	countryCode: 'PT',
	experienceLevel: 'beginner',
	pronouns: '',
	bio: ''
};

/** Every public field left empty. */
const EMPTY_PROFILE = {
	fullName: '',
	institutionName: '',
	countryCode: '',
	experienceLevel: '',
	pronouns: '',
	bio: ''
};

describe('describeProfileSaved', () => {
	it('says the profile is saved when the server will take it', () => {
		expect(describeProfileSaved(press(COMPLETE_PROFILE))).toBe('Profile saved.');
	});

	it('says nothing at once when the server will send a field back', () => {
		expect(describeProfileSaved(press({ ...COMPLETE_PROFILE, fullName: '' }))).toBeNull();
	});
});

describe('describeDetailsSaved', () => {
	it('says the details are saved when every field is fine', () => {
		expect(describeDetailsSaved(press({ phone: '+351 900 000 000' }))).toBe('Details saved.');
	});

	it('says nothing at once for an emergency contact without a phone number', () => {
		expect(describeDetailsSaved(press({ emergencyContactName: 'Rui Silva' }))).toBeNull();
	});
});

describe('readProfileForm', () => {
	it('keeps every field exactly as typed and fills a missing one with an empty string', () => {
		const formData = new FormData();
		formData.set('fullName', '  Ana Silva ');

		expect(readProfileForm(formData)).toEqual({ ...EMPTY_PROFILE, fullName: '  Ana Silva ' });
	});
});

describe('readDetailsForm', () => {
	it('keeps every field exactly as typed and fills a missing one with an empty string', () => {
		const formData = new FormData();
		formData.set('phone', '+351 900 000 000');

		expect(readDetailsForm(formData)).toEqual({
			dateOfBirth: '',
			phone: '+351 900 000 000',
			dietaryRequirements: '',
			emergencyContactName: '',
			emergencyContactPhone: ''
		});
	});
});

describe('describeProfileFailure and describeDetailsFailure', () => {
	it('name which form was not saved', () => {
		expect(describeProfileFailure()).toBe('Your profile was not saved.');
		expect(describeDetailsFailure()).toBe('Your details were not saved.');
	});
});

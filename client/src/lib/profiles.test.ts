import { describe, expect, it } from 'vitest';
import {
	firstName,
	hasFieldErrors,
	hasWelcomeFormErrors,
	isExperienceLevel,
	isPossibleDateOfBirth,
	profileCompleteness,
	sortConferenceHistory,
	validateAvatarFile,
	validateDetailsForm,
	validateProfileForm,
	validateWelcomeForm,
	type ConferenceHistoryEntry,
	type DetailsFormValues,
	type MyProfile,
	type ProfileFormValues,
	type WelcomeFormValues
} from './profiles';

describe('firstName', () => {
	it('takes the first word of a full name', () => {
		expect(firstName('Daniel Perez')).toBe('Daniel');
		expect(firstName('Anna Maria de Vries')).toBe('Anna');
	});

	it('gives back a one-word name unchanged', () => {
		expect(firstName('Madonna')).toBe('Madonna');
	});

	it('copes with extra spaces around and inside the name', () => {
		expect(firstName('  Daniel   Perez  ')).toBe('Daniel');
	});

	it('gives back nothing for a blank name', () => {
		expect(firstName('')).toBe('');
		expect(firstName('   ')).toBe('');
	});
});

describe('isExperienceLevel', () => {
	it('accepts the four values of the enum', () => {
		expect(isExperienceLevel('none')).toBe(true);
		expect(isExperienceLevel('beginner')).toBe(true);
		expect(isExperienceLevel('intermediate')).toBe(true);
		expect(isExperienceLevel('advanced')).toBe(true);
	});

	it('refuses anything else', () => {
		expect(isExperienceLevel('')).toBe(false);
		expect(isExperienceLevel('expert')).toBe(false);
	});
});

describe('isPossibleDateOfBirth', () => {
	/** The day every test in this block pretends it is. */
	const TODAY = new Date('2026-09-16T00:00:00Z');

	it('accepts a real date in the past', () => {
		expect(isPossibleDateOfBirth('2007-03-14', TODAY)).toBe(true);
	});

	it('accepts today itself', () => {
		expect(isPossibleDateOfBirth('2026-09-16', TODAY)).toBe(true);
	});

	it('refuses a date in the future', () => {
		expect(isPossibleDateOfBirth('2026-09-17', TODAY)).toBe(false);
	});

	it('refuses a year before 1900', () => {
		expect(isPossibleDateOfBirth('1899-12-31', TODAY)).toBe(false);
	});

	it('refuses a day that does not exist', () => {
		expect(isPossibleDateOfBirth('2007-02-31', TODAY)).toBe(false);
	});

	it('refuses anything that is not YYYY-MM-DD', () => {
		expect(isPossibleDateOfBirth('14/03/2007', TODAY)).toBe(false);
		expect(isPossibleDateOfBirth('yesterday', TODAY)).toBe(false);
	});
});

describe('validateWelcomeForm', () => {
	/** The day every test in this block pretends it is. */
	const TODAY = new Date('2026-09-16T00:00:00Z');

	/** A form somebody filled in properly. Each test changes one field of it. */
	const COMPLETE_FORM: WelcomeFormValues = {
		fullName: 'Daniel Perez',
		institution: 'Delft University',
		countryCode: 'NL',
		experienceLevel: 'intermediate',
		dateOfBirth: '2005-06-01',
		phone: '+31 6 1234 5678',
		dietaryRequirements: 'Vegetarian',
		emergencyContactName: 'Maria Perez',
		emergencyContactPhone: '+31 6 8765 4321'
	};

	it('finds nothing wrong with a form that is filled in', () => {
		expect(validateWelcomeForm(COMPLETE_FORM, TODAY)).toEqual({});
		expect(hasWelcomeFormErrors(validateWelcomeForm(COMPLETE_FORM, TODAY))).toBe(false);
	});

	it('accepts a form with every optional field left empty', () => {
		const onlyRequired: WelcomeFormValues = {
			...COMPLETE_FORM,
			dateOfBirth: '',
			phone: '',
			dietaryRequirements: '',
			emergencyContactName: '',
			emergencyContactPhone: ''
		};

		expect(validateWelcomeForm(onlyRequired, TODAY)).toEqual({});
	});

	it('asks for a name', () => {
		const errors = validateWelcomeForm({ ...COMPLETE_FORM, fullName: '   ' }, TODAY);

		expect(errors.fullName).toBe('Please enter your name.');
	});

	it('asks for an institution', () => {
		const errors = validateWelcomeForm({ ...COMPLETE_FORM, institution: '' }, TODAY);

		expect(errors.institution).toBe('Please enter your school, university or club.');
	});

	it('refuses a name over 80 and an institution over 120 characters, as the database does', () => {
		const errors = validateWelcomeForm(
			{ ...COMPLETE_FORM, fullName: 'a'.repeat(81), institution: 'b'.repeat(121) },
			TODAY
		);

		expect(errors.fullName).toBe('Your name can be at most 80 characters.');
		expect(errors.institution).toBe('Your institution can be at most 120 characters.');
	});

	it('accepts a name of 80 and an institution of 120 characters', () => {
		const errors = validateWelcomeForm(
			{ ...COMPLETE_FORM, fullName: 'a'.repeat(80), institution: 'b'.repeat(120) },
			TODAY
		);

		expect(errors).toEqual({});
	});

	it('asks for a country it recognises', () => {
		expect(validateWelcomeForm({ ...COMPLETE_FORM, countryCode: '' }, TODAY).countryCode).toBe(
			'Please pick a country.'
		);
		expect(validateWelcomeForm({ ...COMPLETE_FORM, countryCode: 'ZZ' }, TODAY).countryCode).toBe(
			'Please pick a country.'
		);
	});

	it('asks for an experience level', () => {
		const errors = validateWelcomeForm({ ...COMPLETE_FORM, experienceLevel: 'expert' }, TODAY);

		expect(errors.experienceLevel).toBe('Please pick your experience level.');
	});

	it('refuses a date of birth that could not happen', () => {
		const errors = validateWelcomeForm({ ...COMPLETE_FORM, dateOfBirth: '2030-01-01' }, TODAY);

		expect(errors.dateOfBirth).toBe('Please enter a valid date of birth.');
	});

	it('refuses a dietary note longer than 300 characters', () => {
		const errors = validateWelcomeForm(
			{ ...COMPLETE_FORM, dietaryRequirements: 'a'.repeat(301) },
			TODAY
		);

		expect(errors.dietaryRequirements).toBe('Please keep this under 300 characters.');
	});

	it('refuses a phone number or emergency contact longer than the details editor allows (security review L67)', () => {
		const errors = validateWelcomeForm(
			{
				...COMPLETE_FORM,
				phone: '1'.repeat(31),
				emergencyContactName: 'a'.repeat(81),
				emergencyContactPhone: '2'.repeat(31)
			},
			TODAY
		);

		expect(errors).toEqual({
			phone: 'Your phone number can be at most 30 characters.',
			emergencyContactName: 'That name can be at most 80 characters.',
			emergencyContactPhone: 'That phone number can be at most 30 characters.'
		});
	});

	it('measures the phone and the emergency contact after trimming, as the save does', () => {
		const errors = validateWelcomeForm(
			{
				...COMPLETE_FORM,
				phone: `  ${'1'.repeat(30)}  `,
				emergencyContactName: ` ${'a'.repeat(80)} `,
				emergencyContactPhone: `${'2'.repeat(30)}   `
			},
			TODAY
		);

		expect(errors).toEqual({});
	});

	it('collects every problem at once rather than stopping at the first', () => {
		const errors = validateWelcomeForm(
			{
				...COMPLETE_FORM,
				fullName: '',
				institution: '',
				countryCode: '',
				experienceLevel: ''
			},
			TODAY
		);

		expect(Object.keys(errors).sort()).toEqual([
			'countryCode',
			'experienceLevel',
			'fullName',
			'institution'
		]);
		expect(hasWelcomeFormErrors(errors)).toBe(true);
	});
});

describe('profileCompleteness', () => {
	/** A profile with all four required fields filled in. Each test empties some of them. */
	const COMPLETE_PROFILE: MyProfile = {
		fullName: 'Daniel Perez',
		avatarPath: null,
		institutionName: 'Delft University',
		countryCode: 'NL',
		experienceLevel: 'intermediate',
		pronouns: 'he/him',
		bio: 'Four conferences so far.',
		onboardingCompletedAt: '2026-09-01T10:00:00Z'
	};

	it('finds nothing missing in a profile that is filled in', () => {
		expect(profileCompleteness(COMPLETE_PROFILE)).toEqual({ isComplete: true, missingFields: [] });
	});

	it('counts "First time" as an answered experience level', () => {
		const firstTimer: MyProfile = { ...COMPLETE_PROFILE, experienceLevel: 'none' };

		expect(profileCompleteness(firstTimer)).toEqual({ isComplete: true, missingFields: [] });
	});

	it('names the one field that is empty', () => {
		const withoutInstitution: MyProfile = { ...COMPLETE_PROFILE, institutionName: '' };

		expect(profileCompleteness(withoutInstitution)).toEqual({
			isComplete: false,
			missingFields: ['institutionName']
		});
	});

	it('treats a field with nothing but spaces in it as empty', () => {
		const withoutName: MyProfile = { ...COMPLETE_PROFILE, fullName: '   ' };

		expect(profileCompleteness(withoutName).missingFields).toEqual(['fullName']);
	});

	it('lists all four fields in the order the warning names them', () => {
		// The enum column cannot really hold empty text, so this is not a row the
		// database could produce. `unanswered` is typed as plain `string`, and the
		// whole profile is then cast, because that is the only way to build a
		// profile with all four fields missing at once, which is what shows the
		// order.
		const unanswered: string = '';

		const emptyProfile = {
			...COMPLETE_PROFILE,
			fullName: '',
			institutionName: '',
			countryCode: '',
			experienceLevel: unanswered
		} as MyProfile;

		expect(profileCompleteness(emptyProfile).missingFields).toEqual([
			'fullName',
			'institutionName',
			'countryCode',
			'experienceLevel'
		]);
	});
});

describe('validateProfileForm', () => {
	/** A form somebody filled in properly. Each test changes one field of it. */
	const COMPLETE_FORM: ProfileFormValues = {
		fullName: 'Daniel Perez',
		institutionName: 'Delft University',
		countryCode: 'NL',
		experienceLevel: 'intermediate',
		pronouns: 'he/him',
		bio: 'Four conferences so far.'
	};

	it('finds nothing wrong with a form that is filled in', () => {
		expect(validateProfileForm(COMPLETE_FORM)).toEqual({});
		expect(hasFieldErrors(validateProfileForm(COMPLETE_FORM))).toBe(false);
	});

	it('accepts a form with every optional field left empty', () => {
		const onlyRequired: ProfileFormValues = {
			...COMPLETE_FORM,
			institutionName: '',
			pronouns: '',
			bio: ''
		};

		expect(validateProfileForm(onlyRequired)).toEqual({});
	});

	it('asks for a name', () => {
		expect(validateProfileForm({ ...COMPLETE_FORM, fullName: '   ' }).fullName).toBe(
			'Please enter your name.'
		);
	});

	it('refuses a name of one letter and accepts one of two', () => {
		expect(validateProfileForm({ ...COMPLETE_FORM, fullName: 'D' }).fullName).toBe(
			'Please enter your name.'
		);
		expect(validateProfileForm({ ...COMPLETE_FORM, fullName: 'Li' })).toEqual({});
	});

	it('refuses a name longer than 80 characters', () => {
		expect(validateProfileForm({ ...COMPLETE_FORM, fullName: 'a'.repeat(80) })).toEqual({});
		expect(validateProfileForm({ ...COMPLETE_FORM, fullName: 'a'.repeat(81) }).fullName).toBe(
			'Your name can be at most 80 characters.'
		);
	});

	it('refuses an institution longer than 120 characters', () => {
		expect(validateProfileForm({ ...COMPLETE_FORM, institutionName: 'a'.repeat(120) })).toEqual({});
		expect(
			validateProfileForm({ ...COMPLETE_FORM, institutionName: 'a'.repeat(121) }).institutionName
		).toBe('Your institution can be at most 120 characters.');
	});

	it('asks for a country it recognises', () => {
		expect(validateProfileForm({ ...COMPLETE_FORM, countryCode: '' }).countryCode).toBe(
			'Please pick a country.'
		);
		expect(validateProfileForm({ ...COMPLETE_FORM, countryCode: 'ZZ' }).countryCode).toBe(
			'Please pick a country.'
		);
	});

	it('asks for an experience level, and takes "none" as one', () => {
		expect(validateProfileForm({ ...COMPLETE_FORM, experienceLevel: '' }).experienceLevel).toBe(
			'Please pick your experience level.'
		);
		expect(
			validateProfileForm({ ...COMPLETE_FORM, experienceLevel: 'expert' }).experienceLevel
		).toBe('Please pick your experience level.');
		expect(validateProfileForm({ ...COMPLETE_FORM, experienceLevel: 'none' })).toEqual({});
	});

	it('refuses pronouns longer than 30 characters', () => {
		expect(validateProfileForm({ ...COMPLETE_FORM, pronouns: 'a'.repeat(30) })).toEqual({});
		expect(validateProfileForm({ ...COMPLETE_FORM, pronouns: 'a'.repeat(31) }).pronouns).toBe(
			'Your pronouns can be at most 30 characters.'
		);
	});

	it('refuses a bio longer than 500 characters', () => {
		expect(validateProfileForm({ ...COMPLETE_FORM, bio: 'a'.repeat(500) })).toEqual({});
		expect(validateProfileForm({ ...COMPLETE_FORM, bio: 'a'.repeat(501) }).bio).toBe(
			'Your bio can be at most 500 characters.'
		);
	});

	it('collects every problem at once rather than stopping at the first', () => {
		const errors = validateProfileForm({
			fullName: '',
			institutionName: 'a'.repeat(121),
			countryCode: '',
			experienceLevel: '',
			pronouns: 'a'.repeat(31),
			bio: 'a'.repeat(501)
		});

		expect(Object.keys(errors).sort()).toEqual([
			'bio',
			'countryCode',
			'experienceLevel',
			'fullName',
			'institutionName',
			'pronouns'
		]);
		expect(hasFieldErrors(errors)).toBe(true);
	});
});

describe('validateDetailsForm', () => {
	/** The day every test in this block pretends it is. */
	const TODAY = new Date('2026-09-16T00:00:00Z');

	/** A form somebody filled in properly. Each test changes one field of it. */
	const COMPLETE_FORM: DetailsFormValues = {
		dateOfBirth: '2005-06-01',
		phone: '+31 6 1234 5678',
		dietaryRequirements: 'Vegetarian',
		emergencyContactName: 'Maria Perez',
		emergencyContactPhone: '+31 6 8765 4321'
	};

	it('finds nothing wrong with a form that is filled in', () => {
		expect(validateDetailsForm(COMPLETE_FORM, TODAY)).toEqual({});
		expect(hasFieldErrors(validateDetailsForm(COMPLETE_FORM, TODAY))).toBe(false);
	});

	it('accepts a form with every field left empty, because all of them are optional', () => {
		const empty: DetailsFormValues = {
			dateOfBirth: '',
			phone: '',
			dietaryRequirements: '',
			emergencyContactName: '',
			emergencyContactPhone: ''
		};

		expect(validateDetailsForm(empty, TODAY)).toEqual({});
	});

	it('refuses a date of birth that could not happen', () => {
		expect(
			validateDetailsForm({ ...COMPLETE_FORM, dateOfBirth: '2030-01-01' }, TODAY).dateOfBirth
		).toBe('That date of birth is not possible.');
		expect(
			validateDetailsForm({ ...COMPLETE_FORM, dateOfBirth: '2005-02-31' }, TODAY).dateOfBirth
		).toBe('That date of birth is not possible.');
	});

	it('refuses a phone number longer than 30 characters', () => {
		expect(validateDetailsForm({ ...COMPLETE_FORM, phone: '1'.repeat(30) }, TODAY)).toEqual({});
		expect(validateDetailsForm({ ...COMPLETE_FORM, phone: '1'.repeat(31) }, TODAY).phone).toBe(
			'Your phone number can be at most 30 characters.'
		);
	});

	it('refuses a dietary note longer than 300 characters', () => {
		expect(
			validateDetailsForm({ ...COMPLETE_FORM, dietaryRequirements: 'a'.repeat(300) }, TODAY)
		).toEqual({});
		expect(
			validateDetailsForm({ ...COMPLETE_FORM, dietaryRequirements: 'a'.repeat(301) }, TODAY)
				.dietaryRequirements
		).toBe('Please keep this under 300 characters.');
	});

	it('refuses an emergency contact name longer than 80 characters', () => {
		expect(
			validateDetailsForm({ ...COMPLETE_FORM, emergencyContactName: 'a'.repeat(80) }, TODAY)
		).toEqual({});
		expect(
			validateDetailsForm({ ...COMPLETE_FORM, emergencyContactName: 'a'.repeat(81) }, TODAY)
				.emergencyContactName
		).toBe('That name can be at most 80 characters.');
	});

	it('refuses an emergency contact phone number longer than 30 characters', () => {
		expect(
			validateDetailsForm({ ...COMPLETE_FORM, emergencyContactPhone: '1'.repeat(30) }, TODAY)
		).toEqual({});
		expect(
			validateDetailsForm({ ...COMPLETE_FORM, emergencyContactPhone: '1'.repeat(31) }, TODAY)
				.emergencyContactPhone
		).toBe('That phone number can be at most 30 characters.');
	});

	it('asks for a phone number once an emergency contact is named', () => {
		const errors = validateDetailsForm({ ...COMPLETE_FORM, emergencyContactPhone: '   ' }, TODAY);

		expect(errors.emergencyContactPhone).toBe(
			'Please add a phone number for your emergency contact.'
		);
		expect(errors.emergencyContactName).toBeUndefined();
	});

	it('does not ask for a phone number when there is no emergency contact either', () => {
		const errors = validateDetailsForm(
			{ ...COMPLETE_FORM, emergencyContactName: '', emergencyContactPhone: '' },
			TODAY
		);

		expect(errors).toEqual({});
	});

	it('collects every problem at once rather than stopping at the first', () => {
		const errors = validateDetailsForm(
			{
				dateOfBirth: '2030-01-01',
				phone: '1'.repeat(31),
				dietaryRequirements: 'a'.repeat(301),
				emergencyContactName: 'a'.repeat(81),
				emergencyContactPhone: ''
			},
			TODAY
		);

		expect(Object.keys(errors).sort()).toEqual([
			'dateOfBirth',
			'dietaryRequirements',
			'emergencyContactName',
			'emergencyContactPhone',
			'phone'
		]);
	});
});

describe('hasFieldErrors', () => {
	it('says no when nothing is wrong', () => {
		expect(hasFieldErrors({})).toBe(false);
	});

	it('says yes when one field has a message', () => {
		expect(hasFieldErrors({ countryCode: 'Please pick a country.' })).toBe(true);
	});

	it('answers the same question as hasWelcomeFormErrors', () => {
		const errors = validateWelcomeForm(
			{
				fullName: '',
				institution: '',
				countryCode: '',
				experienceLevel: '',
				dateOfBirth: '',
				phone: '',
				dietaryRequirements: '',
				emergencyContactName: '',
				emergencyContactPhone: ''
			},
			new Date('2026-09-16T00:00:00Z')
		);

		expect(hasFieldErrors(errors)).toBe(hasWelcomeFormErrors(errors));
	});
});

describe('sortConferenceHistory', () => {
	/** One history row. Only the id and the start date matter to these tests. */
	function historyEntry(id: string, conferenceStartDate: string): ConferenceHistoryEntry {
		return {
			id,
			conferenceName: `Conference ${id}`,
			conferenceSlug: `conference-${id}`,
			conferenceLogoPath: null,
			conferenceStartDate,
			conferenceEndDate: conferenceStartDate,
			committeeHeading: 'UNSC',
			committeeSlug: 'unsc',
			seatName: 'France',
			seatCountryCode: 'FR',
			role: 'Delegate'
		};
	}

	it('puts the conference that starts soonest first', () => {
		const entries = [
			historyEntry('third', '2027-03-01'),
			historyEntry('first', '2026-01-15'),
			historyEntry('second', '2026-11-02')
		];

		const sortedIds = sortConferenceHistory(entries).map((entry) => entry.id);

		expect(sortedIds).toEqual(['first', 'second', 'third']);
	});

	it('gives back an empty list for an empty list', () => {
		expect(sortConferenceHistory([])).toEqual([]);
	});

	it('leaves the array it was given alone', () => {
		const entries = [historyEntry('later', '2027-03-01'), historyEntry('sooner', '2026-01-15')];

		sortConferenceHistory(entries);

		expect(entries.map((entry) => entry.id)).toEqual(['later', 'sooner']);
	});

	it('keeps two rows from the same conference in the order they came in', () => {
		const entries = [
			historyEntry('second-committee', '2026-05-01'),
			historyEntry('first-committee', '2026-05-01')
		];

		const sortedIds = sortConferenceHistory(entries).map((entry) => entry.id);

		expect(sortedIds).toEqual(['second-committee', 'first-committee']);
	});
});

describe('validateAvatarFile', () => {
	/** The size limit in bytes, so that a test can sit just either side of it. */
	const FIVE_MEGABYTES = 5 * 1024 * 1024;

	it('accepts each of the three picture types the bucket takes', () => {
		expect(validateAvatarFile({ type: 'image/jpeg', size: 200_000 })).toEqual({});
		expect(validateAvatarFile({ type: 'image/png', size: 200_000 })).toEqual({});
		expect(validateAvatarFile({ type: 'image/webp', size: 200_000 })).toEqual({});
	});

	it('refuses a PDF, which is the wrong kind of file altogether', () => {
		expect(validateAvatarFile({ type: 'application/pdf', size: 200_000 })).toEqual({
			avatar: 'Please choose a JPEG, PNG or WebP image.'
		});
	});

	it('refuses a JPEG of six megabytes, which is over the limit', () => {
		expect(validateAvatarFile({ type: 'image/jpeg', size: 6 * 1024 * 1024 })).toEqual({
			avatar: 'The image must be smaller than 5 MB.'
		});
	});

	it('accepts a file of exactly five megabytes, and refuses the next byte up', () => {
		// The message says "smaller than 5 MB", so five megabytes on the nose is
		// the largest picture that still goes through.
		expect(validateAvatarFile({ type: 'image/png', size: FIVE_MEGABYTES })).toEqual({});
		expect(validateAvatarFile({ type: 'image/png', size: FIVE_MEGABYTES + 1 })).toEqual({
			avatar: 'The image must be smaller than 5 MB.'
		});
	});

	it('tells an empty file box to choose a picture rather than talking about size', () => {
		// An empty box still posts a file, of no size and of no particular type,
		// so the type message is what somebody who chose nothing is shown.
		expect(validateAvatarFile({ type: 'application/octet-stream', size: 0 })).toEqual({
			avatar: 'Please choose a JPEG, PNG or WebP image.'
		});
	});

	it('tells a six megabyte PDF the wrong thing first: its kind, not its size', () => {
		expect(validateAvatarFile({ type: 'application/pdf', size: 6 * 1024 * 1024 })).toEqual({
			avatar: 'Please choose a JPEG, PNG or WebP image.'
		});
	});

	it('leaves the field out of the object when the picture is fine', () => {
		const errors = validateAvatarFile({ type: 'image/webp', size: 1_000 });

		// `hasFieldErrors` counts the fields that are there, so a picture with
		// nothing wrong must leave the key out rather than set it to undefined.
		expect(hasFieldErrors(errors)).toBe(false);
		expect(hasFieldErrors(validateAvatarFile({ type: 'text/plain', size: 10 }))).toBe(true);
	});
});

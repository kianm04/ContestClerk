/**
 * What the app works out from a person's profile without asking the database.
 *
 * The welcome page (`/welcome`) asks a new account for the few facts every
 * application needs, and this file holds the checking of that form. The profile
 * pages (`/profile` and `/profile/edit`) add the shapes of the two profile
 * rows, `profileCompleteness`, the checking of their own three forms and the
 * sorting of the conference history list.
 *
 * Nothing here talks to Supabase or to Svelte.
 */

import { isCountryCode } from '$lib/countries';

/**
 * The name to greet somebody by: "Daniel Perez" gives "Daniel".
 *
 * The first word of the full name, which is the best a single text field can
 * do. A name that is one word is that word, and a name that is blank gives '',
 * which the top bar shows as nothing at all rather than as the word
 * "undefined".
 */
export function firstName(fullName: string): string {
	return fullName.trim().split(/\s+/)[0] ?? '';
}

/** The four answers to "how much MUN have you done?", the `experience_level` enum. */
export const EXPERIENCE_LEVELS = ['none', 'beginner', 'intermediate', 'advanced'] as const;

export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

/**
 * The four choices as the welcome page words them.
 *
 * `$lib/status.ts` has a label for every value of every enum, but those are the
 * words a badge shows about somebody else ("Beginner"). These are the words
 * somebody picks for themselves, which `05-pages/auth/welcome.md` writes out,
 * so they are kept here next to the form that uses them.
 */
export const EXPERIENCE_LEVEL_CHOICES: { value: ExperienceLevel; label: string }[] = [
	{ value: 'none', label: 'First time' },
	{ value: 'beginner', label: 'One or two conferences' },
	{ value: 'intermediate', label: 'Several' },
	{ value: 'advanced', label: 'Many, I have chaired' }
];

/** Is this one of the four answers? Anything else is somebody editing the form. */
export function isExperienceLevel(value: string): value is ExperienceLevel {
	return EXPERIENCE_LEVELS.includes(value as ExperienceLevel);
}

/**
 * Everything on the `profiles` row that a page shows or a form edits.
 *
 * This shape and the two below describe rows that `$lib/server/profiles.ts`
 * reads, but they live here rather than next to those queries because a
 * component may not import anything from `$lib/server`, not even a type.
 * `PublicOrganization` in `$lib/organizations.ts` sits here for the same reason.
 */
export type MyProfile = {
	fullName: string;
	avatarPath: string | null;
	institutionName: string;
	countryCode: string;
	experienceLevel: ExperienceLevel;
	pronouns: string;
	bio: string;
	/** `null` while the person has not finished the welcome page. */
	onboardingCompletedAt: string | null;
};

/**
 * Somebody else's profile as anyone signed in may read it, at `/people/[userId]`:
 * the `profiles` row without the onboarding stamp. Organisers open it from an
 * application to see who is applying (Trello pZNcdPqU).
 */
export type PublicProfile = Omit<MyProfile, 'onboardingCompletedAt'>;

/**
 * The facts on `profile_details`, which only the person may read in full. The
 * conference team sees them through two views, by permission
 * (`docs/roles-and-permissions.md`, section 5).
 */
export type MyProfileDetails = {
	email: string;
	dateOfBirth: string;
	phone: string;
	dietaryRequirements: string;
	emergencyContactName: string;
	emergencyContactPhone: string;
};

/** The two rows together, which is what every profile page needs. */
export type MyProfileAndDetails = {
	profile: MyProfile;
	details: MyProfileDetails;
};

/**
 * The four fields an organiser needs filled in before an application from
 * somebody is worth reading. The profile page warns about the empty ones.
 */
export const PROFILE_REQUIRED_FIELDS = [
	'fullName',
	'institutionName',
	'countryCode',
	'experienceLevel'
] as const;

export type ProfileRequiredField = (typeof PROFILE_REQUIRED_FIELDS)[number];

/**
 * The words the warning notice names a missing field by.
 *
 * They are written into the middle of a sentence ("Organisers need your name,
 * your institution."), which is why they are lower case and start with "your".
 */
export const PROFILE_REQUIRED_FIELD_LABELS: Record<ProfileRequiredField, string> = {
	fullName: 'your name',
	institutionName: 'your institution',
	countryCode: 'your country',
	experienceLevel: 'your experience level'
};

/**
 * The part of a profile `profileCompleteness` below reads.
 *
 * It is those four fields and nothing else, so that a caller holding only them
 * — the home dashboard's task list reads exactly these four columns — can ask
 * the question without inventing the rest of a `MyProfile`.
 */
export type ProfileFieldsToCheck = Pick<MyProfile, ProfileRequiredField>;

/** Whether a profile has those four fields, and which of them are still empty. */
export type ProfileCompleteness = {
	isComplete: boolean;
	/**
	 * The empty ones, in the order of `PROFILE_REQUIRED_FIELDS`, so that the
	 * warning always lists them the same way round.
	 */
	missingFields: ProfileRequiredField[];
};

/**
 * Which of the four fields an organiser needs are still empty.
 *
 * A field counts as missing when there is nothing but whitespace in it. So
 * `experienceLevel` counts as answered whenever it holds one of the four
 * values, `'none'` included: `'none'` is not "unanswered", it is the real
 * answer "First time" from `EXPERIENCE_LEVEL_CHOICES` above, and the column is
 * `not null default 'none'` anyway. T09 settled that for the welcome form and
 * this keeps to it.
 */
export function profileCompleteness(profile: ProfileFieldsToCheck): ProfileCompleteness {
	const missingFields = PROFILE_REQUIRED_FIELDS.filter((field) => profile[field].trim() === '');

	return { isComplete: missingFields.length === 0, missingFields };
}

/** The longest a dietary note may be, matching the column and the text box. */
export const DIETARY_REQUIREMENTS_MAX_LENGTH = 300;

/** The earliest year a date of birth may fall in. Anything older is a typo. */
const EARLIEST_BIRTH_YEAR = 1900;

/**
 * Is this a date somebody could have been born on?
 *
 * The value comes from an `<input type="date">`, which sends `YYYY-MM-DD`, but
 * a form posted without JavaScript can carry anything at all, so the shape is
 * checked as well as the range. `today` is a parameter rather than a call to
 * `new Date()` inside, so a test can say what day it is.
 *
 * An empty value is not this function's business: the field is optional, and
 * the caller decides that before asking.
 */
export function isPossibleDateOfBirth(value: string, today: Date = new Date()): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return false;
	}

	// `new Date('2026-02-31')` rolls over into March rather than failing, so the
	// parsed date is turned back into text and compared with what was typed.
	const parsed = new Date(`${value}T00:00:00Z`);

	if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
		return false;
	}

	if (parsed.getUTCFullYear() < EARLIEST_BIRTH_YEAR) {
		return false;
	}

	return parsed.getTime() <= today.getTime();
}

/** Everything the welcome form sends, as text, exactly as it arrives. */
export type WelcomeFormValues = {
	fullName: string;
	institution: string;
	countryCode: string;
	experienceLevel: string;
	dateOfBirth: string;
	phone: string;
	dietaryRequirements: string;
	emergencyContactName: string;
	emergencyContactPhone: string;
};

/**
 * What is wrong with the form, one message per field.
 *
 * A field with nothing wrong is missing from the object rather than set to
 * `undefined`, so `Object.keys(errors).length === 0` means "all good".
 */
export type WelcomeFormErrors = Partial<Record<keyof WelcomeFormValues, string>>;

/**
 * Check the whole welcome form and collect every problem at once.
 *
 * Every problem at once, rather than the first one, because the page draws a
 * message under each field and somebody filling in six fields should not have
 * to submit six times. `today` is a parameter for the reason given on
 * `isPossibleDateOfBirth` above.
 */
export function validateWelcomeForm(
	values: WelcomeFormValues,
	today: Date = new Date()
): WelcomeFormErrors {
	const errors: WelcomeFormErrors = {};

	// The same bounds as the profile editor below and the `profiles` table's
	// own checks, so a name the database would refuse is refused here first.
	if (values.fullName.trim() === '') {
		errors.fullName = 'Please enter your name.';
	} else if (values.fullName.trim().length > FULL_NAME_MAX_LENGTH) {
		errors.fullName = `Your name can be at most ${FULL_NAME_MAX_LENGTH} characters.`;
	}

	if (values.institution.trim() === '') {
		errors.institution = 'Please enter your school, university or club.';
	} else if (values.institution.trim().length > INSTITUTION_NAME_MAX_LENGTH) {
		errors.institution = `Your institution can be at most ${INSTITUTION_NAME_MAX_LENGTH} characters.`;
	}

	if (!isCountryCode(values.countryCode)) {
		errors.countryCode = 'Please pick a country.';
	}

	if (!isExperienceLevel(values.experienceLevel)) {
		errors.experienceLevel = 'Please pick your experience level.';
	}

	// The date of birth is optional, so only a value that was actually filled in
	// can be wrong.
	if (values.dateOfBirth !== '' && !isPossibleDateOfBirth(values.dateOfBirth, today)) {
		errors.dateOfBirth = 'Please enter a valid date of birth.';
	}

	if (values.dietaryRequirements.length > DIETARY_REQUIREMENTS_MAX_LENGTH) {
		errors.dietaryRequirements = `Please keep this under ${DIETARY_REQUIREMENTS_MAX_LENGTH} characters.`;
	}

	// The welcome form writes the same `profile_details` row as the details
	// editor, so it asks the same bounds, which the table now checks too
	// (security review L67). Trimmed, because the save trims before it writes.
	if (values.phone.trim().length > PHONE_MAX_LENGTH) {
		errors.phone = `Your phone number can be at most ${PHONE_MAX_LENGTH} characters.`;
	}

	if (values.emergencyContactName.trim().length > EMERGENCY_CONTACT_NAME_MAX_LENGTH) {
		errors.emergencyContactName = `That name can be at most ${EMERGENCY_CONTACT_NAME_MAX_LENGTH} characters.`;
	}

	if (values.emergencyContactPhone.trim().length > PHONE_MAX_LENGTH) {
		errors.emergencyContactPhone = `That phone number can be at most ${PHONE_MAX_LENGTH} characters.`;
	}

	return errors;
}

/**
 * Are there any problems at all, whichever of the forms they belong to?
 *
 * Every `...FormErrors` type in this file is "a message for some of these
 * fields", so one function can answer this for all of them. It counts the
 * fields that are there, so a check must leave a field out of the object
 * rather than set it to `undefined`.
 */
export function hasFieldErrors(errors: Record<string, string | undefined>): boolean {
	return Object.keys(errors).length > 0;
}

/** Are there any problems at all? Reads better on a page than counting keys. */
export function hasWelcomeFormErrors(errors: WelcomeFormErrors): boolean {
	return hasFieldErrors(errors);
}

/** The longest a bio may be, matching the column and the text box's `maxLength`. */
export const BIO_MAX_LENGTH = 500;

/** The shortest a name can be and still be a name. */
const FULL_NAME_MIN_LENGTH = 2;

/** The longest a name may be, on the welcome form and the profile editor alike. */
export const FULL_NAME_MAX_LENGTH = 80;

/** The longest the name of a school, university or club may be. The `profiles` table checks the same. */
export const INSTITUTION_NAME_MAX_LENGTH = 120;

/** The longest the pronouns field may be. It holds "she/her", not a sentence. */
const PRONOUNS_MAX_LENGTH = 30;

/**
 * The longest a phone number may be, the person's own and their emergency
 * contact's alike. The `profile_details` table checks the same.
 */
const PHONE_MAX_LENGTH = 30;

/** The longest the name of an emergency contact may be. The `profile_details` table checks the same. */
const EMERGENCY_CONTACT_NAME_MAX_LENGTH = 80;

/**
 * The public half of the edit form, as text, exactly as it arrives.
 *
 * `experienceLevel` is a plain `string` and not the enum, because a form can
 * send anything at all; `validateProfileForm` is what decides it is one of the
 * four.
 */
export type ProfileFormValues = {
	fullName: string;
	institutionName: string;
	countryCode: string;
	experienceLevel: string;
	pronouns: string;
	bio: string;
};

/** What is wrong with the public half, in the same shape as `WelcomeFormErrors`. */
export type ProfileFormErrors = Partial<Record<keyof ProfileFormValues, string>>;

/**
 * Check the public half of the edit form and collect every problem at once.
 *
 * Every length is measured after trimming, because trimmed text is what the
 * server saves. A field gets at most one message, the first thing wrong with
 * it, so the page never draws two lines under one box.
 */
export function validateProfileForm(values: ProfileFormValues): ProfileFormErrors {
	const errors: ProfileFormErrors = {};
	const fullName = values.fullName.trim();

	if (fullName.length < FULL_NAME_MIN_LENGTH) {
		errors.fullName = 'Please enter your name.';
	} else if (fullName.length > FULL_NAME_MAX_LENGTH) {
		errors.fullName = `Your name can be at most ${FULL_NAME_MAX_LENGTH} characters.`;
	}

	if (values.institutionName.trim().length > INSTITUTION_NAME_MAX_LENGTH) {
		errors.institutionName = `Your institution can be at most ${INSTITUTION_NAME_MAX_LENGTH} characters.`;
	}

	if (!isCountryCode(values.countryCode)) {
		errors.countryCode = 'Please pick a country.';
	}

	if (!isExperienceLevel(values.experienceLevel)) {
		errors.experienceLevel = 'Please pick your experience level.';
	}

	if (values.pronouns.trim().length > PRONOUNS_MAX_LENGTH) {
		errors.pronouns = `Your pronouns can be at most ${PRONOUNS_MAX_LENGTH} characters.`;
	}

	if (values.bio.trim().length > BIO_MAX_LENGTH) {
		errors.bio = `Your bio can be at most ${BIO_MAX_LENGTH} characters.`;
	}

	return errors;
}

/** The private half of the edit form, as text, exactly as it arrives. */
export type DetailsFormValues = {
	dateOfBirth: string;
	phone: string;
	dietaryRequirements: string;
	emergencyContactName: string;
	emergencyContactPhone: string;
};

/** What is wrong with the private half, one message per field. */
export type DetailsFormErrors = Partial<Record<keyof DetailsFormValues, string>>;

/**
 * Check the private half of the edit form and collect every problem at once.
 *
 * Every field here is optional on its own, so only a value somebody actually
 * filled in can be wrong. The one pair that hangs together is the emergency
 * contact: a name with no phone number beside it is no use to an organiser.
 * `today` is a parameter rather than a call to `new Date()` inside, for the
 * reason given on `isPossibleDateOfBirth` above.
 */
export function validateDetailsForm(
	values: DetailsFormValues,
	today: Date = new Date()
): DetailsFormErrors {
	const errors: DetailsFormErrors = {};

	if (values.dateOfBirth !== '' && !isPossibleDateOfBirth(values.dateOfBirth, today)) {
		errors.dateOfBirth = 'That date of birth is not possible.';
	}

	if (values.phone.trim().length > PHONE_MAX_LENGTH) {
		errors.phone = `Your phone number can be at most ${PHONE_MAX_LENGTH} characters.`;
	}

	if (values.dietaryRequirements.trim().length > DIETARY_REQUIREMENTS_MAX_LENGTH) {
		errors.dietaryRequirements = `Please keep this under ${DIETARY_REQUIREMENTS_MAX_LENGTH} characters.`;
	}

	const emergencyContactName = values.emergencyContactName.trim();
	const emergencyContactPhone = values.emergencyContactPhone.trim();

	if (emergencyContactName.length > EMERGENCY_CONTACT_NAME_MAX_LENGTH) {
		errors.emergencyContactName = `That name can be at most ${EMERGENCY_CONTACT_NAME_MAX_LENGTH} characters.`;
	}

	if (emergencyContactPhone.length > PHONE_MAX_LENGTH) {
		errors.emergencyContactPhone = `That phone number can be at most ${PHONE_MAX_LENGTH} characters.`;
	}

	// The message goes on the phone field rather than the name field, because
	// the phone number is the thing somebody has to go and fill in. A phone
	// number that is too long is not empty, so these two never clash.
	if (emergencyContactName !== '' && emergencyContactPhone === '') {
		errors.emergencyContactPhone = 'Please add a phone number for your emergency contact.';
	}

	return errors;
}

/** The largest picture the avatar form takes, in megabytes. `02-architecture/storage.md`. */
export const AVATAR_MAX_SIZE_MB = 5;

/** That same limit in bytes, which is the unit a file measures itself in. */
const AVATAR_MAX_SIZE_BYTES = AVATAR_MAX_SIZE_MB * 1024 * 1024;

/** The three picture types the `public-media` bucket accepts, one per entry. */
const AVATAR_ACCEPTED_TYPE_LIST = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * The three picture types the `public-media` bucket accepts, written the way the
 * HTML `accept` attribute wants them.
 */
export const AVATAR_ACCEPTED_TYPES = AVATAR_ACCEPTED_TYPE_LIST.join(',');

/** What is wrong with the picture somebody chose. The avatar form has one field. */
export type AvatarFormErrors = { avatar?: string };

/**
 * Check the picture somebody chose: one of the three types, and under the size limit.
 *
 * It is given the two facts it needs rather than the whole `File`, so that a test
 * can describe a six megabyte photograph without building one.
 *
 * There is no message of its own for "you chose nothing", because an empty file
 * box still posts a file: one of no size, whose type is not one of the three, so
 * it is answered by the type message below like any other wrong file. The type
 * is looked at first for the same reason, so that a six megabyte PDF is told it
 * is the wrong kind of file rather than too big a one.
 */
export function validateAvatarFile(file: { type: string; size: number }): AvatarFormErrors {
	if (!AVATAR_ACCEPTED_TYPE_LIST.includes(file.type)) {
		return { avatar: 'Please choose a JPEG, PNG or WebP image.' };
	}

	if (file.size > AVATAR_MAX_SIZE_BYTES) {
		return { avatar: `The image must be smaller than ${AVATAR_MAX_SIZE_MB} MB.` };
	}

	return {};
}

/** One row of the conference history: a seat somebody held, or a committee they chaired. */
export type ConferenceHistoryEntry = {
	/** The seat's id, or `chair-<committee id>` for a chair row. */
	id: string;
	conferenceName: string;
	conferenceSlug: string;
	conferenceLogoPath: string | null;
	conferenceStartDate: string;
	conferenceEndDate: string;
	committeeHeading: string;
	committeeSlug: string;
	/** The seat's name, such as "France", or `null` for a chair. */
	seatName: string | null;
	/**
	 * The seat's ISO two-letter country code, for drawing a flag. Null for a chair, or a seat that
	 * is not a country.
	 */
	seatCountryCode: string | null;
	/** "Delegate", or the chair's own title. */
	role: string;
};

/**
 * The history rows with the conference that starts soonest first.
 *
 * `conferenceStartDate` is a `YYYY-MM-DD` string, and text like that sorts into
 * date order on its own, because it runs from the largest part to the smallest.
 * No `Date` is built, so there is no timezone to get wrong.
 *
 * The array a `load` function returns is handed straight to the page, so this
 * sorts a copy rather than the array it was given. Two conferences that start
 * on the same day keep the order they came in, which `Array.prototype.sort`
 * guarantees.
 */
export function sortConferenceHistory(entries: ConferenceHistoryEntry[]): ConferenceHistoryEntry[] {
	return [...entries].sort((first, second) =>
		first.conferenceStartDate.localeCompare(second.conferenceStartDate)
	);
}

/**
 * The details a visitor fills in on step 1 of "Create a conference", and the checks
 * those details have to pass.
 *
 * Nothing in here talks to Supabase or to Svelte. The form actions in
 * `src/routes/create/+page.server.ts` use these plain functions.
 */

import { validateEmail } from '$lib/auth';
import { ISO_DATE, LEVEL_OPTIONS } from '$lib/conferences';
import { isCountryCode } from '$lib/countries';
import { isCurrencyCode } from '$lib/money';
import { isTimezone } from '$lib/timezones';

/** Everything step 1 asks for. An empty field is '' rather than missing, so it fits straight back into an input. */
export type ConferenceDetails = {
	name: string;
	/** Optional. One line shown under the name. */
	tagline: string;
	/** Optional. */
	description: string;
	city: string;
	/** A two-letter country code, such as `NL`. */
	countryCode: string;
	/** `YYYY-MM-DD`, which is what a date input sends. */
	startDate: string;
	endDate: string;
	/** An IANA name such as `Europe/Amsterdam`. */
	timezone: string;
	/** An ISO 4217 code such as `EUR`. */
	currency: string;
	/** A `conference_level` value: `high_school`, `university` or `mixed`. */
	level: string;
	/** Optional. When filled in, it starts with `http://` or `https://` (see `readConferenceDetails`). */
	websiteUrl: string;
};

/** A message for each field that needs fixing. A field that is fine has no entry. */
export type ConferenceDetailsErrors = {
	name?: string;
	tagline?: string;
	city?: string;
	countryCode?: string;
	startDate?: string;
	endDate?: string;
	timezone?: string;
	currency?: string;
	level?: string;
	websiteUrl?: string;
};

/*
 * These three are the database's own defaults for the three columns
 * (`02-architecture/data-model.md`), so the form opens already answering the
 * three questions it insists on rather than refusing an untouched form.
 */
const DEFAULT_TIMEZONE = 'Europe/Amsterdam';
const DEFAULT_CURRENCY = 'EUR';
const DEFAULT_LEVEL = 'mixed';

/** What the form shows before the visitor has typed anything. */
export const EMPTY_CONFERENCE_DETAILS: ConferenceDetails = {
	name: '',
	tagline: '',
	description: '',
	city: '',
	countryCode: '',
	startDate: '',
	endDate: '',
	timezone: DEFAULT_TIMEZONE,
	currency: DEFAULT_CURRENCY,
	level: DEFAULT_LEVEL,
	websiteUrl: ''
};

/** Text that already starts with `http://` or `https://`. The `i` means capitals count too. */
const WEB_PROTOCOL_PREFIX = /^https?:\/\//i;

/** Read one text field from a submitted form, without surrounding spaces. A missing field counts as ''. */
function readText(formData: FormData, fieldName: string): string {
	return String(formData.get(fieldName) ?? '').trim();
}

/**
 * Put `https://` in front of a web address that has neither `http://` nor `https://`
 * yet, so `thimun.org` becomes `https://thimun.org`. Without it, a link to the address
 * would point at a page on our own site. Empty text stays ''.
 *
 * It is exported for the same reason `isWebAddress` and `safeWebAddress` below are: every
 * form in the app that takes a web address has to treat what was typed the same way, or
 * two forms would give different answers to the same text. The organisation details form
 * in `$lib/organizations.ts` is the second one to read it.
 */
export function addHttpsIfMissing(text: string): string {
	if (text === '' || WEB_PROTOCOL_PREFIX.test(text)) {
		return text;
	}

	return `https://${text}`;
}

/** Read step 1's fields from a submitted form, whether they came from visible or hidden inputs. */
export function readConferenceDetails(formData: FormData): ConferenceDetails {
	return {
		name: readText(formData, 'name'),
		tagline: readText(formData, 'tagline'),
		description: readText(formData, 'description'),
		city: readText(formData, 'city'),
		// Codes are stored in capitals, so `nl` from an edited form still works.
		countryCode: readText(formData, 'countryCode').toUpperCase(),
		startDate: readText(formData, 'startDate'),
		endDate: readText(formData, 'endDate'),
		timezone: readText(formData, 'timezone'),
		// Codes are stored in capitals, so `eur` from an edited form still works.
		currency: readText(formData, 'currency').toUpperCase(),
		level: readText(formData, 'level'),
		// People usually type `thimun.org` rather than `https://thimun.org`, so the
		// missing part is added here, before the address is checked or saved.
		websiteUrl: addHttpsIfMissing(readText(formData, 'websiteUrl'))
	};
}

/**
 * The longest web address the forms save: the length the common browsers agree
 * to carry, and the bound the address columns check in the database.
 */
export const WEB_ADDRESS_MAX_LENGTH = 2048;

/**
 * Is this a normal web address, such as `https://thimun.org`? It has to start with
 * `http://` or `https://`, because a `javascript:` "address" would run code when
 * somebody clicks it. The site name also has to contain a dot: `https://thimun` is
 * almost always a typing mistake. It is also no longer than
 * `WEB_ADDRESS_MAX_LENGTH`, so nothing this accepts is refused by the database.
 */
export function isWebAddress(text: string): boolean {
	// `canParse` first: a row read from the database can carry no address at
	// all, and `canParse` answers no to that where `.length` would throw.
	if (!URL.canParse(text) || text.length > WEB_ADDRESS_MAX_LENGTH) {
		return false;
	}

	const { protocol, hostname } = new URL(text);
	const isHttpOrHttps = protocol === 'http:' || protocol === 'https:';

	return isHttpOrHttps && hostname.includes('.');
}

/**
 * Only pass a web address on when it really is one, and answer `null` otherwise.
 *
 * A row added by hand in the Supabase dashboard never went through the form
 * above, and the public pages put these addresses straight into an `href`. This
 * is the guard between the two: the conference page uses it for `website_url`
 * and `instagram_url`, the organisation page for the organisation's own
 * `website_url`. `null` already means "there is no address", so an unusable one
 * becomes the same thing rather than a link somebody can click.
 */
export function safeWebAddress(address: string | null): string | null {
	if (address === null || !isWebAddress(address)) {
		return null;
	}

	return address;
}

/**
 * The characters a phone number is written with: digits, a `+` in front for
 * the country code, and the spaces, dots, dashes and brackets that make a long
 * number readable, as in `+31 (0)6 1234-5678`.
 */
const PHONE_CHARACTERS = /^\+?[\d\s().-]+$/;

/**
 * How many digits a phone number may have, not counting the `+`. The shortest
 * real numbers have six; the international numbering plan allows fifteen.
 */
const PHONE_DIGITS_FEWEST = 6;
const PHONE_DIGITS_MOST = 15;

/** Only the digits of a phone number: `+31 (0)6 1234 5678` becomes `310612345678`. */
function phoneDigits(text: string): string {
	return text.replace(/\D/g, '');
}

/**
 * Is this a phone number as people write one? The rule is loose on purpose:
 * numbers are written differently in every country, and the organiser knows
 * their own. It refuses letters, and a number too short or too long to dial.
 */
export function isPhoneNumber(text: string): boolean {
	const digitCount = phoneDigits(text).length;

	return (
		PHONE_CHARACTERS.test(text) &&
		digitCount >= PHONE_DIGITS_FEWEST &&
		digitCount <= PHONE_DIGITS_MOST
	);
}

/**
 * The address a "call" link points at: `tel:` and the number with only its
 * `+` and digits left, which is what a phone dials. `+31 6 1234 5678` becomes
 * `tel:+31612345678`.
 *
 * `null` when there is no number, and also when a row written by hand holds
 * something that is not one, so the public page shows no link rather than one
 * that cannot be dialled: the same guard `safeWebAddress` is for addresses.
 */
export function phoneLinkAddress(phone: string | null): string | null {
	if (phone === null || !isPhoneNumber(phone)) {
		return null;
	}

	const countryCodeSign = phone.trim().startsWith('+') ? '+' : '';

	return `tel:${countryCodeSign}${phoneDigits(phone)}`;
}

/**
 * How many characters the name and the tagline may have.
 * `05-pages/organiser/create.md` and `05-pages/organiser/details.md`.
 */
const NAME_MAX_LENGTH = 120;
const TAGLINE_MAX_LENGTH = 120;

/**
 * The three `conference_level` values the database accepts. They are taken from
 * the list the form draws its radio buttons from, so a level somebody can pick
 * is always a level this then accepts.
 */
const CONFERENCE_LEVELS = LEVEL_OPTIONS.map((option) => option.value);

/**
 * Check step 1. Every problem is collected instead of stopping at the first one, so
 * the visitor sees all of them at once rather than one per attempt.
 */
export function validateConferenceDetails(details: ConferenceDetails): ConferenceDetailsErrors {
	const errors: ConferenceDetailsErrors = {};

	if (details.name === '') {
		errors.name = 'Please enter the name of the conference.';
	}

	if (details.name.length > NAME_MAX_LENGTH) {
		errors.name = `Please keep the name under ${NAME_MAX_LENGTH} characters.`;
	}

	if (details.tagline.length > TAGLINE_MAX_LENGTH) {
		errors.tagline = `Please keep the tagline under ${TAGLINE_MAX_LENGTH} characters.`;
	}

	if (details.city === '') {
		errors.city = 'Please enter the city where it takes place.';
	}

	if (!isCountryCode(details.countryCode)) {
		errors.countryCode = 'Please pick a country.';
	}

	const hasStartDate = ISO_DATE.test(details.startDate);
	const hasEndDate = ISO_DATE.test(details.endDate);

	if (!hasStartDate) {
		errors.startDate = 'Please enter the first day of the conference.';
	}

	if (!hasEndDate) {
		errors.endDate = 'Please enter the last day of the conference.';
	}

	// `YYYY-MM-DD` dates sort correctly as plain text, so `<` compares them by date.
	if (hasStartDate && hasEndDate && details.endDate < details.startDate) {
		errors.endDate = 'The last day cannot be before the first day.';
	}

	if (!isTimezone(details.timezone)) {
		errors.timezone = 'Please pick a timezone.';
	}

	if (!isCurrencyCode(details.currency)) {
		errors.currency = 'Please pick a currency.';
	}

	if (!CONFERENCE_LEVELS.includes(details.level)) {
		errors.level = 'Please pick who the conference is for.';
	}

	if (details.websiteUrl !== '' && !isWebAddress(details.websiteUrl)) {
		errors.websiteUrl = 'Please enter a web address, such as www.example.org.';
	}

	return errors;
}

/** Did `validateConferenceDetails` find any problem at all? */
export function hasErrors(errors: ConferenceDetailsErrors): boolean {
	return Object.keys(errors).length > 0;
}

/*
 * Everything below belongs to the details editor at `/manage/[slug]/details`,
 * which edits a conference that already exists. It asks for the eleven fields
 * above and for every other editable column, so it reuses the reading and the
 * checking above rather than repeating them.
 */

/**
 * Everything the details editor can change. It is `ConferenceDetails`, which
 * `/create` already asks for — the tagline, the timezone, the currency and the
 * level among them — plus every other editable column of the conference.
 */
export type ConferenceEditValues = ConferenceDetails & {
	venueName: string;
	venueAddress: string;
	language: string;
	/** Empty, or a whole number as it was typed. */
	expectedDelegates: string;
	minAge: string;
	maxAge: string;
	contactEmail: string;
	/** Optional. When filled in, it starts with `http://` or `https://`, like `websiteUrl`. */
	instagramUrl: string;
	/** Optional. A number as people write one, such as `+31 6 1234 5678`. */
	contactPhone: string;
	/** Optional, and each the same kind of address as `instagramUrl`. */
	facebookUrl: string;
	linkedinUrl: string;
	youtubeUrl: string;
	tiktokUrl: string;
};

/** A message for each field of the editor that needs fixing. A field that is fine has no entry. */
export type ConferenceEditErrors = ConferenceDetailsErrors & {
	/** `/create` puts no limit on the description, so only the editor ever refuses one. */
	description?: string;
	venueName?: string;
	venueAddress?: string;
	language?: string;
	expectedDelegates?: string;
	minAge?: string;
	maxAge?: string;
	contactEmail?: string;
	instagramUrl?: string;
	contactPhone?: string;
	facebookUrl?: string;
	linkedinUrl?: string;
	youtubeUrl?: string;
	tiktokUrl?: string;
	/** What is wrong with the picture that was chosen, if one was. */
	banner?: string;
	logo?: string;
};

/** What `validateConferenceEdit` has to be told that the values themselves do not say. */
export type ConferenceEditContext = {
	/** True once the conference has an invoice: the currency may no longer change. */
	isCurrencyLocked: boolean;
	/** The currency the conference is saved with, such as `EUR`. */
	savedCurrency: string;
};

/** How many characters the description may have: long enough for a few paragraphs. */
const DESCRIPTION_MAX_LENGTH = 4000;

/** How many characters the venue's name and its address may each have. */
const VENUE_MAX_LENGTH = 200;

/** How many characters the language may have. It is free text, such as "English and French". */
const LANGUAGE_MAX_LENGTH = 60;

/** The smallest and largest number of delegates a conference may say it expects. */
const EXPECTED_DELEGATES_LOWEST = 1;
const EXPECTED_DELEGATES_HIGHEST = 5000;

/** The youngest and the oldest age a conference may ask its delegates to be. */
const AGE_LOWEST = 10;
const AGE_HIGHEST = 99;

/** Both age fields say this when the age is not one we accept. */
const AGE_MESSAGE = `Please enter an age between ${AGE_LOWEST} and ${AGE_HIGHEST}.`;

/** Digits and nothing else, so `12.5`, `-3` and `1e3` are not whole numbers. */
const WHOLE_NUMBER = /^\d+$/;

/** Read the details editor's fields from a submitted form. */
export function readConferenceEdit(formData: FormData): ConferenceEditValues {
	return {
		// The eleven fields `/create` also asks for are read by the function
		// `/create` uses, so there is one place that knows how to read them.
		...readConferenceDetails(formData),
		venueName: readText(formData, 'venueName'),
		venueAddress: readText(formData, 'venueAddress'),
		language: readText(formData, 'language'),
		expectedDelegates: readText(formData, 'expectedDelegates'),
		minAge: readText(formData, 'minAge'),
		maxAge: readText(formData, 'maxAge'),
		contactEmail: readText(formData, 'contactEmail'),
		// People type `instagram.com/thimun` rather than the whole address, so the
		// missing part is added here, exactly as it is for the website. The other
		// networks are read the same way.
		instagramUrl: addHttpsIfMissing(readText(formData, 'instagramUrl')),
		contactPhone: readText(formData, 'contactPhone'),
		facebookUrl: addHttpsIfMissing(readText(formData, 'facebookUrl')),
		linkedinUrl: addHttpsIfMissing(readText(formData, 'linkedinUrl')),
		youtubeUrl: addHttpsIfMissing(readText(formData, 'youtubeUrl')),
		tiktokUrl: addHttpsIfMissing(readText(formData, 'tiktokUrl'))
	};
}

/** The whole number somebody typed, or `null` for a field holding anything else, including nothing. */
function readWholeNumber(text: string): number | null {
	if (!WHOLE_NUMBER.test(text)) {
		return null;
	}

	return Number(text);
}

/**
 * Is this field empty, or a whole number between `lowest` and `highest`? Empty
 * means "not saying", which every number field in the editor allows.
 */
function isEmptyOrWholeNumberWithin(text: string, lowest: number, highest: number): boolean {
	if (text === '') {
		return true;
	}

	const value = readWholeNumber(text);

	if (value === null) {
		return false;
	}

	return value >= lowest && value <= highest;
}

/** The fields whose only rule is a length. Each one may be left empty. */
function checkTextLengths(values: ConferenceEditValues): ConferenceEditErrors {
	const errors: ConferenceEditErrors = {};

	if (values.description.length > DESCRIPTION_MAX_LENGTH) {
		errors.description = `Please keep the description under ${DESCRIPTION_MAX_LENGTH} characters.`;
	}

	if (values.venueName.length > VENUE_MAX_LENGTH) {
		errors.venueName = `Please keep this under ${VENUE_MAX_LENGTH} characters.`;
	}

	if (values.venueAddress.length > VENUE_MAX_LENGTH) {
		errors.venueAddress = `Please keep this under ${VENUE_MAX_LENGTH} characters.`;
	}

	return errors;
}

/**
 * Is the maximum age below the minimum? Answers the message for the maximum age
 * field, or `null` when there is nothing to say, which includes either field
 * being empty or holding something that is not a number at all.
 */
function checkAgeOrder(minAgeText: string, maxAgeText: string): string | null {
	const minAge = readWholeNumber(minAgeText);
	const maxAge = readWholeNumber(maxAgeText);

	if (minAge === null || maxAge === null) {
		return null;
	}

	if (maxAge < minAge) {
		return 'The maximum age cannot be below the minimum.';
	}

	return null;
}

/** Who the conference is for: the language, its size and the ages. The level is step 1's. */
function checkAudience(values: ConferenceEditValues): ConferenceEditErrors {
	const errors: ConferenceEditErrors = {};

	if (values.language === '' || values.language.length > LANGUAGE_MAX_LENGTH) {
		errors.language = 'Please enter the language of the conference.';
	}

	const hasUsableSize = isEmptyOrWholeNumberWithin(
		values.expectedDelegates,
		EXPECTED_DELEGATES_LOWEST,
		EXPECTED_DELEGATES_HIGHEST
	);

	if (!hasUsableSize) {
		errors.expectedDelegates = `Please enter a number between ${EXPECTED_DELEGATES_LOWEST} and ${EXPECTED_DELEGATES_HIGHEST}.`;
	}

	if (!isEmptyOrWholeNumberWithin(values.minAge, AGE_LOWEST, AGE_HIGHEST)) {
		errors.minAge = AGE_MESSAGE;
	}

	if (!isEmptyOrWholeNumberWithin(values.maxAge, AGE_LOWEST, AGE_HIGHEST)) {
		errors.maxAge = AGE_MESSAGE;
	}

	// The two ages are only compared when both of them are ages we accept.
	// Otherwise the message above already says what to fix, and it is the more
	// useful of the two.
	const hasAgeProblem = errors.minAge !== undefined || errors.maxAge !== undefined;
	const ageOrderMessage = checkAgeOrder(values.minAge, values.maxAge);

	if (!hasAgeProblem && ageOrderMessage !== null) {
		errors.maxAge = ageOrderMessage;
	}

	return errors;
}

/**
 * What is wrong with the currency on a form that may no longer change it, or
 * `null` when there is nothing wrong with it. It is only ever asked about a
 * locked form.
 *
 * The currency is the one field the editor sometimes refuses to change at all:
 * an invoice is written in the conference's currency, so changing it later
 * would silently reprice money somebody has already been asked for.
 *
 * A locked form hides the control, so the field arrives empty and empty means
 * "leave it as it is". A locked form naming a *different* currency did not come
 * from our page, so it is answered rather than saved.
 */
function lockedCurrencyMessage(
	values: ConferenceEditValues,
	context: ConferenceEditContext
): string | null {
	const isUnchanged = values.currency === '' || values.currency === context.savedCurrency;

	if (isUnchanged) {
		return null;
	}

	return 'The currency cannot change once invoices exist.';
}

/**
 * The networks a conference may give an address on. `as const` keeps the five
 * names as they are written, so that `values[field]` below is known to be text
 * and `errors[field]` one of the five messages, rather than any string at all.
 */
const SOCIAL_ADDRESS_FIELDS = [
	'instagramUrl',
	'facebookUrl',
	'linkedinUrl',
	'youtubeUrl',
	'tiktokUrl'
] as const;

/** The ways somebody can reach the conference. Every field may be left empty. */
function checkContact(values: ConferenceEditValues): ConferenceEditErrors {
	const errors: ConferenceEditErrors = {};

	// `validateEmail` also refuses an empty address, because the sign in form has
	// to have one. Here the address is optional, so an empty field never gets there.
	if (values.contactEmail !== '' && validateEmail(values.contactEmail) !== null) {
		errors.contactEmail = 'That does not look like an email address.';
	}

	if (values.contactPhone !== '' && !isPhoneNumber(values.contactPhone)) {
		errors.contactPhone = 'Please enter a phone number, such as +31 6 1234 5678.';
	}

	// One rule for all five networks, so that a sixth is one more name above.
	for (const field of SOCIAL_ADDRESS_FIELDS) {
		if (values[field] !== '' && !isWebAddress(values[field])) {
			errors[field] = 'Please enter a web address, such as www.example.org.';
		}
	}

	return errors;
}

/**
 * Check the details editor. Every problem is collected instead of stopping at the
 * first one, so the organiser sees all of them at once rather than one per attempt.
 *
 * Each helper answers only the fields it found something wrong with, which is why
 * spreading them into one object keeps every message. The eleven fields `/create`
 * also asks for are checked by the function `/create` itself uses, so the two
 * pages never disagree about the same field.
 */
export function validateConferenceEdit(
	values: ConferenceEditValues,
	context: ConferenceEditContext
): ConferenceEditErrors {
	const errors: ConferenceEditErrors = {
		...validateConferenceDetails(values),
		...checkTextLengths(values),
		...checkAudience(values),
		...checkContact(values)
	};

	// A locked form sends an empty currency field, which step 1's checking above
	// has already called a problem. It is not one here — empty means "leave it as
	// it is" — so a locked form decides its own currency, and its answer replaces
	// the one above.
	if (context.isCurrencyLocked) {
		const lockedMessage = lockedCurrencyMessage(values, context);

		if (lockedMessage === null) {
			delete errors.currency;
		} else {
			errors.currency = lockedMessage;
		}
	}

	return errors;
}

/** The largest picture the `public-media` bucket takes, in megabytes. `02-architecture/storage.md`. */
export const CONFERENCE_IMAGE_MAX_SIZE_MB = 5;

/** That same limit in bytes, which is the unit a file measures itself in. */
const CONFERENCE_IMAGE_MAX_SIZE_BYTES = CONFERENCE_IMAGE_MAX_SIZE_MB * 1024 * 1024;

/** The three picture types that bucket accepts, one per entry. */
const CONFERENCE_IMAGE_TYPE_LIST = ['image/jpeg', 'image/png', 'image/webp'];

/** The same three types, written the way the HTML `accept` attribute wants them. */
export const CONFERENCE_IMAGE_ACCEPTED_TYPES = CONFERENCE_IMAGE_TYPE_LIST.join(',');

/**
 * What is wrong with a picture somebody chose for the logo or the banner, or
 * `null` when there is nothing wrong with it.
 *
 * It is given the two facts it needs rather than a whole `File`, so that a test
 * can describe a six megabyte photograph without building one. The type is
 * looked at before the size, so that a six megabyte PDF is told it is the wrong
 * kind of file rather than too big a one.
 *
 * Both pictures are optional, and an empty file box still posts a file: one of
 * no size, whose type is not one of the three. The caller therefore only asks
 * about a file somebody really chose; everything this answers is a real problem.
 */
export function validateConferenceImage(file: { type: string; size: number }): string | null {
	if (!CONFERENCE_IMAGE_TYPE_LIST.includes(file.type)) {
		return 'Please upload a JPEG, PNG or WebP image.';
	}

	if (file.size > CONFERENCE_IMAGE_MAX_SIZE_BYTES) {
		return `The image must be under ${CONFERENCE_IMAGE_MAX_SIZE_MB} MB.`;
	}

	return null;
}

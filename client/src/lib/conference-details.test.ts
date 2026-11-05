import { describe, expect, it } from 'vitest';
import {
	addHttpsIfMissing,
	CONFERENCE_IMAGE_ACCEPTED_TYPES,
	EMPTY_CONFERENCE_DETAILS,
	hasErrors,
	readConferenceDetails,
	readConferenceEdit,
	safeWebAddress,
	validateConferenceDetails,
	validateConferenceEdit,
	validateConferenceImage,
	type ConferenceDetails,
	type ConferenceEditContext,
	type ConferenceEditValues,
	isPhoneNumber,
	phoneLinkAddress
} from './conference-details';

// This file covers `safeWebAddress`, the guard the public pages put between the
// database and an `href`; then step 1 of "create a conference"; and then the
// details editor at `/manage/[slug]/details`, which inherits step 1's fields.

describe('safeWebAddress', () => {
	it('passes an ordinary https address through unchanged', () => {
		expect(safeWebAddress('https://thimun.org')).toBe('https://thimun.org');
	});

	it('passes a plain http address through as well', () => {
		expect(safeWebAddress('http://thimun.org')).toBe('http://thimun.org');
	});

	// `URL` lower-cases the scheme before it is looked at, so capitals pass. The
	// address columns in the database match the scheme case-insensitively for
	// the same reason: what this says yes to, the save must not refuse.
	it('passes an address whose scheme is in capitals, as the database does', () => {
		expect(safeWebAddress('HTTPS://thimun.org')).toBe('HTTPS://thimun.org');
	});

	it('answers null when there is no address at all', () => {
		expect(safeWebAddress(null)).toBeNull();
	});

	it('refuses a javascript: address, which would run code when somebody clicks it', () => {
		expect(safeWebAddress('javascript:alert(1)')).toBeNull();
	});

	it('refuses a mailto: address, because these links are for websites', () => {
		expect(safeWebAddress('mailto:hello@thimun.org')).toBeNull();
	});

	it('refuses a bare word, which is a typing mistake rather than an address', () => {
		expect(safeWebAddress('thimun')).toBeNull();
	});

	it('refuses an address longer than the database column allows, and takes one right at the bound', () => {
		const start = 'https://thimun.org/';
		const atTheBound = start + 'a'.repeat(2048 - start.length);

		expect(safeWebAddress(atTheBound)).toBe(atTheBound);
		expect(safeWebAddress(atTheBound + 'a')).toBeNull();
	});

	it('refuses empty text', () => {
		expect(safeWebAddress('')).toBeNull();
	});
});

// The next two blocks cover step 1 of `/create`, which the details editor below
// inherits its first eleven fields from.

/** Text of a given length, for the tests about fields that are too long. */
function textOfLength(length: number): string {
	return 'a'.repeat(length);
}

/** A step 1 form somebody could really have sent, so a test can change one field of it. */
function detailsForm(changes: Record<string, string> = {}): FormData {
	const fields: Record<string, string> = {
		name: 'The Hague International MUN',
		tagline: 'Five days of debate',
		description: 'Five days of debate in the World Forum.',
		city: 'The Hague',
		countryCode: 'nl',
		startDate: '2027-01-24',
		endDate: '2027-01-29',
		timezone: 'Europe/Amsterdam',
		currency: 'eur',
		level: 'high_school',
		websiteUrl: 'thimun.org',
		...changes
	};

	const formData = new FormData();

	for (const fieldName of Object.keys(fields)) {
		formData.set(fieldName, fields[fieldName]);
	}

	return formData;
}

/**
 * Step 1 as the empty form starts out, with the fields that have no default of
 * their own filled in. Everything here passes, so a test can break one of them.
 */
function detailsValues(changes: Partial<ConferenceDetails> = {}): ConferenceDetails {
	const valid: ConferenceDetails = {
		...EMPTY_CONFERENCE_DETAILS,
		name: 'The Hague International MUN',
		city: 'The Hague',
		countryCode: 'NL',
		startDate: '2027-01-24',
		endDate: '2027-01-29'
	};

	return { ...valid, ...changes };
}

describe('readConferenceDetails', () => {
	it('reads the four fields step 1 gained, alongside the ones it already had', () => {
		const details = readConferenceDetails(detailsForm());

		expect(details.tagline).toBe('Five days of debate');
		expect(details.timezone).toBe('Europe/Amsterdam');
		expect(details.currency).toBe('EUR');
		expect(details.level).toBe('high_school');
	});

	it('reads the currency in capitals, so `eur` from an edited form still works', () => {
		expect(readConferenceDetails(detailsForm({ currency: 'eur' })).currency).toBe('EUR');
	});

	it('reads a field the form did not send at all as empty', () => {
		const formData = detailsForm();
		formData.delete('tagline');

		expect(readConferenceDetails(formData).tagline).toBe('');
	});

	// `EMPTY_CONFERENCE_DETAILS` starts the form off with a timezone, a currency
	// and a level, but reading is not where those defaults are put back: a form
	// that sent no timezone sent no timezone, and the checking below says so.
	it('does not fill a default back in for a field the form left out', () => {
		const formData = detailsForm();
		formData.delete('timezone');
		formData.delete('currency');
		formData.delete('level');

		const details = readConferenceDetails(formData);

		expect(details.timezone).toBe('');
		expect(details.currency).toBe('');
		expect(details.level).toBe('');
	});
});

describe('validateConferenceDetails', () => {
	// The timezone, the currency and the level here come straight from
	// `EMPTY_CONFERENCE_DETAILS`. Finding nothing wrong with them is the proof that
	// the three defaults the form opens with are answers this checking accepts.
	it('accepts the empty form once the fields without a default are filled in', () => {
		expect(validateConferenceDetails(detailsValues())).toEqual({});
	});

	it('asks for a name, and refuses one over 120 characters', () => {
		const missing = validateConferenceDetails(detailsValues({ name: '' }));
		const tooLong = validateConferenceDetails(detailsValues({ name: textOfLength(121) }));
		const longEnough = validateConferenceDetails(detailsValues({ name: textOfLength(120) }));

		expect(missing.name).toBe('Please enter the name of the conference.');
		expect(tooLong.name).toBe('Please keep the name under 120 characters.');
		expect(longEnough.name).toBeUndefined();
	});

	it('refuses a tagline over 120 characters, and accepts an empty one', () => {
		const tooLong = validateConferenceDetails(detailsValues({ tagline: textOfLength(121) }));
		const longEnough = validateConferenceDetails(detailsValues({ tagline: textOfLength(120) }));
		const empty = validateConferenceDetails(detailsValues({ tagline: '' }));

		expect(tooLong.tagline).toBe('Please keep the tagline under 120 characters.');
		expect(longEnough.tagline).toBeUndefined();
		expect(empty.tagline).toBeUndefined();
	});

	it('asks for a timezone we offer', () => {
		const unknown = validateConferenceDetails(detailsValues({ timezone: 'Antarctica/Troll' }));
		const empty = validateConferenceDetails(detailsValues({ timezone: '' }));
		const offered = validateConferenceDetails(detailsValues({ timezone: 'UTC' }));

		expect(unknown.timezone).toBe('Please pick a timezone.');
		expect(empty.timezone).toBe('Please pick a timezone.');
		expect(offered.timezone).toBeUndefined();
	});

	it('asks for a currency we offer', () => {
		const unknown = validateConferenceDetails(detailsValues({ currency: 'XYZ' }));
		const empty = validateConferenceDetails(detailsValues({ currency: '' }));
		const offered = validateConferenceDetails(detailsValues({ currency: 'GBP' }));

		expect(unknown.currency).toBe('Please pick a currency.');
		expect(empty.currency).toBe('Please pick a currency.');
		expect(offered.currency).toBeUndefined();
	});

	it('asks who the conference is for, and takes any of the three answers', () => {
		const madeUp = validateConferenceDetails(detailsValues({ level: 'primary_school' }));
		const empty = validateConferenceDetails(detailsValues({ level: '' }));

		expect(madeUp.level).toBe('Please pick who the conference is for.');
		expect(empty.level).toBe('Please pick who the conference is for.');

		for (const level of ['high_school', 'university', 'mixed']) {
			expect(validateConferenceDetails(detailsValues({ level })).level).toBeUndefined();
		}
	});
});

// The rest of this file covers the details editor at `/manage/[slug]/details`,
// which edits a conference that already exists.

/** A form the editor could really have sent, so a test can change one field of it. */
function editForm(changes: Record<string, string> = {}): FormData {
	const fields: Record<string, string> = {
		name: 'The Hague International MUN',
		description: 'Five days of debate in the World Forum.',
		city: 'The Hague',
		countryCode: 'nl',
		startDate: '2027-01-24',
		endDate: '2027-01-29',
		websiteUrl: 'thimun.org',
		tagline: 'Five days of debate',
		venueName: 'World Forum',
		venueAddress: 'Churchillplein 10',
		timezone: 'Europe/Amsterdam',
		level: 'high_school',
		language: 'English',
		expectedDelegates: '3200',
		minAge: '15',
		maxAge: '19',
		currency: 'eur',
		contactEmail: 'hello@thimun.org',
		instagramUrl: 'instagram.com/thimun',
		contactPhone: '+31 70 123 4567',
		facebookUrl: 'facebook.com/thimun',
		linkedinUrl: 'linkedin.com/company/thimun',
		youtubeUrl: 'youtube.com/@thimun',
		tiktokUrl: 'tiktok.com/@thimun',
		...changes
	};

	const formData = new FormData();

	for (const fieldName of Object.keys(fields)) {
		formData.set(fieldName, fields[fieldName]);
	}

	return formData;
}

/** The same conference as values that pass every check, so a test can break one of them. */
function editValues(changes: Partial<ConferenceEditValues> = {}): ConferenceEditValues {
	const valid: ConferenceEditValues = {
		name: 'The Hague International MUN',
		description: 'Five days of debate in the World Forum.',
		city: 'The Hague',
		countryCode: 'NL',
		startDate: '2027-01-24',
		endDate: '2027-01-29',
		websiteUrl: 'https://thimun.org',
		tagline: 'Five days of debate',
		venueName: 'World Forum',
		venueAddress: 'Churchillplein 10',
		timezone: 'Europe/Amsterdam',
		level: 'high_school',
		language: 'English',
		expectedDelegates: '3200',
		minAge: '15',
		maxAge: '19',
		currency: 'EUR',
		contactEmail: 'hello@thimun.org',
		instagramUrl: 'https://instagram.com/thimun',
		contactPhone: '+31 70 123 4567',
		facebookUrl: 'https://facebook.com/thimun',
		linkedinUrl: 'https://linkedin.com/company/thimun',
		youtubeUrl: 'https://youtube.com/@thimun',
		tiktokUrl: 'https://tiktok.com/@thimun'
	};

	return { ...valid, ...changes };
}

/** No invoice exists yet, so the currency can still be changed. */
const OPEN_CURRENCY: ConferenceEditContext = { isCurrencyLocked: false, savedCurrency: 'EUR' };

/** An invoice exists, so the conference is stuck with the euros it was priced in. */
const LOCKED_CURRENCY: ConferenceEditContext = { isCurrencyLocked: true, savedCurrency: 'EUR' };

describe('readConferenceEdit', () => {
	it('reads every field of the editor, including the eleven `/create` also asks for', () => {
		expect(readConferenceEdit(editForm())).toEqual({
			name: 'The Hague International MUN',
			description: 'Five days of debate in the World Forum.',
			city: 'The Hague',
			countryCode: 'NL',
			startDate: '2027-01-24',
			endDate: '2027-01-29',
			websiteUrl: 'https://thimun.org',
			tagline: 'Five days of debate',
			venueName: 'World Forum',
			venueAddress: 'Churchillplein 10',
			timezone: 'Europe/Amsterdam',
			level: 'high_school',
			language: 'English',
			expectedDelegates: '3200',
			minAge: '15',
			maxAge: '19',
			currency: 'EUR',
			contactEmail: 'hello@thimun.org',
			instagramUrl: 'https://instagram.com/thimun',
			contactPhone: '+31 70 123 4567',
			facebookUrl: 'https://facebook.com/thimun',
			linkedinUrl: 'https://linkedin.com/company/thimun',
			youtubeUrl: 'https://youtube.com/@thimun',
			tiktokUrl: 'https://tiktok.com/@thimun'
		});
	});

	it('leaves an Instagram address that already says `https://` alone', () => {
		const values = readConferenceEdit(editForm({ instagramUrl: 'https://instagram.com/thimun' }));

		expect(values.instagramUrl).toBe('https://instagram.com/thimun');
	});

	it('leaves an empty Instagram field empty rather than making an address of it', () => {
		expect(readConferenceEdit(editForm({ instagramUrl: '' })).instagramUrl).toBe('');
	});

	it('treats the other networks the way it treats Instagram', () => {
		const values = readConferenceEdit(
			editForm({
				facebookUrl: 'facebook.com/thimun',
				linkedinUrl: '',
				youtubeUrl: 'https://youtube.com/@thimun'
			})
		);

		expect(values.facebookUrl).toBe('https://facebook.com/thimun');
		expect(values.linkedinUrl).toBe('');
		expect(values.youtubeUrl).toBe('https://youtube.com/@thimun');
	});

	it('keeps a phone number as it was typed, apart from the spaces around it', () => {
		expect(
			readConferenceEdit(editForm({ contactPhone: ' +31 (0)70 123-4567 ' })).contactPhone
		).toBe('+31 (0)70 123-4567');
	});

	it('drops the spaces somebody typed around a field', () => {
		expect(readConferenceEdit(editForm({ venueName: '  World Forum  ' })).venueName).toBe(
			'World Forum'
		);
	});

	it('reads a field the form did not send at all as empty', () => {
		const formData = editForm();
		formData.delete('tagline');

		expect(readConferenceEdit(formData).tagline).toBe('');
	});
});

describe('validateConferenceEdit', () => {
	it('accepts a conference with every field filled in properly', () => {
		expect(validateConferenceEdit(editValues(), OPEN_CURRENCY)).toEqual({});
	});

	it('still asks for the fields `/create` asks for, in the same words', () => {
		const errors = validateConferenceEdit(editValues({ city: '', countryCode: '' }), OPEN_CURRENCY);

		expect(errors.city).toBe('Please enter the city where it takes place.');
		expect(errors.countryCode).toBe('Please pick a country.');
	});

	it('refuses a name over 120 characters, and accepts one of exactly 120', () => {
		const tooLong = validateConferenceEdit(editValues({ name: textOfLength(121) }), OPEN_CURRENCY);
		const longEnough = validateConferenceEdit(
			editValues({ name: textOfLength(120) }),
			OPEN_CURRENCY
		);

		expect(tooLong.name).toBe('Please keep the name under 120 characters.');
		expect(longEnough.name).toBeUndefined();
	});

	it('refuses a tagline over 120 characters, and accepts an empty one', () => {
		const tooLong = validateConferenceEdit(
			editValues({ tagline: textOfLength(121) }),
			OPEN_CURRENCY
		);
		const empty = validateConferenceEdit(editValues({ tagline: '' }), OPEN_CURRENCY);

		expect(tooLong.tagline).toBe('Please keep the tagline under 120 characters.');
		expect(empty.tagline).toBeUndefined();
	});

	it('refuses a description over 4000 characters, and accepts an empty one', () => {
		const tooLong = validateConferenceEdit(
			editValues({ description: textOfLength(4001) }),
			OPEN_CURRENCY
		);
		const empty = validateConferenceEdit(editValues({ description: '' }), OPEN_CURRENCY);

		expect(tooLong.description).toBe('Please keep the description under 4000 characters.');
		expect(empty.description).toBeUndefined();
	});

	it('refuses a venue name or address over 200 characters, and accepts empty ones', () => {
		const tooLong = validateConferenceEdit(
			editValues({ venueName: textOfLength(201), venueAddress: textOfLength(201) }),
			OPEN_CURRENCY
		);
		const empty = validateConferenceEdit(
			editValues({ venueName: '', venueAddress: '' }),
			OPEN_CURRENCY
		);

		expect(tooLong.venueName).toBe('Please keep this under 200 characters.');
		expect(tooLong.venueAddress).toBe('Please keep this under 200 characters.');
		expect(empty.venueName).toBeUndefined();
		expect(empty.venueAddress).toBeUndefined();
	});

	it('asks for a timezone we offer', () => {
		const unknown = validateConferenceEdit(
			editValues({ timezone: 'Antarctica/Troll' }),
			OPEN_CURRENCY
		);
		const empty = validateConferenceEdit(editValues({ timezone: '' }), OPEN_CURRENCY);
		const offered = validateConferenceEdit(editValues({ timezone: 'UTC' }), OPEN_CURRENCY);

		expect(unknown.timezone).toBe('Please pick a timezone.');
		expect(empty.timezone).toBe('Please pick a timezone.');
		expect(offered.timezone).toBeUndefined();
	});

	it('asks who the conference is for, and takes any of the three answers', () => {
		const madeUp = validateConferenceEdit(editValues({ level: 'primary_school' }), OPEN_CURRENCY);

		expect(madeUp.level).toBe('Please pick who the conference is for.');

		for (const level of ['high_school', 'university', 'mixed']) {
			expect(validateConferenceEdit(editValues({ level }), OPEN_CURRENCY).level).toBeUndefined();
		}
	});

	it('asks for a language, and refuses one over 60 characters', () => {
		const empty = validateConferenceEdit(editValues({ language: '' }), OPEN_CURRENCY);
		const tooLong = validateConferenceEdit(
			editValues({ language: textOfLength(61) }),
			OPEN_CURRENCY
		);
		const fine = validateConferenceEdit(
			editValues({ language: 'English and French' }),
			OPEN_CURRENCY
		);

		expect(empty.language).toBe('Please enter the language of the conference.');
		expect(tooLong.language).toBe('Please enter the language of the conference.');
		expect(fine.language).toBeUndefined();
	});

	it('takes an expected size between 1 and 5000, or none at all', () => {
		const acceptable = ['', '1', '5000', '200'];

		for (const expectedDelegates of acceptable) {
			const errors = validateConferenceEdit(editValues({ expectedDelegates }), OPEN_CURRENCY);

			expect(errors.expectedDelegates).toBeUndefined();
		}

		const refused = ['0', '5001', '12.5', 'lots', '-4'];

		for (const expectedDelegates of refused) {
			const errors = validateConferenceEdit(editValues({ expectedDelegates }), OPEN_CURRENCY);

			expect(errors.expectedDelegates).toBe('Please enter a number between 1 and 5000.');
		}
	});

	it('takes an age between 10 and 99, or none at all', () => {
		const empty = validateConferenceEdit(editValues({ minAge: '', maxAge: '' }), OPEN_CURRENCY);

		expect(empty.minAge).toBeUndefined();
		expect(empty.maxAge).toBeUndefined();

		const tooYoung = validateConferenceEdit(
			editValues({ minAge: '9', maxAge: '100' }),
			OPEN_CURRENCY
		);

		expect(tooYoung.minAge).toBe('Please enter an age between 10 and 99.');
		expect(tooYoung.maxAge).toBe('Please enter an age between 10 and 99.');
	});

	it('refuses a maximum age below the minimum, and allows the two to be equal', () => {
		const wrongWayRound = validateConferenceEdit(
			editValues({ minAge: '18', maxAge: '16' }),
			OPEN_CURRENCY
		);
		const equal = validateConferenceEdit(editValues({ minAge: '18', maxAge: '18' }), OPEN_CURRENCY);

		expect(wrongWayRound.maxAge).toBe('The maximum age cannot be below the minimum.');
		expect(equal.maxAge).toBeUndefined();
	});

	it('says an age is out of range before it says the two are the wrong way round', () => {
		const errors = validateConferenceEdit(editValues({ minAge: '18', maxAge: '5' }), OPEN_CURRENCY);

		expect(errors.maxAge).toBe('Please enter an age between 10 and 99.');
	});

	it('asks for a currency we know while the conference has no invoice', () => {
		const madeUp = validateConferenceEdit(editValues({ currency: 'XYZ' }), OPEN_CURRENCY);
		const empty = validateConferenceEdit(editValues({ currency: '' }), OPEN_CURRENCY);
		const known = validateConferenceEdit(editValues({ currency: 'GBP' }), OPEN_CURRENCY);

		expect(madeUp.currency).toBe('Please pick a currency.');
		expect(empty.currency).toBe('Please pick a currency.');
		expect(known.currency).toBeUndefined();
	});

	it('refuses to change the currency once an invoice exists', () => {
		const changed = validateConferenceEdit(editValues({ currency: 'USD' }), LOCKED_CURRENCY);

		expect(changed.currency).toBe('The currency cannot change once invoices exist.');
	});

	it('lets a locked form leave the currency out or send the saved one back', () => {
		const leftOut = validateConferenceEdit(editValues({ currency: '' }), LOCKED_CURRENCY);
		const sentBack = validateConferenceEdit(editValues({ currency: 'EUR' }), LOCKED_CURRENCY);

		expect(leftOut.currency).toBeUndefined();
		expect(sentBack.currency).toBeUndefined();
	});

	it('takes a contact address that looks like one, or none at all', () => {
		const empty = validateConferenceEdit(editValues({ contactEmail: '' }), OPEN_CURRENCY);
		const nonsense = validateConferenceEdit(editValues({ contactEmail: 'hello' }), OPEN_CURRENCY);

		expect(empty.contactEmail).toBeUndefined();
		expect(nonsense.contactEmail).toBe('That does not look like an email address.');
	});

	it('takes an Instagram address that is a web address, or none at all', () => {
		const empty = validateConferenceEdit(editValues({ instagramUrl: '' }), OPEN_CURRENCY);
		const nonsense = validateConferenceEdit(
			editValues({ instagramUrl: 'https://instagram' }),
			OPEN_CURRENCY
		);

		expect(empty.instagramUrl).toBeUndefined();
		expect(nonsense.instagramUrl).toBe('Please enter a web address, such as www.example.org.');
	});

	it('checks the other networks by the same rule as Instagram', () => {
		const errors = validateConferenceEdit(
			editValues({
				facebookUrl: '',
				linkedinUrl: 'https://linkedin',
				youtubeUrl: 'https://youtube.com/@thimun',
				tiktokUrl: 'https://tiktok'
			}),
			OPEN_CURRENCY
		);

		expect(errors.facebookUrl).toBeUndefined();
		expect(errors.linkedinUrl).toBe('Please enter a web address, such as www.example.org.');
		expect(errors.youtubeUrl).toBeUndefined();
		expect(errors.tiktokUrl).toBe('Please enter a web address, such as www.example.org.');
	});

	it('takes a phone number as people write one, or none at all', () => {
		const empty = validateConferenceEdit(editValues({ contactPhone: '' }), OPEN_CURRENCY);
		const written = validateConferenceEdit(
			editValues({ contactPhone: '+31 (0)70 123-4567' }),
			OPEN_CURRENCY
		);
		const words = validateConferenceEdit(
			editValues({ contactPhone: 'ring the office' }),
			OPEN_CURRENCY
		);

		expect(empty.contactPhone).toBeUndefined();
		expect(written.contactPhone).toBeUndefined();
		expect(words.contactPhone).toBe('Please enter a phone number, such as +31 6 1234 5678.');
	});

	it('collects every problem at once rather than one attempt per problem', () => {
		const errors = validateConferenceEdit(
			editValues({
				name: '',
				city: '',
				tagline: textOfLength(121),
				timezone: '',
				level: '',
				language: '',
				expectedDelegates: '9000',
				minAge: '18',
				maxAge: '16',
				currency: '',
				contactEmail: 'hello',
				instagramUrl: 'instagram',
				contactPhone: 'ring the office',
				youtubeUrl: 'youtube'
			}),
			OPEN_CURRENCY
		);

		expect(Object.keys(errors).sort()).toEqual([
			'city',
			'contactEmail',
			'contactPhone',
			'currency',
			'expectedDelegates',
			'instagramUrl',
			'language',
			'level',
			'maxAge',
			'name',
			'tagline',
			'timezone',
			'youtubeUrl'
		]);
	});

	it('is answered by `hasErrors`, the same way the create form is', () => {
		expect(hasErrors(validateConferenceEdit(editValues(), OPEN_CURRENCY))).toBe(false);
		expect(hasErrors(validateConferenceEdit(editValues({ level: '' }), OPEN_CURRENCY))).toBe(true);
	});
});

describe('isPhoneNumber', () => {
	it('takes a number however a country writes it', () => {
		expect(isPhoneNumber('+31 6 1234 5678')).toBe(true);
		expect(isPhoneNumber('070-1234567')).toBe(true);
		expect(isPhoneNumber('(020) 7946 0958')).toBe(true);
		expect(isPhoneNumber('+1.212.555.0100')).toBe(true);
	});

	it('refuses words, a `+` anywhere but the front, and a number too short or too long to dial', () => {
		expect(isPhoneNumber('ring the office')).toBe(false);
		expect(isPhoneNumber('06 12 34 56 78 (ask for Sam)')).toBe(false);
		expect(isPhoneNumber('06+12345678')).toBe(false);
		expect(isPhoneNumber('12345')).toBe(false);
		expect(isPhoneNumber('+31 1234 5678 9012 3456')).toBe(false);
	});
});

describe('phoneLinkAddress', () => {
	it('keeps only the `+` and the digits, which is what a phone dials', () => {
		expect(phoneLinkAddress('+31 (0)6 1234-5678')).toBe('tel:+310612345678');
		expect(phoneLinkAddress('070 123 4567')).toBe('tel:0701234567');
	});

	it('answers null for no number, and for a row that holds something else', () => {
		expect(phoneLinkAddress(null)).toBeNull();
		expect(phoneLinkAddress('ring the office')).toBeNull();
	});
});

describe('validateConferenceImage', () => {
	it('accepts each of the three types the bucket takes', () => {
		expect(validateConferenceImage({ type: 'image/jpeg', size: 200_000 })).toBeNull();
		expect(validateConferenceImage({ type: 'image/png', size: 200_000 })).toBeNull();
		expect(validateConferenceImage({ type: 'image/webp', size: 200_000 })).toBeNull();
	});

	it('refuses a file that is not one of those three', () => {
		expect(validateConferenceImage({ type: 'application/pdf', size: 200_000 })).toBe(
			'Please upload a JPEG, PNG or WebP image.'
		);
	});

	it('refuses a picture over five megabytes, and takes one of exactly five', () => {
		expect(validateConferenceImage({ type: 'image/jpeg', size: 6 * 1024 * 1024 })).toBe(
			'The image must be under 5 MB.'
		);
		expect(validateConferenceImage({ type: 'image/jpeg', size: 5 * 1024 * 1024 })).toBeNull();
	});

	it('tells a six megabyte PDF it is the wrong kind of file, not too big a one', () => {
		expect(validateConferenceImage({ type: 'application/pdf', size: 6 * 1024 * 1024 })).toBe(
			'Please upload a JPEG, PNG or WebP image.'
		);
	});

	it('lists the three types for the file box to accept', () => {
		expect(CONFERENCE_IMAGE_ACCEPTED_TYPES).toBe('image/jpeg,image/png,image/webp');
	});
});

describe('addHttpsIfMissing', () => {
	// People type `thimun.org`, and without the protocol the browser reads a link
	// to it as a page on our own site. Every form in the app that takes a web
	// address reads it through this, so two forms cannot disagree about the same
	// typed text; `readOrganizationDetails` in `$lib/organizations.ts` is the
	// second caller.
	it('puts https in front of a bare site name', () => {
		expect(addHttpsIfMissing('thimun.org')).toBe('https://thimun.org');
	});

	it('leaves an address that already says https alone', () => {
		expect(addHttpsIfMissing('https://thimun.org')).toBe('https://thimun.org');
	});

	it('leaves a plain http address alone rather than upgrading it', () => {
		expect(addHttpsIfMissing('http://thimun.org')).toBe('http://thimun.org');
	});

	it('does not care how the protocol is capitalised', () => {
		expect(addHttpsIfMissing('HTTPS://thimun.org')).toBe('HTTPS://thimun.org');
	});

	// An empty box means "no website", not "https:// and nothing after it".
	it('leaves empty text empty', () => {
		expect(addHttpsIfMissing('')).toBe('');
	});
});

import { describe, expect, it } from 'vitest';
import {
	basicsPatch,
	basicsPreview,
	imageCaption,
	instagramAddress,
	isDraftOwnImage,
	readBasics,
	validateBasics,
	type BasicsValues
} from './creation-basics';

/** A filled-in Basics form, as `readBasics` gives it. */
const VALUES: BasicsValues = {
	name: 'Delft MUN 2027',
	tagline: 'Three days of debate',
	description: 'Our sixth edition.',
	contactEmail: 'board@delftmun.nl',
	websiteUrl: 'https://delftmun.nl',
	instagramUrl: 'https://www.instagram.com/delftmun'
};

function formWith(fields: Record<string, string>): FormData {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	return formData;
}

describe('instagramAddress', () => {
	it('turns an @account into the address of that account', () => {
		expect(instagramAddress('@delft.mun')).toBe('https://www.instagram.com/delft.mun');
	});

	it('treats anything else as a web address', () => {
		expect(instagramAddress('instagram.com/delftmun')).toBe('https://instagram.com/delftmun');
		expect(instagramAddress('')).toBe('');
	});
});

describe('readBasics', () => {
	it('reads every field, trimmed, with addresses made whole', () => {
		const values = readBasics(
			formWith({
				name: '  Delft MUN 2027 ',
				tagline: 'Three days of debate',
				description: 'Our sixth edition.',
				contactEmail: 'board@delftmun.nl',
				websiteUrl: 'delftmun.nl',
				instagramUrl: '@delftmun'
			})
		);

		expect(values).toEqual(VALUES);
	});

	it('reads a missing field as empty', () => {
		expect(readBasics(new FormData()).tagline).toBe('');
	});
});

describe('validateBasics', () => {
	it('finds nothing wrong with a good form', () => {
		expect(validateBasics(VALUES, { isNameRequired: true })).toEqual({});
	});

	it('asks for a name only when moving on', () => {
		const nameless = { ...VALUES, name: '' };

		expect(validateBasics(nameless, { isNameRequired: false }).name).toBeUndefined();
		expect(validateBasics(nameless, { isNameRequired: true }).name).toBe(
			'Please give the conference a name.'
		);
	});

	it('refuses text that is too long', () => {
		const errors = validateBasics(
			{
				...VALUES,
				name: 'x'.repeat(121),
				tagline: 'x'.repeat(121),
				description: 'x'.repeat(4001)
			},
			{ isNameRequired: false }
		);

		expect(Object.keys(errors).sort()).toEqual(['description', 'name', 'tagline']);
	});

	it('refuses a broken email address and broken web addresses', () => {
		const errors = validateBasics(
			{
				...VALUES,
				contactEmail: 'board@',
				websiteUrl: 'https://not a site',
				instagramUrl: 'https://'
			},
			{ isNameRequired: false }
		);

		expect(errors.contactEmail).toBe('That does not look like an email address.');
		expect(errors.websiteUrl).toBeDefined();
		expect(errors.instagramUrl).toBeDefined();
	});
});

describe('basicsPatch', () => {
	it('saves every good field, and empty text as nothing', () => {
		expect(basicsPatch({ ...VALUES, tagline: '' }, {})).toEqual({
			name: 'Delft MUN 2027',
			tagline: null,
			description: 'Our sixth edition.',
			contactEmail: 'board@delftmun.nl',
			websiteUrl: 'https://delftmun.nl',
			instagramUrl: 'https://www.instagram.com/delftmun'
		});
	});

	it('leaves out an empty name and every field with an error', () => {
		const patch = basicsPatch(
			{ ...VALUES, name: '' },
			{ contactEmail: 'That does not look like an email address.' }
		);

		expect(patch).not.toHaveProperty('name');
		expect(patch).not.toHaveProperty('contactEmail');
		expect(patch.tagline).toBe('Three days of debate');
	});
});

describe('imageCaption', () => {
	it('says where a picture came from', () => {
		const path = 'conferences/draft-1/logo.png';

		expect(imageCaption('logo', path, 'organization', 'TU Delft')).toBe('Using TU Delft branding');
		expect(imageCaption('banner', path, 'previous_conference', 'TU Delft')).toBe(
			'Based on last conference'
		);
		expect(imageCaption('logo', path, 'user', 'TU Delft')).toBe('Conference logo');
		expect(imageCaption('banner', path, undefined, 'TU Delft')).toBe('Conference banner');
	});

	it('says nothing without a picture', () => {
		expect(imageCaption('logo', null, 'organization', 'TU Delft')).toBe('');
	});
});

describe('isDraftOwnImage', () => {
	it('knows a picture in the draft’s own folder', () => {
		expect(isDraftOwnImage('conferences/draft-1/banner.jpg', 'draft-1')).toBe(true);
		expect(isDraftOwnImage('conferences/conf-1/banner.jpg', 'draft-1')).toBe(false);
		expect(isDraftOwnImage(null, 'draft-1')).toBe(false);
	});
});

describe('basicsPreview', () => {
	it('keeps the dates, the place and the audience, in their order', () => {
		const preview = basicsPreview({
			name: 'Delft MUN 2027',
			tagline: null,
			bannerPath: null,
			organizedBy: 'Delft MUN',
			description: null,
			facts: [
				{ kind: 'dates', text: '16 – 18 Apr 2027' },
				{ kind: 'place', text: 'Delft, Netherlands' },
				{ kind: 'venue', text: 'Venue to be announced' },
				{ kind: 'level', text: 'University delegates' },
				{ kind: 'timezone', text: 'Europe/Amsterdam' }
			]
		});

		expect(preview.facts.map((fact) => fact.kind)).toEqual(['dates', 'place', 'level']);
		expect(preview.name).toBe('Delft MUN 2027');
	});
});

import { describe, expect, it } from 'vitest';
import {
	bannerImageUrl,
	defaultShareImageUrl,
	flagUrl,
	logoImageUrl,
	COMMITTEE_EMBLEM_IMAGE_PATH,
	LOGO_IMAGE_PATH,
	LOGO_MARK_IMAGE_PATH,
	publicMediaUrl,
	SAMPLE_BANNER_IMAGE_PATH,
	SAMPLE_LOGO_IMAGE_PATH
} from '$lib/media';

describe('publicMediaUrl', () => {
	it('puts the path inside the public-media bucket of the Supabase project', () => {
		const url = publicMediaUrl('avatars/7f3c/a1b2.jpg');

		expect(url).toContain('/storage/v1/object/public/public-media/avatars/7f3c/a1b2.jpg');
	});

	it('starts with the address of the Supabase project', () => {
		expect(publicMediaUrl('logo.png')).toMatch(/^https?:\/\//);
	});
});

describe('flagUrl', () => {
	it('asks flagcdn for the code in lower case', () => {
		expect(flagUrl('NL')).toBe('https://flagcdn.com/w40/nl.png');
	});

	it('asks for a wider picture for the larger size', () => {
		expect(flagUrl('DE', 'md')).toBe('https://flagcdn.com/w80/de.png');
	});

	it("asks for flagcdn's w320 for the projector's flag", () => {
		expect(flagUrl('KE', 'xl')).toBe('https://flagcdn.com/w320/ke.png');
	});
});

describe('defaultShareImageUrl', () => {
	it('builds a whole address from the origin it is given', () => {
		expect(defaultShareImageUrl('https://munmeet.app')).toBe('https://munmeet.app/og-default.jpg');
	});

	it('works in development, where the origin carries a port', () => {
		expect(defaultShareImageUrl('http://localhost:5173')).toBe(
			'http://localhost:5173/og-default.jpg'
		);
	});

	it('does not double the slash when the origin ends in one', () => {
		expect(defaultShareImageUrl('https://munmeet.app/')).toBe('https://munmeet.app/og-default.jpg');
	});
});

describe('LOGO_IMAGE_PATH', () => {
	it('is the file in static/, used as an address on its own', () => {
		expect(LOGO_IMAGE_PATH).toBe('/logo-full.webp');
	});
});

describe('LOGO_MARK_IMAGE_PATH', () => {
	it('is the file in static/, used as an address on its own', () => {
		expect(LOGO_MARK_IMAGE_PATH).toBe('/logo-small.webp');
	});
});

describe('COMMITTEE_EMBLEM_IMAGE_PATH', () => {
	it('is the file in static/, used as an address on its own', () => {
		expect(COMMITTEE_EMBLEM_IMAGE_PATH).toBe('/committee-emblem.svg');
	});
});

describe('bannerImageUrl and logoImageUrl', () => {
	it('point at the uploaded picture in the public-media bucket', () => {
		expect(bannerImageUrl('conferences/1/banner.webp')).toContain(
			'/storage/v1/object/public/public-media/conferences/1/banner.webp'
		);
		expect(logoImageUrl('conferences/1/logo.png')).toContain(
			'/storage/v1/object/public/public-media/conferences/1/logo.png'
		);
	});

	it('fall back to the sample pictures we ship while there is none', () => {
		expect(bannerImageUrl(null)).toBe(SAMPLE_BANNER_IMAGE_PATH);
		expect(logoImageUrl(null)).toBe(SAMPLE_LOGO_IMAGE_PATH);
		expect(SAMPLE_BANNER_IMAGE_PATH).toMatch(/^\/.+\.svg$/);
		expect(SAMPLE_LOGO_IMAGE_PATH).toMatch(/^\/.+\.svg$/);
	});
});

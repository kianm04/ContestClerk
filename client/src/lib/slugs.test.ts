import { describe, expect, it } from 'vitest';
import { makeUniqueSlug, slugify } from './slugs';

describe('slugify', () => {
	it('lowercases the name and joins words with hyphens', () => {
		expect(slugify('THIMUN The Hague 2027')).toBe('thimun-the-hague-2027');
	});

	it('drops accents so the slug only has plain letters', () => {
		expect(slugify('Zürich Modèle ONU')).toBe('zurich-modele-onu');
	});

	it('trims hyphens from both ends', () => {
		expect(slugify('  --Hello!  ')).toBe('hello');
	});

	it('returns an empty string when nothing usable is left', () => {
		expect(slugify('!!!')).toBe('');
	});
});

describe('makeUniqueSlug', () => {
	it('appends a six character random suffix', () => {
		expect(makeUniqueSlug('Paris MUN')).toMatch(/^paris-mun-[0-9a-f]{6}$/);
	});

	it('falls back to "untitled" when the name has no usable characters', () => {
		expect(makeUniqueSlug('???')).toMatch(/^untitled-[0-9a-f]{6}$/);
	});
});

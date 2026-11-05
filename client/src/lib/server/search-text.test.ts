import { describe, expect, it } from 'vitest';
import { MAX_SEARCH_WORDS, toSafeSearchText, toSafeSearchWords } from './search-text';

// These tests are about one thing: what a visitor types can never become part
// of the filter it is searched with. `listConferences` and `listApplications`
// both drop the answer straight into a Supabase `.or(...)`, which is filter
// language and not a value, so anything left in here that has a meaning there
// would change the query rather than be looked for by it.

describe('toSafeSearchText', () => {
	it('keeps ordinary words, in any language, with their accents', () => {
		expect(toSafeSearchText('Kowalski')).toBe('Kowalski');
		expect(toSafeSearchText('Lycée Français')).toBe('Lycée Français');
		expect(toSafeSearchText('Ürgüp')).toBe('Ürgüp');
	});

	it('keeps the apostrophe and the hyphen that real school names have in them', () => {
		expect(toSafeSearchText("St Mary's College")).toBe("St Mary's College");
		expect(toSafeSearchText('Anne-Marie')).toBe('Anne-Marie');
	});

	it('turns the characters that would change the filter into spaces', () => {
		// A comma separates one condition from the next in `.or(...)`, and a full
		// stop separates a column from its operator, so `name.eq.x` typed into the
		// box would otherwise be a condition of its own.
		expect(toSafeSearchText('name.eq.x,status.eq.draft')).toBe('name eq x status eq draft');
		expect(toSafeSearchText('(a):"b"')).toBe('a b');
	});

	it('turns the wildcards into spaces, so a search for % is a search and not everything', () => {
		expect(toSafeSearchText('100%')).toBe('100');
		expect(toSafeSearchText('a_b*c')).toBe('a b c');
	});

	it('leaves one space between words and none at the ends', () => {
		expect(toSafeSearchText('  Anna   Kowalski  ')).toBe('Anna Kowalski');
	});

	it('answers with nothing at all when there was nothing safe in it', () => {
		// Every caller reads '' as "no search at all" and leaves the filter off the
		// query, rather than searching for an empty string.
		expect(toSafeSearchText('%%%')).toBe('');
		expect(toSafeSearchText('   ')).toBe('');
	});
});

describe('toSafeSearchWords', () => {
	it('splits a conference name typed with its brackets into its words', () => {
		// The directory matches each of these on its own (T164), so the brackets a
		// card shows no longer stop the name finding its conference.
		expect(toSafeSearchWords('Northbridge MUN (applications open)')).toEqual([
			'Northbridge',
			'MUN',
			'applications',
			'open'
		]);
	});

	it('keeps an apostrophe or a hyphen inside the word it belongs to', () => {
		expect(toSafeSearchWords("St Mary's Anne-Marie")).toEqual(['St', "Mary's", 'Anne-Marie']);
	});

	it('leaves nothing in a word that would change the filter', () => {
		expect(toSafeSearchWords('name.eq.x,status.eq.draft')).toEqual([
			'name',
			'eq',
			'x',
			'status',
			'eq',
			'draft'
		]);
	});

	it('answers with no words at all when there was nothing safe in it', () => {
		expect(toSafeSearchWords('%%%')).toEqual([]);
		expect(toSafeSearchWords('')).toEqual([]);
	});

	it('keeps only the first few words of a very long search', () => {
		// Each word is one more condition in the request's address, so a pasted
		// paragraph must not grow it without end.
		const manyWords = Array.from({ length: 50 }, (_, index) => `word${index}`).join(' ');

		const words = toSafeSearchWords(manyWords);

		expect(words).toHaveLength(MAX_SEARCH_WORDS);
		expect(words[0]).toBe('word0');
	});
});

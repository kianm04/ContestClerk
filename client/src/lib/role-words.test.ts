import { describe, expect, it } from 'vitest';
import {
	countedRoleName,
	pluralRoleName,
	roleNameInSentence,
	roleNameWithArticle
} from './role-words';

describe('roleNameInSentence', () => {
	it('lowers the first letter of an ordinary name', () => {
		expect(roleNameInSentence('Chair')).toBe('chair');
		expect(roleNameInSentence('Organiser')).toBe('organiser');
		expect(roleNameInSentence('Registration desk')).toBe('registration desk');
	});

	it('leaves an abbreviation alone', () => {
		// "uSG delegate affairs" would be a mistake: the capitals are the name.
		expect(roleNameInSentence('USG delegate affairs')).toBe('USG delegate affairs');
		expect(roleNameInSentence('IT')).toBe('IT');
	});

	it('copes with a one-letter name and an empty one', () => {
		expect(roleNameInSentence('X')).toBe('X');
		expect(roleNameInSentence('')).toBe('');
	});
});

describe('roleNameWithArticle', () => {
	it('picks "a" or "an" by the first letter', () => {
		expect(roleNameWithArticle('Chair')).toBe('a chair');
		expect(roleNameWithArticle('Organiser')).toBe('an organiser');
		expect(roleNameWithArticle('Volunteer')).toBe('a volunteer');
		expect(roleNameWithArticle('Assistant')).toBe('an assistant');
	});

	it('picks the article for an abbreviation by how its first letter is said', () => {
		// "you-ess-gee", "em-pee", "ess-gee".
		expect(roleNameWithArticle('USG delegate affairs')).toBe('a USG delegate affairs');
		expect(roleNameWithArticle('MP')).toBe('an MP');
		expect(roleNameWithArticle('SG office')).toBe('an SG office');
	});
});

describe('pluralRoleName', () => {
	it('adds an s', () => {
		expect(pluralRoleName('Chair')).toBe('Chairs');
		expect(pluralRoleName('volunteer')).toBe('volunteers');
	});

	it('leaves a name that already ends in s alone', () => {
		expect(pluralRoleName('Press')).toBe('Press');
		expect(pluralRoleName('USG delegate affairs')).toBe('USG delegate affairs');
	});
});

describe('countedRoleName', () => {
	it('writes one of something without an s and several with', () => {
		expect(countedRoleName(1, 'Chair')).toBe('1 chair');
		expect(countedRoleName(3, 'Chair')).toBe('3 chairs');
		expect(countedRoleName(0, 'Volunteer')).toBe('0 volunteers');
	});

	it('bends the name the way a sentence reads it', () => {
		expect(countedRoleName(2, 'Press')).toBe('2 press');
		expect(countedRoleName(2, 'USG delegate affairs')).toBe('2 USG delegate affairs');
	});
});

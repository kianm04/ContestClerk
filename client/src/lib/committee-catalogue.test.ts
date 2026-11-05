import { describe, expect, it } from 'vitest';
import {
	COMMITTEE_CATALOGUE,
	QUICK_TEMPLATES,
	catalogueLabel,
	findCatalogueCommittee,
	searchCatalogue
} from './committee-catalogue';

describe('COMMITTEE_CATALOGUE', () => {
	it('has no duplicate abbreviations', () => {
		const abbreviations = COMMITTEE_CATALOGUE.map((committee) =>
			committee.abbreviation.toLowerCase()
		);

		expect(new Set(abbreviations).size).toBe(abbreviations.length);
	});

	it('gives every committee at least two topics, a description and a usable speaking time', () => {
		for (const committee of COMMITTEE_CATALOGUE) {
			expect(committee.topics.length, committee.abbreviation).toBeGreaterThanOrEqual(2);
			expect(committee.description.trim(), committee.abbreviation).not.toBe('');
			expect([60, 90, 120], committee.abbreviation).toContain(committee.defaultSpeakingTimeSeconds);
		}
	});

	it('has an entry for every quick template', () => {
		for (const abbreviation of QUICK_TEMPLATES) {
			expect(findCatalogueCommittee(abbreviation), abbreviation).not.toBeNull();
		}
	});
});

describe('searchCatalogue', () => {
	it('puts the Security Council first for "United Nations S" and finds other United Nations bodies', () => {
		const results = searchCatalogue('United Nations S').map((committee) => committee.abbreviation);

		expect(results[0]).toBe('UNSC');
		expect(results).toContain('UNESCO');
	});

	it('puts an exact abbreviation first, whatever the case', () => {
		expect(searchCatalogue('who')[0].abbreviation).toBe('WHO');
		expect(searchCatalogue('who').map((committee) => committee.abbreviation)).toContain('WHO EB');
	});

	it('finds a committee through its aliases', () => {
		expect(searchCatalogue('security').map((committee) => committee.abbreviation)).toContain(
			'UNSC'
		);
		expect(searchCatalogue('ga1')[0].abbreviation).toBe('DISEC');
		expect(searchCatalogue('arab league')[0].abbreviation).toBe('LAS');
	});

	it('ignores accents', () => {
		expect(searchCatalogue('Organisátion')[0].abbreviation).toBe('WHO');
	});

	it('falls back to a match inside a word', () => {
		expect(searchCatalogue('ights').map((committee) => committee.abbreviation)).toContain('UNHRC');
	});

	it('returns nothing for an empty or one-character query', () => {
		expect(searchCatalogue('')).toEqual([]);
		expect(searchCatalogue('x')).toEqual([]);
		expect(searchCatalogue('  ')).toEqual([]);
	});

	it('returns at most six by default and respects a given limit', () => {
		expect(searchCatalogue('united nations').length).toBe(6);
		expect(searchCatalogue('united nations', 2).length).toBe(2);
	});
});

describe('findCatalogueCommittee', () => {
	it('finds a committee by abbreviation in any case', () => {
		expect(findCatalogueCommittee('unsc')?.name).toBe('United Nations Security Council');
		expect(findCatalogueCommittee('UNSC')?.abbreviation).toBe('UNSC');
	});

	it('returns null for an unknown abbreviation', () => {
		expect(findCatalogueCommittee('XYZ')).toBeNull();
	});
});

describe('catalogueLabel', () => {
	it('puts the abbreviation in brackets after the name', () => {
		const securityCouncil = findCatalogueCommittee('UNSC');

		expect(securityCouncil).not.toBeNull();
		expect(catalogueLabel(securityCouncil!)).toBe('United Nations Security Council (UNSC)');
	});
});

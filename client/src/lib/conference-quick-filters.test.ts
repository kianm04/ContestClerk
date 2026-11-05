import { describe, expect, it } from 'vitest';
import { EMPTY_CONFERENCE_QUERY, type ConferenceQuery } from '$lib/conferences';
import { quickFilterChips } from '$lib/conference-quick-filters';

/** The empty query with a few fields changed, so each test only writes what it is about. */
function queryAsking(changes: Partial<ConferenceQuery> = {}): ConferenceQuery {
	return { ...EMPTY_CONFERENCE_QUERY, ...changes };
}

/** The chip with this key, from the row or from behind "More". */
function chipFor(query: ConferenceQuery, key: string) {
	const { inRow, inMore } = quickFilterChips(query);
	const chip = [...inRow, ...inMore].find((candidate) => candidate.key === key);

	if (!chip) throw new Error(`No chip called ${key}`);

	return chip;
}

describe('quickFilterChips', () => {
	it('draws the mockup row and keeps the rest behind "More"', () => {
		const { inRow, inMore } = quickFilterChips(queryAsking());

		expect(inRow.map((chip) => chip.label)).toEqual([
			'All',
			'High school',
			'University',
			'Europe',
			'Asia',
			'North America'
		]);
		expect(inMore.map((chip) => chip.label)).toEqual([
			'High school and university',
			'South America',
			'Africa',
			'Oceania'
		]);
	});

	it('marks "All" as the active chip when no level or region is chosen', () => {
		expect(chipFor(queryAsking(), 'all').isActive).toBe(true);
		expect(chipFor(queryAsking({ level: 'university' }), 'all').isActive).toBe(false);
		expect(chipFor(queryAsking({ regions: ['asia'] }), 'all').isActive).toBe(false);
	});

	it('chooses a level, and chooses it away again when it is already on', () => {
		expect(chipFor(queryAsking(), 'university').href).toBe('/conferences?level=university');

		const chosen = chipFor(queryAsking({ level: 'university' }), 'university');
		expect(chosen.isActive).toBe(true);
		expect(chosen.href).toBe('/conferences');
	});

	it('adds a region to those chosen, and takes it away again', () => {
		const added = chipFor(queryAsking({ regions: ['europe'] }), 'asia');
		expect(added.isActive).toBe(false);
		expect(added.href).toBe('/conferences?region=europe&region=asia');

		const removed = chipFor(queryAsking({ regions: ['europe', 'asia'] }), 'europe');
		expect(removed.isActive).toBe(true);
		expect(removed.href).toBe('/conferences?region=asia');
	});

	it('keeps the other filters and goes back to the first page', () => {
		const query = queryAsking({ q: 'model', openOnly: true, level: 'mixed', page: 3 });

		expect(chipFor(query, 'all').href).toBe('/conferences?q=model&open=1');
		expect(chipFor(query, 'oceania').href).toBe(
			'/conferences?q=model&region=oceania&level=mixed&open=1'
		);
	});
});

import { describe, expect, it } from 'vitest';
import type { ManagedCommittee } from '$lib/committees';
import { chairText, committeeCode, committeeRows } from './dashboard-committees';

/** The Human Rights Council in Room 1: three of four seats filled, two papers in. */
const HRC: ManagedCommittee = {
	id: 'hrc-id',
	slug: 'hrc',
	name: 'Human Rights Council',
	abbreviation: 'HRC',
	description: null,
	topics: [],
	level: 'intermediate',
	room: 'Room 1',
	position: 0,
	defaultSpeakingTimeSeconds: 60,
	seatCounts: { available: 4, filled: 3, reserved: 0, total: 4 },
	chairNames: ['Samuel Osei'],
	hasBackgroundGuide: true,
	positionPaperCount: 2
};

describe('committeeCode', () => {
	it('joins the short name and the room, whichever exist', () => {
		expect(committeeCode(HRC)).toBe('HRC · Room 1');
		expect(committeeCode({ abbreviation: null, room: 'Room 1' })).toBe('Room 1');
		expect(committeeCode({ abbreviation: 'HRC', room: null })).toBe('HRC');
		expect(committeeCode({ abbreviation: null, room: null })).toBeNull();
	});
});

describe('chairText', () => {
	it('names every chair, or says there is none yet', () => {
		expect(chairText(['Samuel Osei', 'Ana Lima'])).toBe('Samuel Osei, Ana Lima');
		expect(chairText([])).toBe('No chair yet');
	});
});

describe('committeeRows', () => {
	it('writes the seats, the papers and the chair', () => {
		expect(committeeRows([HRC], true)).toEqual([
			{
				id: 'hrc-id',
				slug: 'hrc',
				name: 'Human Rights Council',
				code: 'HRC · Room 1',
				seats: '3 of 4',
				papers: '2 of 3',
				chair: 'Samuel Osei',
				listTitle: 'HRC · Human Rights Council',
				listDetail: '3 of 4 seats filled · 2 of 3 papers in · Samuel Osei'
			}
		]);
	});

	it('leaves the papers out of the list when none are asked for, and says when nobody chairs', () => {
		const unchaired = { ...HRC, abbreviation: null, chairNames: [] };

		expect(committeeRows([unchaired], false)[0]).toMatchObject({
			listTitle: 'Human Rights Council',
			listDetail: '3 of 4 seats filled · no chair'
		});
	});
});

import { describe, expect, it } from 'vitest';
import type { RoomSeat } from './committee-room';
import {
	firstChoosableIndex,
	movedHighlight,
	noMatchText,
	queueSeatOptions,
	raisedByOptions,
	searchSeats,
	seatMatches,
	whoOptions,
	type ListedEntry,
	type SeatOption
} from './seat-search';

/** A seat for the tests, with a delegate unless one is left out. */
function seat(
	id: string,
	name: string,
	countryCode: string | null,
	delegateName?: string
): RoomSeat {
	return { id, name, countryCode, delegateName: delegateName ?? null };
}

const FRANCE = seat('fr', 'France', 'FR', 'Camille Martin');
const UNITED_KINGDOM = seat('gb', 'United Kingdom', 'GB', 'Oliver Smith');
const UNITED_STATES = seat('us', 'United States', 'US');
const IVORY_COAST = seat('ci', "Côte d'Ivoire", 'CI');
const GUINEA_BISSAU = seat('gw', 'Guinea-Bissau', 'GW');
const KENYA = seat('ke', 'Kenya', 'KE', 'Amina Otieno');

/** In a scrambled order, so the tests see the sorting. */
const SEATS = [UNITED_STATES, KENYA, FRANCE, IVORY_COAST, UNITED_KINGDOM, GUINEA_BISSAU];

/** The labels of some options, for comparing at a glance. */
function labels(options: SeatOption[]): string[] {
	return options.map((option) => option.label);
}

describe('seatMatches', () => {
	it('matches the start of the name or of any word of it', () => {
		expect(seatMatches(UNITED_KINGDOM, 'unit')).toBe(true);
		expect(seatMatches(UNITED_KINGDOM, 'king')).toBe(true);
		expect(seatMatches(UNITED_KINGDOM, 'united k')).toBe(true);
		expect(seatMatches(GUINEA_BISSAU, 'bissau')).toBe(true);
		expect(seatMatches(UNITED_KINGDOM, 'ngdom')).toBe(false);
	});

	it('matches the country code exactly, not its start', () => {
		expect(seatMatches(UNITED_KINGDOM, 'gb')).toBe(true);
		expect(seatMatches(UNITED_KINGDOM, 'g')).toBe(false);
		expect(seatMatches(seat('x', 'Secretariat', null), 'gb')).toBe(false);
	});

	it("matches any part of the delegate's name", () => {
		expect(seatMatches(KENYA, 'otie')).toBe(true);
		expect(seatMatches(UNITED_STATES, 'otie')).toBe(false);
	});

	it('ignores capitals, accents and the spaces around the text', () => {
		expect(seatMatches(IVORY_COAST, '  COTE ')).toBe(true);
		expect(seatMatches(IVORY_COAST, 'ivoire')).toBe(true);
	});

	it('matches every seat while the box is empty', () => {
		expect(seatMatches(FRANCE, '')).toBe(true);
		expect(seatMatches(FRANCE, '   ')).toBe(true);
	});
});

describe('searchSeats', () => {
	it('lists the matching seats in alphabetical order', () => {
		expect(searchSeats(SEATS, 'united').map((match) => match.name)).toEqual([
			'United Kingdom',
			'United States'
		]);
		expect(searchSeats(SEATS, '').map((match) => match.id)).toEqual([
			'ci',
			'fr',
			'gw',
			'ke',
			'gb',
			'us'
		]);
	});

	it('leaves the seats it was given in their order', () => {
		searchSeats(SEATS, '');

		expect(SEATS[0]).toBe(UNITED_STATES);
	});
});

describe('queueSeatOptions', () => {
	const entries: ListedEntry[] = [
		{ status: 'speaking', seat: { id: 'ke' } },
		{ status: 'waiting', seat: { id: 'fr' } },
		{ status: 'spoken', seat: { id: 'gb' } },
		{ status: 'removed', seat: { id: 'us' } },
		{ status: 'waiting', seat: null }
	];

	it('marks the speaker "speaking" and a waiting seat "in list", neither choosable', () => {
		const options = queueSeatOptions(SEATS, '', { entries, attendance: {} });
		const kenya = options.find((option) => option.value === 'ke');
		const france = options.find((option) => option.value === 'fr');

		expect(kenya).toMatchObject({ mark: 'speaking', isChoosable: false });
		expect(france).toMatchObject({ mark: 'in list', isChoosable: false });
	});

	it('lets a seat that has spoken or was removed be added again, with no mark', () => {
		const options = queueSeatOptions(SEATS, 'united', { entries, attendance: {} });

		expect(options).toEqual([
			{
				kind: 'seat',
				seat: UNITED_KINGDOM,
				label: 'United Kingdom',
				value: 'gb',
				mark: null,
				isChoosable: true,
				marksPresent: false
			},
			{
				kind: 'seat',
				seat: UNITED_STATES,
				label: 'United States',
				value: 'us',
				mark: null,
				isChoosable: true,
				marksPresent: false
			}
		]);
	});

	it('offers an absent seat as "absent · Mark present", which marks it present as it adds it', () => {
		const options = queueSeatOptions(SEATS, 'guinea', { entries, attendance: { gw: 'absent' } });

		expect(options[0]).toMatchObject({
			mark: 'absent · Mark present',
			isChoosable: true,
			marksPresent: true
		});
	});

	it('keeps "in list" for a waiting seat that is also absent', () => {
		const options = queueSeatOptions(SEATS, 'france', { entries, attendance: { fr: 'absent' } });

		expect(options[0]).toMatchObject({ mark: 'in list', isChoosable: false });
	});

	it('says "gets the floor" in the Mod view while nobody speaks', () => {
		const waitingOnly: ListedEntry[] = [{ status: 'waiting', seat: { id: 'fr' } }];
		const options = queueSeatOptions(SEATS, '', {
			entries: waitingOnly,
			attendance: { gw: 'absent' },
			givesTheFloor: true
		});
		const marks = options.map((option) => option.mark);

		expect(labels(options)).toEqual([
			"Côte d'Ivoire",
			'France',
			'Guinea-Bissau',
			'Kenya',
			'United Kingdom',
			'United States'
		]);
		expect(marks).toEqual([
			'gets the floor',
			'in list',
			'absent · Mark present',
			'gets the floor',
			'gets the floor',
			'gets the floor'
		]);
	});
});

describe('raisedByOptions', () => {
	it('offers "The chair" first, then the seats, an absent one not choosable', () => {
		const options = raisedByOptions([KENYA, FRANCE], { ke: 'absent' }, '');

		expect(labels(options)).toEqual(['The chair', 'France', 'Kenya']);
		expect(options[0]).toMatchObject({ kind: 'chair', value: 'chair', isChoosable: true });
		expect(options[2]).toMatchObject({ mark: 'absent', isChoosable: false, marksPresent: false });
	});

	it('keeps "The chair" while the text could be it', () => {
		expect(labels(raisedByOptions(SEATS, {}, 'cha'))).toEqual(['The chair']);
		expect(labels(raisedByOptions(SEATS, {}, 'the'))).toEqual(['The chair']);
		expect(labels(raisedByOptions(SEATS, {}, 'fra'))).toEqual(['France']);
	});

	it('keeps "The chair" when its whole words are typed, in any case', () => {
		expect(labels(raisedByOptions(SEATS, {}, 'The chair'))).toEqual(['The chair']);
		expect(labels(raisedByOptions(SEATS, {}, 'the ch'))).toEqual(['The chair']);
		expect(labels(raisedByOptions(SEATS, {}, 'the chairs'))).toEqual([]);
	});
});

describe('whoOptions', () => {
	it('offers the typed text as a name after the seats', () => {
		const options = whoOptions(SEATS, {}, ' Secretary-General ');

		expect(options).toEqual([
			{
				kind: 'name',
				seat: null,
				label: 'Use “Secretary-General”',
				value: 'Secretary-General',
				mark: 'a name, not a seat',
				isChoosable: true,
				marksPresent: false
			}
		]);
	});

	it('lists the matching seats first, an absent one not choosable', () => {
		const options = whoOptions(SEATS, { ke: 'absent' }, 'ke');

		expect(labels(options)).toEqual(['Kenya', 'Use “ke”']);
		expect(options[0]).toMatchObject({ mark: 'absent', isChoosable: false });
	});

	it('offers no typed name while the box is empty or names a seat exactly', () => {
		expect(labels(whoOptions([FRANCE], {}, ''))).toEqual(['France']);
		expect(labels(whoOptions([FRANCE], {}, 'FRANCE'))).toEqual(['France']);
	});
});

describe('firstChoosableIndex and movedHighlight', () => {
	const entries: ListedEntry[] = [{ status: 'waiting', seat: { id: 'fr' } }];
	// Côte d'Ivoire, France (in list), Kenya.
	const options = queueSeatOptions([KENYA, FRANCE, IVORY_COAST], '', { entries, attendance: {} });

	it('highlights the first option that can be chosen', () => {
		const franceFirst = queueSeatOptions([FRANCE, KENYA], '', { entries, attendance: {} });

		expect(firstChoosableIndex(options)).toBe(0);
		expect(firstChoosableIndex(franceFirst)).toBe(1);
	});

	it('is -1 when nothing can be chosen', () => {
		const onlyFrance = queueSeatOptions([FRANCE], '', { entries, attendance: {} });

		expect(firstChoosableIndex(onlyFrance)).toBe(-1);
		expect(movedHighlight(onlyFrance, 0, 1)).toBe(-1);
		expect(movedHighlight([], -1, 1)).toBe(-1);
	});

	it('passes over an option that cannot be chosen, both ways', () => {
		expect(movedHighlight(options, 0, 1)).toBe(2);
		expect(movedHighlight(options, 2, -1)).toBe(0);
	});

	it('goes round from the last option to the first and back', () => {
		expect(movedHighlight(options, 2, 1)).toBe(0);
		expect(movedHighlight(options, 0, -1)).toBe(2);
	});

	it('starts at the first option with ↓ and the last with ↑ when nothing is highlighted', () => {
		expect(movedHighlight(options, -1, 1)).toBe(0);
		expect(movedHighlight(options, -1, -1)).toBe(2);
	});
});

describe('noMatchText', () => {
	it('quotes what was typed', () => {
		expect(noMatchText(' xyz ')).toBe('No seat matches “xyz”');
	});
});

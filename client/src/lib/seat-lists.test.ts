import { describe, expect, it } from 'vitest';
import { isCountryCode } from './countries';
import {
	countryCodeForName,
	EU_MEMBER_STATES,
	isSeatListName,
	parseSeatNames,
	PASTED_SEAT_LIMIT,
	SECURITY_COUNCIL_MEMBERS,
	standardSeats,
	UN_MEMBER_STATES
} from './seat-lists';

/** The three lists, so the checks every list has to pass are written once. */
const ALL_LISTS = [
	{ listName: 'UN_MEMBER_STATES', codes: UN_MEMBER_STATES, size: 193 },
	{ listName: 'SECURITY_COUNCIL_MEMBERS', codes: SECURITY_COUNCIL_MEMBERS, size: 15 },
	{ listName: 'EU_MEMBER_STATES', codes: EU_MEMBER_STATES, size: 27 }
];

describe('the ready-made lists', () => {
	for (const { listName, codes, size } of ALL_LISTS) {
		it(`${listName} holds ${size} countries`, () => {
			expect(codes).toHaveLength(size);
		});

		it(`${listName} names no country twice`, () => {
			expect(new Set(codes).size).toBe(codes.length);
		});

		// A code `$lib/countries.ts` does not know would become a seat named after
		// the code itself, such as a seat called "XX", and its flag would be missing.
		it(`${listName} holds only codes countries.ts knows`, () => {
			const unknown = codes.filter((code) => !isCountryCode(code));

			expect(unknown).toEqual([]);
		});
	}

	it('leaves the observers out of the UN member states', () => {
		// Palestine and the Holy See sit in the Assembly without a vote, so they
		// are not members and an organiser adds them by hand when they want them.
		expect(UN_MEMBER_STATES).not.toContain('PS');
		expect(UN_MEMBER_STATES).not.toContain('VA');
	});

	it('holds the five permanent members of the Security Council', () => {
		for (const code of ['CN', 'FR', 'RU', 'GB', 'US']) {
			expect(SECURITY_COUNCIL_MEMBERS).toContain(code);
		}
	});

	it('gives every Security Council member a seat in the General Assembly too', () => {
		const outsideTheUn = SECURITY_COUNCIL_MEMBERS.filter(
			(code) => !UN_MEMBER_STATES.includes(code)
		);

		expect(outsideTheUn).toEqual([]);
	});
});

describe('isSeatListName', () => {
	it('knows the three lists the buttons ask for', () => {
		expect(isSeatListName('un_members')).toBe(true);
		expect(isSeatListName('security_council')).toBe(true);
		expect(isSeatListName('eu_members')).toBe(true);
	});

	it('refuses a word that is not one of them', () => {
		expect(isSeatListName('nato')).toBe(false);
	});

	it('refuses empty text, which is what a form with no list picked sends', () => {
		expect(isSeatListName('')).toBe(false);
	});

	it('refuses "list", which is the paste box rather than a ready-made list', () => {
		expect(isSeatListName('list')).toBe(false);
	});
});

describe('standardSeats', () => {
	it('makes one seat per country of the list', () => {
		expect(standardSeats('eu_members')).toHaveLength(EU_MEMBER_STATES.length);
	});

	it('gives each seat the country name and the code the flag needs', () => {
		const seats = standardSeats('security_council');
		const france = seats.find((seat) => seat.countryCode === 'FR');

		expect(france).toEqual({ name: 'France', countryCode: 'FR' });
	});

	it('keeps the order the list holds', () => {
		const firstSeat = standardSeats('security_council')[0];

		expect(firstSeat.countryCode).toBe(SECURITY_COUNCIL_MEMBERS[0]);
	});

	it('makes all 193 seats for the General Assembly', () => {
		const seats = standardSeats('un_members');
		const germany = seats.find((seat) => seat.countryCode === 'DE');

		expect(seats).toHaveLength(193);
		expect(germany?.name).toBe('Germany');
	});
});

describe('countryCodeForName', () => {
	it('finds the code for a country name', () => {
		expect(countryCodeForName('France')).toBe('FR');
	});

	it('ignores the capitals and the spaces somebody pasted with the name', () => {
		expect(countryCodeForName('  fRaNcE  ')).toBe('FR');
	});

	it('answers null for a name that is not a country at all', () => {
		expect(countryCodeForName('Minister of Defence')).toBeNull();
	});

	it('answers null for a nickname, since only the real name is recognised', () => {
		// "Holland" is part of the Netherlands and "USA" is not a country name, so
		// both become an `other` seat rather than a country seat with a wrong flag.
		expect(countryCodeForName('Holland')).toBeNull();
		expect(countryCodeForName('USA')).toBeNull();
	});

	it('answers null for an empty name', () => {
		expect(countryCodeForName('')).toBeNull();
	});

	it('finds the code again for every name a ready-made list makes', () => {
		const seats = standardSeats('un_members');
		const wrong = seats.filter((seat) => countryCodeForName(seat.name) !== seat.countryCode);

		expect(wrong).toEqual([]);
	});
});

describe('PASTED_SEAT_LIMIT', () => {
	it('is the 300 seats one paste may add at a time', () => {
		expect(PASTED_SEAT_LIMIT).toBe(300);
	});
});

describe('parseSeatNames', () => {
	it('reads one seat name per line', () => {
		expect(parseSeatNames('France\nChina\nBrazil')).toEqual(['France', 'China', 'Brazil']);
	});

	it('drops the spaces around each name', () => {
		expect(parseSeatNames('  France  \n\tChina')).toEqual(['France', 'China']);
	});

	it('drops the empty lines, including the one a trailing newline leaves', () => {
		expect(parseSeatNames('France\n\n\nChina\n')).toEqual(['France', 'China']);
	});

	it('reads nothing out of an empty box', () => {
		expect(parseSeatNames('')).toEqual([]);
	});

	it('copes with the line endings a Windows machine pastes', () => {
		expect(parseSeatNames('France\r\nChina')).toEqual(['France', 'China']);
	});

	it('keeps a repeated name only the first time', () => {
		expect(parseSeatNames('France\nChina\nFrance')).toEqual(['France', 'China']);
	});

	it('treats two spellings that differ only in capitals as the same seat', () => {
		expect(parseSeatNames('France\nFRANCE\nfrance')).toEqual(['France']);
	});

	it('keeps a name that is not a country, such as a character in a crisis committee', () => {
		expect(parseSeatNames('Minister of Defence')).toEqual(['Minister of Defence']);
	});

	it('does not cut a long paste short: the caller answers for the limit', () => {
		const lines = Array.from({ length: PASTED_SEAT_LIMIT + 1 }, (value, index) => `Seat ${index}`);

		expect(parseSeatNames(lines.join('\n'))).toHaveLength(PASTED_SEAT_LIMIT + 1);
	});
});

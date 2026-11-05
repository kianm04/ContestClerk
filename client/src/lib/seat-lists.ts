/**
 * The ready-made seat lists the committee editor offers, and the reading of the
 * names an organiser pastes in by hand.
 *
 * Each list holds two-letter ISO 3166-1 codes rather than country names, and
 * `standardSeats` turns a code into a name with `countryName` from
 * `$lib/countries.ts`. The names are written down once there, and a second list
 * of the same 193 names would drift apart from the first the day one country
 * changes what it is called. A code also happens to be exactly what a seat's
 * `country_code` column and the `Flag` component want.
 *
 * Both the server and the browser import this file, so it must not contain
 * anything server-only.
 */

import { COUNTRY_CODES, countryName } from '$lib/countries';

/** One seat a ready-made list asks for, in the shape the `addSeats` action inserts. */
export type StandardSeat = {
	name: string;
	/** Two letters for the flag. Always filled here: every entry in these lists is a country. */
	countryCode: string | null;
};

/** Which ready-made list a button asks for. The form sends one of these three words. */
export type SeatListName = 'un_members' | 'security_council' | 'eu_members';

/**
 * The 193 member states of the United Nations.
 *
 * Observers are not members and are not here: Palestine and the Holy See both
 * sit in the Assembly without a vote, so an organiser who wants them adds them
 * by hand. The `prettier-ignore` line keeps the codes in rows rather than one
 * per line, the way `COUNTRY_CODES` in `$lib/countries.ts` does.
 */
// prettier-ignore
export const UN_MEMBER_STATES: string[] = [
	'AF', 'AL', 'DZ', 'AD', 'AO', 'AG', 'AR', 'AM', 'AU', 'AT', 'AZ',
	'BS', 'BH', 'BD', 'BB', 'BY', 'BE', 'BZ', 'BJ', 'BT', 'BO', 'BA', 'BW', 'BR', 'BN', 'BG', 'BF', 'BI',
	'CV', 'KH', 'CM', 'CA', 'CF', 'TD', 'CL', 'CN', 'CO', 'KM', 'CG', 'CD', 'CR', 'CI', 'HR', 'CU', 'CY', 'CZ',
	'DK', 'DJ', 'DM', 'DO',
	'EC', 'EG', 'SV', 'GQ', 'ER', 'EE', 'SZ', 'ET',
	'FJ', 'FI', 'FR',
	'GA', 'GM', 'GE', 'DE', 'GH', 'GR', 'GD', 'GT', 'GN', 'GW', 'GY',
	'HT', 'HN', 'HU',
	'IS', 'IN', 'ID', 'IR', 'IQ', 'IE', 'IL', 'IT',
	'JM', 'JP', 'JO',
	'KZ', 'KE', 'KI', 'KP', 'KR', 'KW', 'KG',
	'LA', 'LV', 'LB', 'LS', 'LR', 'LY', 'LI', 'LT', 'LU',
	'MG', 'MW', 'MY', 'MV', 'ML', 'MT', 'MH', 'MR', 'MU', 'MX', 'FM', 'MD', 'MC', 'MN', 'ME', 'MA', 'MZ', 'MM',
	'NA', 'NR', 'NP', 'NL', 'NZ', 'NI', 'NE', 'NG', 'MK', 'NO',
	'OM',
	'PK', 'PW', 'PA', 'PG', 'PY', 'PE', 'PH', 'PL', 'PT',
	'QA',
	'RO', 'RU', 'RW',
	'KN', 'LC', 'VC', 'WS', 'SM', 'ST', 'SA', 'SN', 'RS', 'SC', 'SL', 'SG', 'SK', 'SI', 'SB', 'SO',
	'ZA', 'SS', 'ES', 'LK', 'SD', 'SR', 'SE', 'CH', 'SY',
	'TJ', 'TZ', 'TH', 'TL', 'TG', 'TO', 'TT', 'TN', 'TR', 'TM', 'TV',
	'UG', 'UA', 'AE', 'GB', 'US', 'UY', 'UZ',
	'VU', 'VE', 'VN',
	'YE', 'ZM', 'ZW'
];

/**
 * The fifteen members of the Security Council: the five permanent ones and the
 * ten the General Assembly elects.
 *
 * This is a snapshot of the 2026 Council, not a rule. Five of the ten elected
 * members change every January, so the button fills the committee in and the
 * organiser edits the seats afterwards, exactly as they would for any other
 * list. The name says "members" rather than a year on purpose: a name with a
 * year in it rots, and nobody renames a constant the first January after.
 */
// prettier-ignore
export const SECURITY_COUNCIL_MEMBERS: string[] = [
	// The five permanent members.
	'CN', 'FR', 'RU', 'GB', 'US',
	// Elected for 2025-2026.
	'DK', 'GR', 'PK', 'PA', 'SO',
	// Elected for 2026-2027.
	'BH', 'CO', 'CD', 'LV', 'LR'
];

/** The 27 member states of the European Union. */
// prettier-ignore
export const EU_MEMBER_STATES: string[] = [
	'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
	'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'
];

/** The three lists, by the word the form sends for each one. */
const SEAT_LISTS: Record<SeatListName, string[]> = {
	un_members: UN_MEMBER_STATES,
	security_council: SECURITY_COUNCIL_MEMBERS,
	eu_members: EU_MEMBER_STATES
};

/**
 * Is this one of the three list names? Anybody can post anything to a form
 * action, so the word it sends is checked before it is used.
 *
 * The `text is SeatListName` ending is TypeScript for "when this answers true,
 * treat the text as a `SeatListName` from here on", which is what lets the
 * caller hand it straight to `standardSeats`.
 */
export function isSeatListName(text: string): text is SeatListName {
	return text === 'un_members' || text === 'security_council' || text === 'eu_members';
}

/** The seats one ready-made list adds, in the order the list holds them. */
export function standardSeats(name: SeatListName): StandardSeat[] {
	const codes = SEAT_LISTS[name];

	return codes.map((code) => ({ name: countryName(code), countryCode: code }));
}

/**
 * Every country name in lowercase, with the code it belongs to: `france` to `FR`.
 *
 * `$lib/countries.ts` only goes the other way, from a code to a name, so the
 * lookup is turned round here once, the moment this file is first imported,
 * rather than every time a name is asked about. A paste of 193 names would
 * otherwise walk all 250 codes 193 times over, and the answer never changes
 * between one name and the next.
 *
 * A name is kept only the first time it is seen, so if two codes ever share a
 * name the earlier code in `COUNTRY_CODES` wins rather than the later one
 * quietly replacing it.
 */
const CODES_BY_LOWERCASE_NAME: Map<string, string> = new Map();

for (const code of COUNTRY_CODES) {
	const lowercaseName = countryName(code).toLowerCase();

	if (!CODES_BY_LOWERCASE_NAME.has(lowercaseName)) {
		CODES_BY_LOWERCASE_NAME.set(lowercaseName, code);
	}
}

/**
 * The country code for a name somebody typed, such as `FR` for "France", or
 * `null` when no country is called that.
 *
 * The `addSeats` action asks this of every pasted name: a name it recognises
 * becomes a `country` seat carrying the code its flag needs, and a name it does
 * not, such as "Minister of Defence", becomes an `other` seat. Surrounding
 * spaces and capitals are ignored, so "  france  " finds France, but nothing
 * else is guessed: "Holland" and "USA" are not country names and answer `null`.
 */
export function countryCodeForName(name: string): string | null {
	const lookedUpName = name.trim().toLowerCase();

	return CODES_BY_LOWERCASE_NAME.get(lookedUpName) ?? null;
}

/**
 * How many seats one paste may add at a time. It is a guard against somebody
 * pasting a whole spreadsheet by accident, not a limit on how many seats a
 * committee may have: the organiser can paste again.
 */
export const PASTED_SEAT_LIMIT = 300;

/**
 * The seat names in a pasted block of text: one per line, without surrounding
 * spaces, empty lines left out, and a name that appears twice kept only the
 * first time.
 *
 * Two lines that differ only in their capitals are the same seat, because the
 * committee already refuses two seats with the same name. The first spelling is
 * the one kept, so "france" after "France" changes nothing.
 *
 * It does not cut the list short at `PASTED_SEAT_LIMIT`. The caller compares the
 * length with that limit, because silently dropping the last names would leave
 * the organiser believing seats were added that were not.
 */
export function parseSeatNames(text: string): string[] {
	const lines = text.split('\n');
	const names: string[] = [];
	const seenLowercase = new Set<string>();

	for (const line of lines) {
		const name = line.trim();
		const lowercase = name.toLowerCase();

		if (name !== '' && !seenLowercase.has(lowercase)) {
			names.push(name);
			seenLowercase.add(lowercase);
		}
	}

	return names;
}

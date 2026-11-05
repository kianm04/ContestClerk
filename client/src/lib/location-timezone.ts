/**
 * The timezone a conference most likely sits in, worked out from where it is
 * (Trello fe3reN7Y): Delft in the Netherlands is `Europe/Amsterdam`. The When &
 * where step fills the timezone in from this and says so under the field, and
 * the organiser can still pick another.
 *
 * A country is enough for almost every one, because almost every country
 * keeps one clock. The handful that span several zones are decided by the
 * city when it is a city on the list, and by their most populous zone
 * otherwise. A country whose other zones the dropdown does not offer, such as
 * Brazil, counts as keeping one clock here. Every name here is also in `$lib/timezones.ts`, so whatever is
 * suggested can be picked from the dropdown as well.
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

import { isTimezone } from '$lib/timezones';

/**
 * The zone a conference starts in when nothing says where it is: the same
 * `Europe/Amsterdam` the `conferences.timezone` column defaults to and the
 * details editor starts from, so a draft reads the same whichever side filled
 * it in.
 */
const SYSTEM_DEFAULT_TIMEZONE = 'Europe/Amsterdam';

/** The one zone of a country that keeps one clock, by its two-letter code. */
const TIMEZONE_BY_COUNTRY: Record<string, string> = {
	AE: 'Asia/Dubai',
	AR: 'America/Argentina/Buenos_Aires',
	AT: 'Europe/Vienna',
	BE: 'Europe/Brussels',
	BG: 'Europe/Sofia',
	BR: 'America/Sao_Paulo',
	CH: 'Europe/Zurich',
	CL: 'America/Santiago',
	CN: 'Asia/Shanghai',
	CO: 'America/Bogota',
	CZ: 'Europe/Prague',
	DE: 'Europe/Berlin',
	DK: 'Europe/Copenhagen',
	EG: 'Africa/Cairo',
	ES: 'Europe/Madrid',
	FI: 'Europe/Helsinki',
	FR: 'Europe/Paris',
	GB: 'Europe/London',
	GR: 'Europe/Athens',
	HK: 'Asia/Hong_Kong',
	HU: 'Europe/Budapest',
	ID: 'Asia/Jakarta',
	IE: 'Europe/Dublin',
	IL: 'Asia/Jerusalem',
	IN: 'Asia/Kolkata',
	IT: 'Europe/Rome',
	JP: 'Asia/Tokyo',
	KE: 'Africa/Nairobi',
	KR: 'Asia/Seoul',
	LT: 'Europe/Vilnius',
	MA: 'Africa/Casablanca',
	MX: 'America/Mexico_City',
	MY: 'Asia/Kuala_Lumpur',
	NG: 'Africa/Lagos',
	NL: 'Europe/Amsterdam',
	NO: 'Europe/Oslo',
	NZ: 'Pacific/Auckland',
	PE: 'America/Lima',
	PH: 'Asia/Manila',
	PK: 'Asia/Karachi',
	PL: 'Europe/Warsaw',
	PT: 'Europe/Lisbon',
	QA: 'Asia/Qatar',
	RO: 'Europe/Bucharest',
	RU: 'Europe/Moscow',
	RS: 'Europe/Belgrade',
	SA: 'Asia/Riyadh',
	SE: 'Europe/Stockholm',
	SG: 'Asia/Singapore',
	SI: 'Europe/Ljubljana',
	TH: 'Asia/Bangkok',
	TR: 'Europe/Istanbul',
	TW: 'Asia/Taipei',
	UA: 'Europe/Kyiv',
	ZA: 'Africa/Johannesburg'
};

/**
 * Countries with more than one clock: a few of their cities, and the zone most
 * of their people live in for every other city.
 */
const TIMEZONES_BY_CITY: Record<string, { cities: Record<string, string>; otherwise: string }> = {
	US: {
		cities: {
			'los angeles': 'America/Los_Angeles',
			'san francisco': 'America/Los_Angeles',
			seattle: 'America/Los_Angeles',
			denver: 'America/Denver',
			chicago: 'America/Chicago',
			houston: 'America/Chicago',
			dallas: 'America/Chicago',
			'new york': 'America/New_York',
			boston: 'America/New_York',
			washington: 'America/New_York',
			miami: 'America/New_York'
		},
		otherwise: 'America/New_York'
	},
	CA: {
		cities: {
			vancouver: 'America/Vancouver',
			toronto: 'America/Toronto',
			ottawa: 'America/Toronto',
			montreal: 'America/Toronto'
		},
		otherwise: 'America/Toronto'
	},
	AU: {
		cities: {
			perth: 'Australia/Perth',
			adelaide: 'Australia/Adelaide',
			brisbane: 'Australia/Brisbane',
			sydney: 'Australia/Sydney',
			melbourne: 'Australia/Melbourne',
			canberra: 'Australia/Sydney'
		},
		otherwise: 'Australia/Sydney'
	}
};

/**
 * The timezone a conference in `city`, `countryCode` most likely keeps, or
 * `null` when the country is unknown or nothing is known about its clock. The
 * caller decides what to do with `null`; the When & where step keeps whatever
 * timezone the draft already has.
 */
export function timezoneForLocation(city: string, countryCode: string): string | null {
	const code = countryCode.trim().toUpperCase();

	const single = TIMEZONE_BY_COUNTRY[code];

	if (single !== undefined) {
		return isTimezone(single) ? single : null;
	}

	const byCity = TIMEZONES_BY_CITY[code];

	if (byCity === undefined) {
		return null;
	}

	const zone = byCity.cities[city.trim().toLowerCase()] ?? byCity.otherwise;

	return isTimezone(zone) ? zone : null;
}

/**
 * The timezone an online conference starts with when nobody said where it is
 * run from: the system default, which is the one the database gives a new row.
 */
export function fallbackTimezone(): string {
	return SYSTEM_DEFAULT_TIMEZONE;
}

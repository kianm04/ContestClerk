/**
 * The timezones an organiser can pick for a conference.
 *
 * A conference stores one IANA timezone name, such as `Europe/Amsterdam`, and
 * every time shown to a delegate is worked out in it (see `$lib/dates.ts`). The
 * list is written out here rather than read from `Intl.supportedValuesOf` for
 * two reasons: the browser and the server can offer different lists, which
 * would let somebody pick a zone the server then refuses; and the full list is
 * over four hundred entries, most of which no conference will ever sit in.
 *
 * Adding a zone is a line in the right group below. The names must be spelled
 * exactly as IANA spells them, because that is what `Intl` is given.
 *
 * Nothing here talks to Supabase or to Svelte.
 */

/** One region's worth of timezones, so the dropdown can show them under a heading. */
export type TimezoneGroup = {
	/** The heading, such as "Europe". */
	region: string;
	/** IANA names, such as `Europe/Amsterdam`. */
	timezones: string[];
};

/**
 * The list, grouped by region and in alphabetical order inside each group.
 *
 * `UTC` is on its own at the top: it belongs to no region, and it is the
 * sensible answer for an online conference with delegates everywhere.
 */
const TIMEZONE_GROUPS: TimezoneGroup[] = [
	{
		region: 'Worldwide',
		timezones: ['UTC']
	},
	{
		region: 'Europe',
		timezones: [
			'Europe/Amsterdam',
			'Europe/Athens',
			'Europe/Belgrade',
			'Europe/Berlin',
			'Europe/Brussels',
			'Europe/Bucharest',
			'Europe/Budapest',
			'Europe/Copenhagen',
			'Europe/Dublin',
			'Europe/Helsinki',
			'Europe/Istanbul',
			'Europe/Kyiv',
			'Europe/Lisbon',
			'Europe/Ljubljana',
			'Europe/London',
			'Europe/Madrid',
			'Europe/Moscow',
			'Europe/Oslo',
			'Europe/Paris',
			'Europe/Prague',
			'Europe/Rome',
			'Europe/Sofia',
			'Europe/Stockholm',
			'Europe/Tallinn',
			'Europe/Vienna',
			'Europe/Vilnius',
			'Europe/Warsaw',
			'Europe/Zurich'
		]
	},
	{
		region: 'Africa',
		timezones: [
			'Africa/Accra',
			'Africa/Addis_Ababa',
			'Africa/Algiers',
			'Africa/Cairo',
			'Africa/Casablanca',
			'Africa/Dar_es_Salaam',
			'Africa/Johannesburg',
			'Africa/Kampala',
			'Africa/Lagos',
			'Africa/Nairobi',
			'Africa/Tunis'
		]
	},
	{
		region: 'Americas',
		timezones: [
			'America/Argentina/Buenos_Aires',
			'America/Bogota',
			'America/Chicago',
			'America/Denver',
			'America/Lima',
			'America/Los_Angeles',
			'America/Mexico_City',
			'America/New_York',
			'America/Santiago',
			'America/Sao_Paulo',
			'America/Toronto',
			'America/Vancouver'
		]
	},
	{
		region: 'Asia',
		timezones: [
			'Asia/Almaty',
			'Asia/Amman',
			'Asia/Baku',
			'Asia/Bangkok',
			'Asia/Beirut',
			'Asia/Colombo',
			'Asia/Dhaka',
			'Asia/Dubai',
			'Asia/Hong_Kong',
			'Asia/Jakarta',
			'Asia/Jerusalem',
			'Asia/Karachi',
			'Asia/Kathmandu',
			'Asia/Kolkata',
			'Asia/Kuala_Lumpur',
			'Asia/Manila',
			'Asia/Qatar',
			'Asia/Riyadh',
			'Asia/Seoul',
			'Asia/Shanghai',
			'Asia/Singapore',
			'Asia/Taipei',
			'Asia/Tashkent',
			'Asia/Tbilisi',
			'Asia/Tokyo',
			'Asia/Yerevan'
		]
	},
	{
		region: 'Oceania',
		timezones: [
			'Australia/Adelaide',
			'Australia/Brisbane',
			'Australia/Melbourne',
			'Australia/Perth',
			'Australia/Sydney',
			'Pacific/Auckland',
			'Pacific/Fiji'
		]
	}
];

/** Every timezone an organiser can pick, grouped by region for the dropdown. */
export function listTimezones(): TimezoneGroup[] {
	return TIMEZONE_GROUPS;
}

/** Is this one of the timezones above? Anyone can put anything in a form, so forms ask. */
export function isTimezone(name: string): boolean {
	return TIMEZONE_GROUPS.some((group) => group.timezones.includes(name));
}

/**
 * Every timezone as one flat list for `SelectField`, which has no `<optgroup>`
 * of its own. The label is the IANA name, which already names its region, so
 * "Europe/Amsterdam" reads well enough on its own in the dropdown.
 *
 * It is built from `listTimezones()` so that there is one list of names to keep
 * up to date rather than two that can drift apart.
 */
export function timezoneOptions(): { value: string; label: string }[] {
	const options: { value: string; label: string }[] = [];

	for (const group of listTimezones()) {
		for (const timezone of group.timezones) {
			options.push({ value: timezone, label: timezone });
		}
	}

	return options;
}

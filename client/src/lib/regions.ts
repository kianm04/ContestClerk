/**
 * The six parts of the world the conference directory filters by, and which
 * countries belong to each (Trello WMcXfry0).
 *
 * A conference only stores its country, so a region is a list of country
 * codes: "Europe" asks the database for conferences whose country is one of the
 * codes below. The split follows the United Nations' own grouping of countries
 * (the M49 "geoscheme"), with two choices a visitor would expect:
 *
 * - North America includes Central America and the Caribbean, so Mexico and
 *   Cuba are in it, as they are on most maps.
 * - The Middle East is part of Asia, as the United Nations has it.
 *
 * Antarctica (`AQ`) is in no region: nobody holds a conference there.
 *
 * Both the server and the browser import this file.
 */

/** One of the six regions, as it is written in the address: `?region=europe`. */
export type ConferenceRegion =
	'europe' | 'asia' | 'north_america' | 'south_america' | 'africa' | 'oceania';

/**
 * The country codes in each region.
 *
 * The `prettier-ignore` line keeps several codes to a row. Without it, Prettier
 * would put each code on a line of its own.
 */
// prettier-ignore
const COUNTRIES_BY_REGION: Record<ConferenceRegion, string[]> = {
	europe: [
		'AD', 'AL', 'AT', 'AX', 'BA', 'BE', 'BG', 'BY', 'CH', 'CZ', 'DE', 'DK', 'EE', 'ES',
		'FI', 'FO', 'FR', 'GB', 'GG', 'GI', 'GR', 'HR', 'HU', 'IE', 'IM', 'IS', 'IT', 'JE',
		'LI', 'LT', 'LU', 'LV', 'MC', 'MD', 'ME', 'MK', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO',
		'RS', 'RU', 'SE', 'SI', 'SJ', 'SK', 'SM', 'UA', 'VA'
	],
	asia: [
		'AE', 'AF', 'AM', 'AZ', 'BD', 'BH', 'BN', 'BT', 'CN', 'CY', 'GE', 'HK', 'ID', 'IL',
		'IN', 'IQ', 'IR', 'JO', 'JP', 'KG', 'KH', 'KP', 'KR', 'KW', 'KZ', 'LA', 'LB', 'LK',
		'MM', 'MN', 'MO', 'MV', 'MY', 'NP', 'OM', 'PH', 'PK', 'PS', 'QA', 'SA', 'SG', 'SY',
		'TH', 'TJ', 'TL', 'TM', 'TR', 'TW', 'UZ', 'VN', 'YE'
	],
	north_america: [
		'AG', 'AI', 'AW', 'BB', 'BL', 'BM', 'BQ', 'BS', 'BZ', 'CA', 'CR', 'CU', 'CW', 'DM',
		'DO', 'GD', 'GL', 'GP', 'GT', 'HN', 'HT', 'JM', 'KN', 'KY', 'LC', 'MF', 'MQ', 'MS',
		'MX', 'NI', 'PA', 'PM', 'PR', 'SV', 'SX', 'TC', 'TT', 'US', 'VC', 'VG', 'VI'
	],
	south_america: [
		'AR', 'BO', 'BR', 'BV', 'CL', 'CO', 'EC', 'FK', 'GF', 'GS', 'GY', 'PE', 'PY', 'SR',
		'UY', 'VE'
	],
	africa: [
		'AO', 'BF', 'BI', 'BJ', 'BW', 'CD', 'CF', 'CG', 'CI', 'CM', 'CV', 'DJ', 'DZ', 'EG',
		'EH', 'ER', 'ET', 'GA', 'GH', 'GM', 'GN', 'GQ', 'GW', 'IO', 'KE', 'KM', 'LR', 'LS',
		'LY', 'MA', 'MG', 'ML', 'MR', 'MU', 'MW', 'MZ', 'NA', 'NE', 'NG', 'RE', 'RW', 'SC',
		'SD', 'SH', 'SL', 'SN', 'SO', 'SS', 'ST', 'SZ', 'TD', 'TF', 'TG', 'TN', 'TZ', 'UG',
		'YT', 'ZA', 'ZM', 'ZW'
	],
	oceania: [
		'AS', 'AU', 'CC', 'CK', 'CX', 'FJ', 'FM', 'GU', 'HM', 'KI', 'MH', 'MP', 'NC', 'NF',
		'NR', 'NU', 'NZ', 'PF', 'PG', 'PN', 'PW', 'SB', 'TK', 'TO', 'TV', 'UM', 'VU', 'WF',
		'WS'
	]
};

/** The six regions in the order the filter lists them, with the words it shows. */
export const REGION_OPTIONS: { value: ConferenceRegion; label: string }[] = [
	{ value: 'europe', label: 'Europe' },
	{ value: 'asia', label: 'Asia' },
	{ value: 'north_america', label: 'North America' },
	{ value: 'south_america', label: 'South America' },
	{ value: 'africa', label: 'Africa' },
	{ value: 'oceania', label: 'Oceania' }
];

/** Whether a piece of text from the address names one of the six regions. */
export function isConferenceRegion(text: string): text is ConferenceRegion {
	return REGION_OPTIONS.some((option) => option.value === text);
}

/**
 * Every country code in any of these regions, for the database's `in` filter.
 * An empty list of regions gives an empty list of countries.
 */
export function countryCodesInRegions(regions: ConferenceRegion[]): string[] {
	return regions.flatMap((region) => COUNTRIES_BY_REGION[region]);
}

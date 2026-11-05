/**
 * Country codes, and the country names that go with them.
 *
 * The database stores a country as its two-letter ISO code, such as `NL`, because a
 * code never changes spelling. People read names, so the pages turn codes into names
 * with the helpers below.
 *
 * Both the server and the browser can import this file. Names are worked out on
 * the server wherever a page already loads its data there, because browsers and
 * Node can disagree on a country's name
 * ("Turkey" or "Türkiye"), and working it out in one place avoids
 * that mismatch. The `Flag` component is the exception: it is given only a code,
 * so it asks here in the browser as well.
 */

/** A country as a dropdown shows it: the code is sent with the form, the name is shown. */
export type CountryOption = {
	code: string;
	name: string;
};

/**
 * Every ISO 3166-1 alpha-2 country code, for the country dropdown on the create page.
 * The `prettier-ignore` line keeps one row per starting letter. Without it, Prettier
 * would put each of these codes on a line of its own.
 */
// prettier-ignore
export const COUNTRY_CODES: string[] = [
	'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ',
	'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ',
	'BR', 'BS', 'BT', 'BV', 'BW', 'BY', 'BZ',
	'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN', 'CO', 'CR', 'CU',
	'CV', 'CW', 'CX', 'CY', 'CZ',
	'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ',
	'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET',
	'FI', 'FJ', 'FK', 'FM', 'FO', 'FR',
	'GA', 'GB', 'GD', 'GE', 'GF', 'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR',
	'GS', 'GT', 'GU', 'GW', 'GY',
	'HK', 'HM', 'HN', 'HR', 'HT', 'HU',
	'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT',
	'JE', 'JM', 'JO', 'JP',
	'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ',
	'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY',
	'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MP', 'MQ',
	'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ',
	'NA', 'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ',
	'OM',
	'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY',
	'QA',
	'RE', 'RO', 'RS', 'RU', 'RW',
	'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO',
	'SR', 'SS', 'ST', 'SV', 'SX', 'SY', 'SZ',
	'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV',
	'TW', 'TZ',
	'UA', 'UG', 'UM', 'US', 'UY', 'UZ',
	'VA', 'VC', 'VE', 'VG', 'VI', 'VN', 'VU',
	'WF', 'WS',
	'YE', 'YT',
	'ZA', 'ZM', 'ZW'
];

/**
 * `Intl.DisplayNames` is built into every browser and into Node. Given a region code
 * it returns that country's name in the language we ask for, so we do not have to
 * keep a list of names up to date ourselves.
 */
const ENGLISH_COUNTRY_NAMES = new Intl.DisplayNames(['en'], { type: 'region' });

/** Is this one of the codes in `COUNTRY_CODES`, such as `NL`? Lowercase `nl` does not count. */
export function isCountryCode(text: string): boolean {
	return COUNTRY_CODES.includes(text);
}

/** The English name for a country code: `NL` becomes `Netherlands`. Unknown codes come back unchanged. */
export function countryName(code: string): string {
	// `of` throws an error for text that does not look like a code at all, so we
	// only ask it about codes we know.
	if (!isCountryCode(code)) {
		return code;
	}

	return ENGLISH_COUNTRY_NAMES.of(code) ?? code;
}

/** Turn country codes into dropdown options, sorted by name so people can find their country. */
export function toCountryOptions(codes: string[]): CountryOption[] {
	const options = codes.map((code): CountryOption => ({ code, name: countryName(code) }));

	return options.sort((first, second) => first.name.localeCompare(second.name));
}

/**
 * Money: the currencies a conference can charge in, and turning amounts into
 * the words on the screen and back again.
 *
 * Every amount in the database is a whole number of the currency's smallest
 * unit — cents, pence, centimes — and never a decimal. Decimals cannot hold
 * `0.1` exactly, so adding up a list of them drifts away from the right answer,
 * and an invoice that is a penny out is an invoice nobody trusts. People type
 * and read "65.00", so `toCents` and `fromCents` convert at the two edges: when
 * a form is read, and when an amount is put in an input.
 *
 * Nothing here talks to Supabase or to Svelte.
 */

/** How many cents there are in one unit of currency. */
const CENTS_PER_UNIT = 100;

/** A currency as the dropdown shows it: the code is saved, the name is read. */
export type CurrencyOption = {
	/** A three-letter ISO 4217 code, such as `EUR`. */
	code: string;
	name: string;
};

/**
 * The currencies an organiser can pick from.
 *
 * Stripe supports many more; these are the ones MUNMeet launches with. Adding
 * another is a line here, as long as Stripe supports it and it has two decimal
 * places, which is what `toCents` and `fromCents` below assume.
 */
export const CURRENCIES: CurrencyOption[] = [
	{ code: 'EUR', name: 'Euro' },
	{ code: 'USD', name: 'US dollar' },
	{ code: 'GBP', name: 'Pound sterling' },
	{ code: 'CHF', name: 'Swiss franc' }
];

/** Is this one of the currencies above? Anyone can put anything in a form, so forms ask. */
export function isCurrencyCode(code: string): boolean {
	return CURRENCIES.some((currency) => currency.code === code);
}

/**
 * Every currency as the flat list of options `SelectField` wants.
 *
 * The label puts the code beside the name, because an invoice says "EUR 65.00"
 * rather than "Euro 65.00": the code is the part an organiser meets again later.
 *
 * It is built out of `CURRENCIES` so that there is one list of currencies to
 * keep up to date rather than two that can drift apart.
 */
export function currencyOptions(): { value: string; label: string }[] {
	return CURRENCIES.map((currency) => ({
		value: currency.code,
		label: `${currency.code} · ${currency.name}`
	}));
}

/**
 * An amount as a person reads it: `formatMoney(6500, 'EUR')` gives "€65.00".
 *
 * Always two decimals, even for a round amount, because a column of prices that
 * sometimes has decimals and sometimes does not is hard to compare down.
 */
export function formatMoney(amountCents: number, currency: string): string {
	return new Intl.NumberFormat('en-GB', {
		style: 'currency',
		currency,
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	}).format(amountCents / CENTS_PER_UNIT);
}

/**
 * Read an amount somebody typed into a form and turn it into whole cents:
 * "65.00" and "65" both give 6500.
 *
 * Returns `null` for anything that is not an amount, so the caller can show a
 * message rather than saving a `NaN`. A negative amount is refused too: nothing
 * in MUNMeet charges a negative fee, and a refund is its own invoice status.
 */
export function toCents(amount: string): number | null {
	const typed = amount.trim();

	// Digits, then at most one dot and at most two more digits. Checking the
	// shape first means "65.999" and "6 5" are refused instead of being rounded
	// into something the person did not ask for.
	if (!/^\d+(\.\d{1,2})?$/.test(typed)) {
		return null;
	}

	// `Math.round` clears up the drift from multiplying a decimal: 19.99 * 100
	// is 1998.9999999999998 in JavaScript, and we want 1999.
	return Math.round(Number(typed) * CENTS_PER_UNIT);
}

/**
 * The other direction, for filling an amount back into a form field:
 * `fromCents(6500)` gives "65.00".
 */
export function fromCents(amountCents: number): string {
	return (amountCents / CENTS_PER_UNIT).toFixed(2);
}

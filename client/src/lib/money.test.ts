import { describe, expect, it } from 'vitest';
import {
	CURRENCIES,
	currencyOptions,
	formatMoney,
	fromCents,
	isCurrencyCode,
	toCents
} from './money';

describe('CURRENCIES', () => {
	it('offers the four currencies the spec launches with', () => {
		expect(CURRENCIES.map((currency) => currency.code)).toEqual(['EUR', 'USD', 'GBP', 'CHF']);
	});

	it('gives every currency a name to show in the dropdown', () => {
		for (const currency of CURRENCIES) {
			expect(currency.name).not.toBe('');
		}
	});
});

describe('isCurrencyCode', () => {
	it('accepts a currency we offer', () => {
		expect(isCurrencyCode('EUR')).toBe(true);
	});

	it('refuses anything else, including lowercase', () => {
		expect(isCurrencyCode('JPY')).toBe(false);
		expect(isCurrencyCode('eur')).toBe(false);
		expect(isCurrencyCode('')).toBe(false);
	});
});

describe('currencyOptions', () => {
	it('offers one option per currency, in the same order as the list itself', () => {
		expect(currencyOptions().map((option) => option.value)).toEqual(
			CURRENCIES.map((currency) => currency.code)
		);
	});

	it('labels an option with the code and the name, joined by a middle dot', () => {
		const options = currencyOptions();

		expect(options[0]).toEqual({ value: 'EUR', label: 'EUR · Euro' });
		expect(options[1]).toEqual({ value: 'USD', label: 'USD · US dollar' });
	});
});

describe('formatMoney', () => {
	it('shows the currency symbol and two decimals', () => {
		expect(formatMoney(6500, 'EUR')).toBe('€65.00');
		expect(formatMoney(6500, 'GBP')).toBe('£65.00');
	});

	it('keeps the two decimals on a round amount', () => {
		expect(formatMoney(6000, 'EUR')).toBe('€60.00');
		expect(formatMoney(0, 'EUR')).toBe('€0.00');
	});

	it('shows the cents it was given', () => {
		expect(formatMoney(6599, 'EUR')).toBe('€65.99');
		expect(formatMoney(5, 'EUR')).toBe('€0.05');
	});
});

describe('toCents', () => {
	it('turns what somebody typed into whole cents', () => {
		expect(toCents('65.00')).toBe(6500);
		expect(toCents('65')).toBe(6500);
		expect(toCents('65.5')).toBe(6550);
		expect(toCents('0')).toBe(0);
	});

	it('does not drift on an amount that cannot be held exactly', () => {
		// 19.99 * 100 is 1998.9999999999998 without the rounding in `toCents`.
		expect(toCents('19.99')).toBe(1999);
		expect(toCents('0.07')).toBe(7);
	});

	it('ignores spaces around the amount', () => {
		expect(toCents('  65.00  ')).toBe(6500);
	});

	it('refuses anything that is not an amount', () => {
		expect(toCents('')).toBeNull();
		expect(toCents('free')).toBeNull();
		expect(toCents('6 5')).toBeNull();
		expect(toCents('65,00')).toBeNull();
	});

	it('refuses more precision than the currency has', () => {
		expect(toCents('65.999')).toBeNull();
	});

	it('refuses a negative amount', () => {
		expect(toCents('-65.00')).toBeNull();
	});
});

describe('fromCents', () => {
	it('writes the amount the way a form field wants it', () => {
		expect(fromCents(6500)).toBe('65.00');
		expect(fromCents(6599)).toBe('65.99');
		expect(fromCents(0)).toBe('0.00');
		expect(fromCents(5)).toBe('0.05');
	});

	it('gives back what toCents read, unchanged', () => {
		expect(fromCents(toCents('19.99') ?? 0)).toBe('19.99');
	});
});

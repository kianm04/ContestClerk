import { describe, expect, it } from 'vitest';
import { isCurrencyCode } from '$lib/money';
import {
	PLATFORM_FEE_CURRENCY,
	PLATFORM_FEE_PER_DELEGATE_CENTS,
	applicationFeeCents,
	needsCheckout
} from './platform-fee';

// Two constants, but they are the two every invoice is built on, so they are
// worth a guard. The tests check the shape of the values
// rather than the values themselves: the amount is still open question 1 in
// `specs/07-delivery/open-questions.md` and may change without this file being
// wrong.

describe('PLATFORM_FEE_PER_DELEGATE_CENTS', () => {
	it('is a whole number of cents', () => {
		// Money in MUNMeet is always whole cents. Half a cent cannot be charged,
		// and `Money` would show a price nobody can pay.
		expect(Number.isInteger(PLATFORM_FEE_PER_DELEGATE_CENTS)).toBe(true);
	});

	it('is more than nothing, so a paid seat earns MUNMeet something', () => {
		expect(PLATFORM_FEE_PER_DELEGATE_CENTS).toBeGreaterThan(0);
	});
});

describe('PLATFORM_FEE_CURRENCY', () => {
	it('is one of the currencies the app knows', () => {
		// `Intl.NumberFormat` throws on a code it does not recognise, which would
		// take down every page that formats a price rather than show a wrong one.
		// Checking it against `$lib/money` here means a typo fails the test run
		// instead.
		expect(isCurrencyCode(PLATFORM_FEE_CURRENCY)).toBe(true);
	});
});

describe('needsCheckout', () => {
	it('is true for an invoice that asks for money', () => {
		expect(needsCheckout({ amountCents: 6500 })).toBe(true);
	});

	// Stripe refuses a Checkout for zero, and MUNMeet takes no fee on money that
	// never moved, so a zero invoice is settled without one.
	it('is false for an invoice of nothing', () => {
		expect(needsCheckout({ amountCents: 0 })).toBe(false);
	});
});

describe('applicationFeeCents', () => {
	it('asks for the fee per seat times the seats on an ordinary invoice', () => {
		expect(applicationFeeCents({ amountCents: 4 * 6500, quantity: 4 })).toBe(
			4 * PLATFORM_FEE_PER_DELEGATE_CENTS
		);
	});

	// Stripe refuses an application fee larger than the charge. A seat priced
	// below the fee, or a group invoice in a currency whose minor unit is worth
	// little, would otherwise ask for more than the payer is paying.
	it('never asks for more than the invoice itself', () => {
		expect(applicationFeeCents({ amountCents: 150, quantity: 1 })).toBe(150);
		expect(applicationFeeCents({ amountCents: 300, quantity: 3 })).toBe(300);
	});

	it('asks for nothing on an invoice of nothing', () => {
		expect(applicationFeeCents({ amountCents: 0, quantity: 12 })).toBe(0);
	});
});

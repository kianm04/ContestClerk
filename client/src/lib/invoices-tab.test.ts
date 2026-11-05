import { describe, expect, it } from 'vitest';
import { invoicePaidDetail, invoicePayerDetail, invoiceTotalStats } from './invoices-tab';

describe('invoicePayerDetail', () => {
	it('names the seat of one delegate', () => {
		const invoice = { delegationName: null, seatLabel: 'DISEC · Germany', quantity: 1 };

		expect(invoicePayerDetail(invoice)).toBe('DISEC · Germany');
	});

	it('names the delegation and its seats on a group invoice', () => {
		const invoice = { delegationName: 'Harbour View College', seatLabel: null, quantity: 3 };

		expect(invoicePayerDetail(invoice)).toBe('Harbour View College · 3 seats');
	});

	it('leaves the seats out of a group invoice for one seat', () => {
		const invoice = { delegationName: 'Harbour View College', seatLabel: null, quantity: 1 };

		expect(invoicePayerDetail(invoice)).toBe('Harbour View College');
	});

	it('says nothing when neither is known', () => {
		expect(invoicePayerDetail({ delegationName: null, seatLabel: null, quantity: 1 })).toBe('');
	});
});

describe('invoicePaidDetail', () => {
	it('writes the day in the conference timezone and the way it was paid', () => {
		// 23:30 in London on 27 October is already the 28th in Amsterdam.
		const invoice = { paidAt: '2026-10-27T23:30:00Z', paidMethod: 'manual' as const };

		expect(invoicePaidDetail(invoice, 'Europe/London')).toBe('27 Oct · Manual');
		expect(invoicePaidDetail(invoice, 'Europe/Amsterdam')).toBe('28 Oct · Manual');
	});

	it('says card for a payment through Stripe', () => {
		const invoice = { paidAt: '2026-10-28T10:00:00Z', paidMethod: 'stripe' as const };

		expect(invoicePaidDetail(invoice, 'Europe/London')).toBe('28 Oct · Card');
	});

	it('says nothing while the invoice is not paid', () => {
		expect(invoicePaidDetail({ paidAt: null, paidMethod: null }, 'Europe/London')).toBe('');
	});
});

describe('invoiceTotalStats', () => {
	const TOTALS = {
		invoicedCents: 39500,
		paidCents: 18000,
		outstandingCents: 21500,
		outstandingCount: 3,
		waivedCents: 4500,
		platformFeesCents: 0
	};

	it('writes the four figures, counting the unpaid invoices', () => {
		expect(invoiceTotalStats(TOTALS, 'GBP')).toEqual([
			{ value: '£395.00', label: 'Invoiced' },
			{ value: '£180.00', label: 'Paid', note: undefined },
			{ value: '£215.00', label: 'Outstanding', note: '3 invoices' },
			{ value: '£45.00', label: 'Waived' }
		]);
	});

	it('names the platform fees once MUNMeet kept some, and one invoice in the singular', () => {
		const stats = invoiceTotalStats(
			{ ...TOTALS, outstandingCount: 1, platformFeesCents: 600 },
			'EUR'
		);

		expect(stats[1].note).toBe('€6.00 platform fees');
		expect(stats[2].note).toBe('1 invoice');
	});
});

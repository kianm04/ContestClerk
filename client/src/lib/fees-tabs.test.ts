import { describe, expect, it } from 'vitest';
import { chosenFeesTab, feesPageTabs, shownFeesTab } from './fees-tabs';

describe('chosenFeesTab', () => {
	it('follows a tab the address names', () => {
		expect(chosenFeesTab(new URLSearchParams('tab=fees'), false)).toBe('fees');
		expect(chosenFeesTab(new URLSearchParams('tab=invoices'), true)).toBe('invoices');
	});

	it('ignores a tab it does not know', () => {
		expect(chosenFeesTab(new URLSearchParams('tab=settings'), true)).toBe('fees');
	});

	it('opens the fees tab on an open fee editor', () => {
		expect(chosenFeesTab(new URLSearchParams('editFee=fee-1'), false)).toBe('fees');
	});

	it('opens the invoices tab on a search, filter, page or highlighted invoice', () => {
		expect(chosenFeesTab(new URLSearchParams('q=harbour'), true)).toBe('invoices');
		expect(chosenFeesTab(new URLSearchParams('status=unpaid'), true)).toBe('invoices');
		expect(chosenFeesTab(new URLSearchParams('page=2'), true)).toBe('invoices');
		expect(chosenFeesTab(new URLSearchParams('invoice=inv-1'), true)).toBe('invoices');
	});

	it('opens a draft on fees and a public conference on invoices', () => {
		expect(chosenFeesTab(new URLSearchParams(''), true)).toBe('fees');
		expect(chosenFeesTab(new URLSearchParams(''), false)).toBe('invoices');
	});
});

describe('shownFeesTab', () => {
	it('keeps the asked tab when nothing was refused', () => {
		expect(shownFeesTab('invoices', null)).toBe('invoices');
		expect(shownFeesTab('fees', undefined)).toBe('fees');
	});

	it('shows the tab of the form that was refused', () => {
		expect(shownFeesTab('fees', { invoiceMessage: 'Already paid.' })).toBe('invoices');
		expect(shownFeesTab('invoices', { invoiceMessage: null })).toBe('fees');
	});

	it('keeps the asked tab when the request broke rather than being refused', () => {
		expect(shownFeesTab('fees', {})).toBe('fees');
		expect(shownFeesTab('invoices', {})).toBe('invoices');
	});
});

describe('feesPageTabs', () => {
	it('links both tabs and counts the invoices', () => {
		expect(feesPageTabs('thimun-2027', 'invoices', 9)).toEqual([
			{ label: 'Fees', href: '/manage/thimun-2027/fees?tab=fees', isActive: false },
			{
				label: 'Invoices',
				href: '/manage/thimun-2027/fees?tab=invoices',
				isActive: true,
				count: 9
			}
		]);
	});
});

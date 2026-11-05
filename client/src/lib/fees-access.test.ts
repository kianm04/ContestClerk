import { describe, expect, it } from 'vitest';
import { feesAccess, feesTabForReader, mayFollowFeesLink, mayReadInvoices } from './fees-access';
import { NO_PERMISSIONS, type MyPermissions, type Permission } from './permissions';

/** One conference-wide role holding these permissions. */
function holding(...keys: Permission[]): MyPermissions {
	return {
		held: keys.map((permission) => ({ permission, scope: 'conference' })),
		committeeIds: [],
		rank: 1
	};
}

describe('mayReadInvoices', () => {
	it('answers yes to read_invoices, to manage_invoices and to an administrator', () => {
		expect(mayReadInvoices(holding('read_invoices'))).toBe(true);
		expect(mayReadInvoices(holding('manage_invoices'))).toBe(true);
		expect(mayReadInvoices(holding('administrator'))).toBe(true);
	});

	it('answers no to edit_conference alone', () => {
		expect(mayReadInvoices(holding('edit_conference'))).toBe(false);
		expect(mayReadInvoices(NO_PERMISSIONS)).toBe(false);
	});
});

describe('feesAccess', () => {
	it('gives the Finance preset everything on the page', () => {
		const finance = holding('edit_conference', 'read_invoices', 'manage_invoices');

		expect(feesAccess(finance)).toEqual({
			canEditFees: true,
			canReadInvoices: true,
			canManageInvoices: true
		});
	});

	it('lets a reader of invoices read them and change nothing', () => {
		expect(feesAccess(holding('read_invoices'))).toEqual({
			canEditFees: false,
			canReadInvoices: true,
			canManageInvoices: false
		});
	});
});

describe('feesTabForReader', () => {
	it('keeps the tab asked for when the reader may read invoices', () => {
		expect(feesTabForReader('invoices', feesAccess(holding('read_invoices')))).toBe('invoices');
	});

	it('opens the fee list for a reader who may not', () => {
		expect(feesTabForReader('invoices', feesAccess(holding('edit_conference')))).toBe('fees');
	});
});

describe('mayFollowFeesLink', () => {
	it('opens a plain link for either half', () => {
		const plain = new URLSearchParams();

		expect(mayFollowFeesLink(holding('edit_conference'), plain)).toBe(true);
		expect(mayFollowFeesLink(holding('read_invoices'), plain)).toBe(true);
		expect(mayFollowFeesLink(NO_PERMISSIONS, plain)).toBe(false);
	});

	it('asks edit_conference of the fee list and read_invoices of the table', () => {
		const feeList = new URLSearchParams('tab=fees');
		const table = new URLSearchParams('status=unpaid');

		expect(mayFollowFeesLink(holding('read_invoices'), feeList)).toBe(false);
		expect(mayFollowFeesLink(holding('read_invoices'), table)).toBe(true);
		expect(mayFollowFeesLink(holding('edit_conference'), table)).toBe(false);
	});
});

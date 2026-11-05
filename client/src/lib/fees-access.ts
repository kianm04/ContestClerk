/**
 * Who may do what on the fees page (`docs/roles-and-permissions.md`, sections
 * 4 and 8). The page has two halves with different permissions: the fee list
 * is part of `edit_conference`, because it shapes the conference, and the
 * invoices are read with `read_invoices` and settled with `manage_invoices`.
 * Either half opens the page; each reader sees the half they hold.
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

import { chosenFeesTab, type FeesTab } from '$lib/fees-tabs';
import { hasPermission, type MyPermissions } from '$lib/permissions';

/** What the reader may do on the fees page. */
export type FeesAccess = {
	/** Add, change, move and delete fees, and choose how delegates pay. */
	canEditFees: boolean;
	/** See the "Invoices" tab, and payment status wherever else it shows. */
	canReadInvoices: boolean;
	/** Mark paid, waive and void, and download the invoices. */
	canManageInvoices: boolean;
};

/**
 * May the reader see invoices and payment status? `manage_invoices` includes
 * reading: the role editor saves the two together, and this answers yes to
 * either so a role written by hand cannot manage what it cannot see.
 */
export function mayReadInvoices(mine: MyPermissions): boolean {
	return hasPermission(mine, 'read_invoices') || hasPermission(mine, 'manage_invoices');
}

/** What this reader may do on the fees page. */
export function feesAccess(mine: MyPermissions): FeesAccess {
	return {
		canEditFees: hasPermission(mine, 'edit_conference'),
		canReadInvoices: mayReadInvoices(mine),
		canManageInvoices: hasPermission(mine, 'manage_invoices')
	};
}

/** The tab to draw: the one asked for, except "Invoices" for a reader who may not read them. */
export function feesTabForReader(tab: FeesTab, access: FeesAccess): FeesTab {
	return access.canReadInvoices ? tab : 'fees';
}

/**
 * May the reader act on a link to the fees page? A link that names a tab, or
 * carries what opens one, such as `?status=unpaid`, asks what that tab needs:
 * "Set fees" is for somebody who may change them, and "3 invoices are unpaid"
 * for somebody who may read them. A plain link asks for either.
 */
export function mayFollowFeesLink(mine: MyPermissions, search: URLSearchParams): boolean {
	const access = feesAccess(mine);

	if (search.size === 0) {
		return access.canEditFees || access.canReadInvoices;
	}

	const tab = chosenFeesTab(search, false);

	return tab === 'fees' ? access.canEditFees : access.canReadInvoices;
}

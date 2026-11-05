/**
 * The two tabs of an organiser's fees page, `/manage/[slug]/fees`: "Fees",
 * where the organiser says how delegates pay and what they are charged, and
 * "Invoices", the table of every invoice raised.
 *
 * Which tab shows lives in the address, as `?tab=`, so a link, a refresh and
 * the back button all keep it, and the tabs are plain links that need no
 * JavaScript. Nothing here talks to Supabase or knows any Svelte.
 */
import type { Tab } from '$lib/components/Tabs.svelte';
import { manageFeesTabUrl } from '$lib/urls';

/** The two tabs, spelled the way `?tab=` writes them. */
export type FeesTab = 'fees' | 'invoices';

/**
 * The address parameters only the invoices table reads. Links from other
 * pages (a dashboard line, a delegation's invoice) carry one of these without
 * naming a tab, and should still land on the table.
 */
const INVOICE_TABLE_PARAMETERS = ['q', 'status', 'page', 'invoice'];

/**
 * Which tab an address asks for.
 *
 * A `tab` of its own wins. Otherwise an open fee editor (`editFee`) means the
 * "Fees" tab, and any search, filter, page or highlighted invoice means the
 * "Invoices" tab. With none of those, a draft opens on "Fees", the setup step
 * it is, and a public conference on "Invoices", which is what an organiser
 * comes back for once delegates are being charged.
 */
export function chosenFeesTab(searchParams: URLSearchParams, isDraft: boolean): FeesTab {
	const tab = searchParams.get('tab');

	if (tab === 'fees' || tab === 'invoices') {
		return tab;
	}

	if (searchParams.has('editFee')) {
		return 'fees';
	}

	const isTableAddress = INVOICE_TABLE_PARAMETERS.some((name) => searchParams.has(name));

	if (isTableAddress) {
		return 'invoices';
	}

	return isDraft ? 'fees' : 'invoices';
}

/**
 * The tab to draw, given the one the address asked for and the answer of the
 * last form action, if it refused.
 *
 * Without JavaScript a refused form is drawn at the action's own address, such
 * as `/fees?/addFee`, which names no tab. The refusal says which form it was
 * about instead: a refused invoice button carries `invoiceMessage`, and every
 * other refusal is about one of the forms on the "Fees" tab.
 *
 * A request that broke on the way, rather than being refused, comes back with
 * only a toast and no `invoiceMessage` at all (`$lib/in-place-form.svelte.ts`).
 * It says nothing about a tab, so the page stays where the reader was.
 */
export function shownFeesTab(
	tab: FeesTab,
	refusal: { invoiceMessage?: string | null } | null | undefined
): FeesTab {
	if (!refusal || refusal.invoiceMessage === undefined) {
		return tab;
	}

	return refusal.invoiceMessage === null ? 'fees' : 'invoices';
}

/** The two tab links, with the number of invoices beside "Invoices". */
export function feesPageTabs(slug: string, activeTab: FeesTab, invoiceCount: number): Tab[] {
	return [
		{
			label: 'Fees',
			href: manageFeesTabUrl(slug, 'fees'),
			isActive: activeTab === 'fees'
		},
		{
			label: 'Invoices',
			href: manageFeesTabUrl(slug, 'invoices'),
			isActive: activeTab === 'invoices',
			count: invoiceCount
		}
	];
}

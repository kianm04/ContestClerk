<script lang="ts">
	import Receipt from '@lucide/svelte/icons/receipt';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import Pagination from '$lib/components/Pagination.svelte';
	import StatStrip from '$lib/components/manage/StatStrip.svelte';
	import type { ConferenceInvoiceTotals } from '$lib/fees';
	import {
		describeInvoiceActionFailure,
		expectInvoiceActionChange
	} from '$lib/invoice-action-presses';
	import type { InvoiceListQuery, InvoiceTablePage } from '$lib/invoices';
	import { createInstantForm } from '$lib/instant-form.svelte';
	import { invoiceTotalStats } from '$lib/invoices-tab';
	import { rowsAfterPresses } from '$lib/row-changes';
	import { manageFeesTableUrl } from '$lib/urls';
	import InvoiceFilters from './InvoiceFilters.svelte';
	import InvoiceTable from './InvoiceTable.svelte';

	type Props = {
		/** One page of the filtered invoices. */
		table: InvoiceTablePage;
		/** The sums over every invoice of the conference, whatever the filters. */
		totals: ConferenceInvoiceTotals;
		/** The currency the totals are written in. */
		currency: string;
		/** The search, status and page read out of the address. */
		query: InvoiceListQuery;
		/** False until the conference has its first invoice, whatever the filters. */
		hasInvoices: boolean;
		/** A refused invoice action's reason, shown above the table, or null. */
		message: string | null;
		timezone: string;
		conferenceSlug: string;
		/** May the reader mark paid, waive and void? Without `manage_invoices` the table only reads. */
		canManage: boolean;
	};

	let {
		table,
		totals,
		currency,
		query,
		hasInvoices,
		message,
		timezone,
		conferenceSlug,
		canManage
	}: Props = $props();

	/**
	 * One instant form for every row's "Mark as paid", "Waive" and "Void"
	 * (`$lib/instant-form.svelte.ts`): a row's status badge changes the moment
	 * its button is pressed, with no spinner, and a press that fails goes back
	 * with a toast naming what did not happen. Without JavaScript every button
	 * still posts and reloads the page as before.
	 */
	const invoiceActionForm = createInstantForm({ describeFailure: describeInvoiceActionFailure });
	const submitInvoiceActionPress = invoiceActionForm.submitExpecting(expectInvoiceActionChange);

	// The four figures above the table. `$derived` works them out again on new data.
	const stats = $derived(invoiceTotalStats(totals, currency));

	// `$derived` works this out again whenever `table`, or the presses still on
	// their way, change. `shownTable` is `table` with those presses laid on top.
	const shownTable = $derived({
		...table,
		rows: rowsAfterPresses(table.rows, invoiceActionForm.presses)
	});

	/**
	 * The address of one page of rows. `Pagination` makes it an ordinary link.
	 * The highlighted invoice is dropped, because it belongs to the page it was
	 * linked to, not to every page after it.
	 */
	function hrefForPage(page: number) {
		return manageFeesTableUrl(conferenceSlug, { ...query, page, invoice: '' });
	}
</script>

<!--
	`id="invoices"` is what the `#invoices` at the end of the table's addresses
	scrolls to, so a filter, a page link or a button lands on the table rather
	than on the top of the page.
-->
<div id="invoices" class="flex flex-col gap-5">
	<StatStrip {stats} />

	{#if message}
		<Notice tone="error">{message}</Notice>
	{/if}

	{#if !hasInvoices}
		<EmptyState
			icon={Receipt}
			title="No invoices yet."
			description="Invoices are created when you accept delegates."
		/>
	{:else}
		<InvoiceFilters {query} {conferenceSlug} />

		{#if table.rows.length === 0}
			<p class="text-body text-ink-600">No invoices match these filters.</p>
		{:else}
			<InvoiceTable
				table={shownTable}
				{timezone}
				{query}
				{conferenceSlug}
				onSubmit={submitInvoiceActionPress}
				{canManage}
			/>
			<Pagination page={query.page} pageCount={table.pageCount} {hrefForPage} />
		{/if}
	{/if}
</div>

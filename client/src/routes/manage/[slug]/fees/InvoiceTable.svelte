<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import DataTable, { type TableColumn } from '$lib/components/DataTable.svelte';
	import type { InvoiceListQuery, InvoiceTablePage } from '$lib/invoices';
	import InvoiceCard from './InvoiceCard.svelte';
	import InvoiceRow from './InvoiceRow.svelte';

	type Props = {
		/** One page of invoices, and which of them is highlighted. */
		table: InvoiceTablePage;
		/** The conference's timezone, so the paid day is the day it was there. */
		timezone: string;
		/** The table's filters, which every button carries through its post. */
		query: InvoiceListQuery;
		conferenceSlug: string;
		/** Passed straight through to each row; see `InvoiceActions`'s own prop of the same name. */
		onSubmit?: SubmitFunction;
		/** May the reader settle invoices? Without it the table has no actions column. */
		canManage: boolean;
	};

	let { table, timezone, query, conferenceSlug, onSubmit, canManage }: Props = $props();

	/** The table's headings. `actions` holds buttons, and is named for a screen reader. */
	const ALL_COLUMNS: TableColumn[] = [
		{ key: 'invoice', label: 'Invoice' },
		{ key: 'payer', label: 'Payer' },
		{ key: 'amount', label: 'Amount' },
		{ key: 'status', label: 'Status' },
		{ key: 'paid', label: 'Paid' },
		{ key: 'actions', label: 'Actions' }
	];
	const columns = $derived(
		canManage ? ALL_COLUMNS : ALL_COLUMNS.filter((column) => column.key !== 'actions')
	);
</script>

<!-- The table from `md` up. `DataTable` draws the headings; the rows are ours. -->
<div class="hidden md:block">
	<DataTable {columns} isDense>
		<!-- The `(invoice.id)` key lets Svelte reuse rows instead of rebuilding them. -->
		{#each table.rows as invoice (invoice.id)}
			<InvoiceRow
				{invoice}
				isHighlighted={invoice.id === table.highlightedId}
				{timezone}
				{query}
				{conferenceSlug}
				{onSubmit}
				{canManage}
			/>
		{/each}
	</DataTable>
</div>

<!-- The same invoices as cards below `md`, which is what a phone shows. -->
<ul class="flex flex-col gap-3 md:hidden">
	{#each table.rows as invoice (invoice.id)}
		<li>
			<InvoiceCard
				{invoice}
				isHighlighted={invoice.id === table.highlightedId}
				{timezone}
				{query}
				{conferenceSlug}
				{onSubmit}
				{canManage}
			/>
		</li>
	{/each}
</ul>

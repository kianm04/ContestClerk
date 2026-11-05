<script lang="ts">
	import Receipt from '@lucide/svelte/icons/receipt';
	import DataTable, { type TableColumn } from '$lib/components/DataTable.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Stat from '$lib/components/Stat.svelte';
	import { formatMoney } from '$lib/money';
	import { conferenceListUrl } from '$lib/urls';
	import InvoiceRow from './InvoiceRow.svelte';
	import InvoiceTableRow from './InvoiceTableRow.svelte';
	import type { PageProps } from './$types';

	// `data` is whatever `load` in `+page.server.ts` returned. It is replaced
	// with fresh results every time the URL changes. `PageProps` comes from
	// `./$types`, the types SvelteKit generates for this one route.
	let { data }: PageProps = $props();

	/** The desktop table's columns, in the order `05-pages/delegate/invoices.md` draws them. */
	const COLUMNS: TableColumn[] = [
		{ key: 'number', label: 'Number' },
		{ key: 'conference', label: 'Conference' },
		{ key: 'description', label: 'Description' },
		{ key: 'amount', label: 'Amount' },
		{ key: 'due', label: 'Due' },
		{ key: 'status', label: 'Status' },
		{ key: 'view', label: 'View' }
	];
</script>

<svelte:head>
	<!-- A page only its owner can open writes its own title, rather than using
		`PageMeta`, which asks for a description for a link card. -->
	<title>Invoices · MUNMeet</title>
</svelte:head>

<div class="mx-auto max-w-240">
	<div class="mb-6">
		<PageHeader title="Invoices" />
	</div>

	<!--
		One pair of figures per currency, because euros and pounds cannot be added
		together. A person with invoices from one conference sees one pair.
	-->
	{#if data.totals.length > 0}
		<section aria-label="Totals" class="mb-2 grid grid-cols-2 gap-3 md:grid-cols-4">
			{#each data.totals as total (total.currency)}
				<Stat label="Outstanding" value={formatMoney(total.outstandingCents, total.currency)} />
				<Stat label="Paid" value={formatMoney(total.paidCents, total.currency)} />
			{/each}
		</section>
	{/if}

	{#if data.invoices.length === 0}
		<EmptyState
			icon={Receipt}
			title="No invoices."
			description="When a conference charges a fee, the invoice appears here."
			actionLabel="Browse conferences"
			actionHref={conferenceListUrl()}
		/>
	{:else}
		<!-- Cards on a phone, the table from the `md` width up. Both draw the same invoices. -->
		<ul class="mt-4 flex flex-col gap-3 md:hidden">
			<!-- The `(invoice.id)` key lets Svelte reuse list items instead of rebuilding them. -->
			{#each data.invoices as invoice (invoice.id)}
				<li>
					<InvoiceRow {invoice} now={data.now} />
				</li>
			{/each}
		</ul>

		<div class="mt-4 hidden md:block">
			<DataTable columns={COLUMNS}>
				{#each data.invoices as invoice (invoice.id)}
					<InvoiceTableRow {invoice} now={data.now} />
				{/each}
			</DataTable>
		</div>
	{/if}
</div>

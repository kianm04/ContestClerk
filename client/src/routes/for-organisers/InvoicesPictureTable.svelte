<script lang="ts">
	import { SAMPLE_INVOICES } from '$lib/organiser-fees';
	import InvoicesPictureStatus from './InvoicesPictureStatus.svelte';

	/* The five columns of the desktop table, shared by the header and every row
	   so they line up: number, payer, what for, amount and status. */
	const DESKTOP_COLUMNS =
		'md:grid-cols-[2.75rem_minmax(0,1.25fr)_minmax(0,1.05fr)_3.5rem_8rem] md:grid-rows-1';
</script>

<!--
	The drawn invoices table inside the fees card. From `md` up it is a table
	of five columns under a pale blue header. On a phone the header and the
	number are left out and each invoice becomes two lines: who pays and how
	much, then what for and where it stands. The cells are placed by column and
	row on a grid, so the same five cells serve both layouts.

	The `(invoice.number)` key in `{#each}` tells Svelte which row is which.
-->
<div
	class="hidden min-h-8 items-center gap-x-3 bg-brand-50 px-5 text-caption font-medium text-ink-600 md:grid {DESKTOP_COLUMNS}"
>
	<span>Invoice</span>
	<span>Payer</span>
	<span>For</span>
	<span class="text-right">Amount</span>
	<span>Status</span>
</div>

<div class="divide-y divide-neutral-100">
	{#each SAMPLE_INVOICES as invoice (invoice.number)}
		<div
			class="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-5 py-2 {DESKTOP_COLUMNS}"
		>
			<span class="hidden text-ink-600 tabular-nums md:col-start-1 md:row-start-1 md:block">
				{invoice.number}
			</span>
			<span
				class="col-start-1 row-start-1 font-medium whitespace-nowrap md:col-start-2 md:row-start-1"
			>
				{invoice.payer}
			</span>
			<span
				class="col-start-1 row-start-2 whitespace-nowrap text-ink-600 md:col-start-3 md:row-start-1"
			>
				{invoice.purpose}
			</span>
			<span class="col-start-2 row-start-1 text-right tabular-nums md:col-start-4 md:row-start-1">
				{invoice.amount}
			</span>
			<span
				class="col-start-2 row-start-2 justify-self-end md:col-start-5 md:row-start-1 md:justify-self-start"
			>
				<InvoicesPictureStatus status={invoice.status} tone={invoice.tone} />
			</span>
		</div>
	{/each}
</div>

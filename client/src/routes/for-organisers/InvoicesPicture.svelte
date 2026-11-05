<script lang="ts">
	import Download from 'carbon-icons-svelte/lib/Download.svelte';
	import { FEE_TOTALS } from '$lib/organiser-fees';
	import InvoicesPicturePhone from './InvoicesPicturePhone.svelte';
	import InvoicesPictureTable from './InvoicesPictureTable.svelte';
</script>

<!--
	The picture for "As seats are given": an organiser's fees card, with the
	totals across the top and five invoices under them, and a delegate's phone
	hung off the card's lower right corner showing the invoice still due.

	The picture is a drawing of the product, so it is hidden from screen
	readers and nothing in it can be pressed; the sentence before it says what
	it shows. The padding under and beside the card is the room the phone hangs
	into: more on a phone, where the card is shorter than the phone is tall.
	The totals sit in two columns on a phone and four from `md` up.

	The `(total.label)` key in `{#each}` tells Svelte which figure is which.
-->
<p class="sr-only">
	An example of an organiser's fees: €9,725 invoiced and €6,480 paid, five invoices paid by card, by
	bank transfer, due or refunded, and a delegate's phone with their €65.00 invoice and a button to
	pay it by card.
</p>

<div aria-hidden="true" class="relative pb-[13.25rem] text-ink-900 md:pr-3 md:pb-[9.5rem]">
	<div class="overflow-hidden rounded-2xl bg-surface text-small shadow-card">
		<div
			class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-neutral-100 px-5 py-3.5"
		>
			<span class="font-medium">Fees</span>
			<span class="flex items-center gap-2 text-caption text-ink-600">
				<span class="size-2 flex-none rounded-full bg-success-500"></span>
				Card payments on · Stripe connected
			</span>
		</div>

		<div
			class="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-neutral-100 px-5 pt-3.5 pb-4 md:grid-cols-4"
		>
			{#each FEE_TOTALS as total (total.label)}
				<div class="flex min-w-0 flex-col">
					<span class="text-caption text-ink-600">{total.label}</span>
					<span class="text-[1.125rem]/[1.5rem] font-semibold tabular-nums">{total.amount}</span>
				</div>
			{/each}
		</div>

		<InvoicesPictureTable />

		<div class="flex items-center border-t border-neutral-100 px-5 pt-3 pb-3.5">
			<span
				class="flex items-center gap-1.5 rounded-[0.375rem] border border-line px-3 py-[0.3125rem] font-medium"
			>
				<Download size={16} />
				Export CSV
			</span>
		</div>
	</div>

	<InvoicesPicturePhone />
</div>

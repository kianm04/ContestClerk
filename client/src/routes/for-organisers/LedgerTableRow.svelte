<script lang="ts">
	import ArrowRight from 'carbon-icons-svelte/lib/ArrowRight.svelte';
	import type { LedgerRow } from '$lib/organiser-start';

	type Props = {
		row: LedgerRow;
		/** The row's place in the ledger, which keeps its ids unique on the page. */
		index: number;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { row, index }: Props = $props();
</script>

<!--
	One row of the desktop ledger: the whole row is one link to the job's
	chapter. A link's name is what a screen reader says when it lands on it, and
	the full row would be a long one, so `aria-labelledby` names it by the job
	alone and `aria-describedby` reads the other two cells after it. Those cells
	begin with "Usually:" and "On MUNMeet:" for screen readers only (`sr-only`),
	standing in for the header row they cannot see.

	The thin pale blue line down the left of the third cell starts 1px above
	the row (`-top-px`), over the hairline between rows, so it runs unbroken
	down the card. The focus ring is drawn inside the row (`-outline-offset-2`),
	because the card's rounded corners clip anything outside it.
-->
<a
	href="#{row.chapterId}"
	aria-labelledby="ledger-table-job-{index}"
	aria-describedby="ledger-table-usually-{index} ledger-table-on-{index}"
	class="grid min-h-11 grid-cols-[13rem_minmax(0,1fr)_minmax(0,1.25fr)_3rem] items-stretch transition-colors duration-150 hover:bg-brand-50 focus-visible:-outline-offset-2"
>
	<span id="ledger-table-job-{index}" class="px-5 py-[0.9375rem] text-h3">{row.job}</span>
	<span id="ledger-table-usually-{index}" class="px-5 py-4 text-[0.875rem]/[1.375rem] text-ink-600">
		<span class="sr-only">Usually:</span>
		{row.usually}
	</span>
	<span
		id="ledger-table-on-{index}"
		class="relative px-5 py-4 text-[0.875rem]/[1.375rem] font-medium text-balance"
	>
		<span class="absolute -top-px bottom-0 left-0 w-0.5 bg-brand-100"></span>
		<span class="sr-only">On MUNMeet:</span>
		{row.onMunmeet}
	</span>
	<span class="flex justify-center pt-[1.1875rem] text-brand-700">
		<ArrowRight size={16} />
	</span>
</a>

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
	One job of the ledger on a phone, as a block: the job and its arrow, then
	what it usually runs on in grey, then where it lives on MUNMeet in black,
	behind a thin pale blue line. The whole block is one link to the job's
	chapter. As in the desktop row, `aria-labelledby` names the link by the job
	alone and `aria-describedby` reads the two labelled lines after it.

	The focus ring is drawn inside the block (`-outline-offset-2`), because the
	card's rounded corners clip anything outside it.
-->
<a
	href="#{row.chapterId}"
	aria-labelledby="ledger-block-job-{index}"
	aria-describedby="ledger-block-usually-{index} ledger-block-on-{index}"
	class="flex flex-col gap-2.5 px-5 pt-4 pb-[1.125rem] transition-colors duration-150 hover:bg-brand-50 focus-visible:-outline-offset-2"
>
	<span class="flex min-h-7 items-center justify-between gap-4">
		<span id="ledger-block-job-{index}" class="text-h3">{row.job}</span>
		<ArrowRight size={16} class="flex-none text-brand-700" />
	</span>
	<span id="ledger-block-usually-{index}" class="flex flex-col gap-0.5">
		<span class="text-caption font-medium text-ink-600">Usually</span>
		<span class="text-[0.875rem]/[1.375rem] text-ink-600">{row.usually}</span>
	</span>
	<span id="ledger-block-on-{index}" class="flex flex-col gap-0.5 border-l-2 border-brand-100 pl-3">
		<span class="text-caption font-medium text-ink-600">On MUNMeet</span>
		<span class="text-[0.875rem]/[1.375rem] font-medium">{row.onMunmeet}</span>
	</span>
</a>

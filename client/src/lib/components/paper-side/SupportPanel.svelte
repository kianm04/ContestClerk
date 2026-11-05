<script lang="ts">
	import type { PaperWords } from '$lib/committee-papers';
	import {
		hasEnoughSupport,
		supportCountLine,
		supportRuleSentence,
		supportShare,
		type PaperSupport
	} from '$lib/paper-support';
	import PaperSideHeading from './PaperSideHeading.svelte';

	type Props = {
		support: PaperSupport;
		words: PaperWords;
		/** What the green line says once there is enough: the authors read that they may submit. */
		enoughText?: string;
	};

	let { support, words, enoughText = 'Enough support to submit' }: Props = $props();

	const share = $derived(supportShare(support));
</script>

<!--
	How much support the paper has against what the committee asks for, as a
	count, a light-blue bar and the rule it comes from. The bar is a shape
	only; the count above it says the same for a screen reader.
-->
<section aria-label="Support">
	<PaperSideHeading title="Support" count={supportCountLine(support)} />
	<div class="mt-3 h-1 bg-border" aria-hidden="true">
		<div class="h-full bg-ring" style:width="{share}%"></div>
	</div>
	{#if hasEnoughSupport(support)}
		<!-- Green means a state here: the paper has the support it needs. -->
		<p class="mt-3 flex items-center gap-2 text-small text-foreground">
			<span class="size-1.5 flex-none rounded-full bg-success" aria-hidden="true"></span>
			{enoughText}
		</p>
	{/if}
	<p class="mt-2 text-small text-muted-foreground">{supportRuleSentence(support, words)}</p>
</section>

<script lang="ts">
	import type { AmendmentScreenPage } from '$lib/paper-on-screen';

	type Props = {
		/** The clause the amendment changes, drawn on the server (`amendmentScreenPage`). */
		page: AmendmentScreenPage;
	};

	let { page }: Props = $props();
</script>

<!--
	The clause an amendment under the vote changes, as drawn: its number in
	the serif in a narrow column, and beside it in grey the words it strikes,
	struck through in black, then its new words. A strike shows only what goes,
	an addition only what comes.

	`{@html}` draws a string as HTML instead of as text. It is only safe for HTML
	nobody can slip a script into, which is why it only ever draws what
	`renderMarkdown` made on the server.
-->
<div
	class="grid max-w-[76vw] grid-cols-[3vw_minmax(0,1fr)] items-baseline text-[1.7vw]/[1.42] text-muted-foreground [&_p]:m-0 [&_u]:decoration-1 [&_u]:underline-offset-[0.19vw]"
>
	<span
		class="font-display text-[2.6vw]/none font-semibold text-foreground tabular-nums [font-variation-settings:normal]"
		>{page.reference ?? ''}</span
	>
	<div class="flex flex-col gap-[0.8vw]">
		{#if page.struckHtml}
			<del class="line-through decoration-foreground decoration-[1.5px]">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- made safe on the server, as said above -->
				{@html page.struckHtml}
			</del>
		{/if}
		{#if page.newHtml}
			<div class="text-foreground">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- made safe on the server, as said above -->
				{@html page.newHtml}
			</div>
		{/if}
	</div>
</div>

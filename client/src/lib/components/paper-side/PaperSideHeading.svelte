<script lang="ts">
	type Props = {
		/** "Support", "Signatories", "Sponsors". */
		title: string;
		/** A count set on the right, such as "5 of 9", or `null` for none. */
		count?: string | null;
	};

	let { title, count = null }: Props = $props();
</script>

<!--
	The title of one block beside the paper, with its black rule: a section
	title on a phone, where the blocks follow the text, and a small label
	beside it from `md` up, as the paper writer was drawn.
-->
<h2
	class="flex items-baseline justify-between gap-3 border-b border-foreground pb-2 font-display text-h2 font-semibold text-foreground md:font-sans md:text-label md:font-semibold"
>
	{title}
	{#if count !== null}
		<span class="font-sans text-small font-normal text-muted-foreground tabular-nums">{count}</span>
	{/if}
</h2>

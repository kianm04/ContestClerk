<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		/** The page's one `<h1>`, such as "Details" or the conference's name. */
		title: string;
		/** A quiet line above the title, such as "Step 1 of 6" while setting up. */
		eyebrow?: string;
		/** One sentence under the title saying where things stand. */
		summary?: string;
		/** The buttons that belong to the page, shown on the right. */
		children?: Snippet;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { title, eyebrow, summary, children }: Props = $props();
</script>

<!--
	The top of every management page in the manage redesign. Like `PageHeader`,
	`flex-wrap` drops the buttons under the title on a phone, but the title is
	dark and a little smaller, and the header keeps its own space underneath.
-->
<header class="flex flex-wrap items-end justify-between gap-4 pb-6">
	<div class="min-w-0">
		{#if eyebrow}
			<p class="mb-2 text-small text-muted-foreground">{eyebrow}</p>
		{/if}

		<h1 class="font-display text-manage-title text-foreground">{title}</h1>

		{#if summary}
			<p class="mt-1.5 text-body text-muted-foreground">{summary}</p>
		{/if}
	</div>

	{#if children}
		<!-- `{@render children()}` draws whatever the page put between the tags. -->
		<div class="flex flex-wrap items-center gap-2">
			{@render children()}
		</div>
	{/if}
</header>

<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		/** The page's one `<h1>`, in display type. */
		title: string;
		/** One line under the title. */
		subtitle?: string;
		/** A small word above the title, such as "Organisation". */
		eyebrow?: string;
		/** The buttons that belong to the page, shown on the right. */
		children?: Snippet;
	};

	let { title, subtitle, eyebrow, children }: Props = $props();
</script>

<!--
	`flex-wrap` is what makes the actions drop under the title on a phone: the
	row runs out of width and the second half moves to its own line.

	The header has no margin of its own. Most pages hold it in a
	`flex flex-col gap-6` column that already spaces it from what follows, and a
	margin would add to that gap. A page without such a column wraps the header
	in `<div class="mb-6">` instead.
-->
<header class="flex flex-wrap items-start justify-between gap-4">
	<div>
		{#if eyebrow}
			<p class="text-label text-ink-600 uppercase">{eyebrow}</p>
		{/if}

		<h1 class="font-display text-h1-mobile text-brand-900 md:text-h1">{title}</h1>

		{#if subtitle}
			<p class="mt-1 max-w-prose text-body text-ink-600">{subtitle}</p>
		{/if}
	</div>

	{#if children}
		<div class="flex flex-wrap items-center gap-2">
			{@render children()}
		</div>
	{/if}
</header>

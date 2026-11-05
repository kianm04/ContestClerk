<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		/**
		 * The anchor the contents list at the top of the page links to, such as
		 * `tokens`. It has to match the id in that list in `+page.svelte`.
		 */
		id: string;
		title: string;
		children: Snippet;
	};

	let { id, title, children }: Props = $props();
</script>

<!--
	One group of the styleguide. `scroll-mt-24` keeps the heading clear of the
	contents list, which sticks to the top of the window, when a link jumps here.
-->
<section {id} aria-labelledby="{id}-title" class="min-w-0 scroll-mt-24">
	<h2 id="{id}-title" class="mb-4 font-display text-h1-mobile text-brand-900 md:text-h1">
		{title}
	</h2>

	<div class="grid min-w-0 gap-4">
		{@render children()}
	</div>
</section>

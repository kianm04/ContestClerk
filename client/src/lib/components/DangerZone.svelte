<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		/** The heading. "Danger zone" unless a page has a better word for it. */
		title?: string;
		/** The destructive buttons: delete, unpublish, revoke. */
		children: Snippet;
	};

	let { title = 'Danger zone', children }: Props = $props();
</script>

<!--
	A `<section>` with a red border rather than a `<Card>`: the border colour is
	the whole point of this component and `Card` has only the one grey border.
	`aria-label` is what makes a `<section>` a landmark a screen reader can jump
	to; without a name it is just a box.
-->
<section aria-label={title} class="rounded-2xl border border-danger-700 bg-surface p-4 md:p-6">
	<h2 class="font-display text-h2 text-danger-700">{title}</h2>

	<div class="mt-3 flex flex-wrap items-center gap-2">
		{@render children()}
	</div>
</section>

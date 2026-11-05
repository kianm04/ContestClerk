<script lang="ts">
	import type { LandingRow } from '$lib/landing';
	import { REVEAL_ITEM_CLASSES, staggerDelay } from '$lib/reveal';

	type Props = {
		/** The rows, top to bottom. */
		rows: LandingRow[];
	};

	let { rows }: Props = $props();
</script>

<!--
	What a section offers, one row at a time: a blue Carbon icon, a title line
	and one line of detail, the way the example's box of details lists things.

	The rows sit inside a `Reveal`, and `REVEAL_ITEM_CLASSES` makes each one
	follow it in a little after the one above, by its own `transition-delay`.
	`<row.icon />` draws whichever icon component the row holds. Rows have no
	id, so the `(row.title)` key tells Svelte which is which.
-->
<ul class="flex flex-col gap-5">
	{#each rows as row, index (row.title)}
		<li class="flex gap-3.5 {REVEAL_ITEM_CLASSES}" style:transition-delay="{staggerDelay(index)}ms">
			<row.icon size={20} aria-hidden="true" class="mt-0.5 shrink-0 text-brand-700" />

			<div class="min-w-0">
				<h3 class="text-h3 text-ink-900">{row.title}</h3>
				<p class="mt-0.5 max-w-prose text-small text-ink-600">{row.detail}</p>
			</div>
		</li>
	{/each}
</ul>

<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		/** How many rows are ticked. Zero reads "No rows selected"; the buttons stay. */
		selectedCount: number;
		/** The buttons that act on the ticked rows. */
		children: Snippet;
	};

	let { selectedCount, children }: Props = $props();

	/*
		The bar only sticks to the bottom of the screen once something is ticked.
		While nothing is, it is an ordinary row at the end of the list. A bar
		floating over the page with nothing to act on would cover whatever is
		under it — and on a page whose JavaScript never ran nothing can ever be
		ticked, so it would cover something for ever.
	*/
	const positionClass = $derived(selectedCount > 0 ? 'sticky bottom-0' : '');

	/** "1 row selected", not "1 rows selected", and a plain sentence for none. */
	const countText = $derived.by(() => {
		if (selectedCount === 0) {
			return 'No rows selected';
		}

		return selectedCount === 1 ? '1 row selected' : `${selectedCount} rows selected`;
	});
</script>

<!--
	`role="status"` makes a screen reader say how many rows are selected when the
	number changes, without interrupting whatever it is reading. Once something is
	ticked the bar sticks to the bottom of the screen, so the actions stay in
	reach down a long list; see `positionClass` for why it only sticks then.

	It is drawn whether or not anything is ticked, which is not what the wireframe
	in `05-pages/organiser/applications.md` draws. Without JavaScript nothing can
	appear in answer to a tick — the browser sends the ticked boxes when a button
	is pressed and re-renders nothing before then — so a bar that waited for one
	would put every bulk decision out of reach of a page whose JavaScript never
	ran, and those decisions are what the page is for.
-->
<div
	role="status"
	class="{positionClass} flex flex-wrap items-center justify-between gap-3 rounded-control border border-line bg-surface p-3 shadow-card"
>
	<p class="text-body text-ink-900">{countText}</p>

	<div class="flex flex-wrap gap-2">
		{@render children()}
	</div>
</div>

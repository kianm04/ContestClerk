<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';
	import Globe from '@lucide/svelte/icons/globe';
	import GraduationCap from '@lucide/svelte/icons/graduation-cap';
	import LayoutGrid from '@lucide/svelte/icons/layout-grid';
	import { quickFilterChips } from '$lib/conference-quick-filters';
	import type { ConferenceQuery } from '$lib/conferences';
	import { isConferenceRegion } from '$lib/regions';
	import MoreQuickFilters from './MoreQuickFilters.svelte';
	import QuickFilterLink from './QuickFilterLink.svelte';

	type Props = {
		/** The filters the results on screen were built from, as the server read them. */
		query: ConferenceQuery;
	};

	let { query }: Props = $props();

	// Every chip's address and state, worked out again whenever `query` changes.
	const chips = $derived(quickFilterChips(query));

	/** The mockup's icon for a chip: a grid for "All", a cap for a level, a globe for a region. */
	function iconFor(key: string): LucideIcon {
		if (key === 'all') return LayoutGrid;
		if (isConferenceRegion(key)) return Globe;
		return GraduationCap;
	}
</script>

<!--
	The row of chips under the search box, after the mockup (Trello WMcXfry0):
	"All", the levels and the regions, then "More" for the ones with no room.
	`data-sveltekit-noscroll` keeps the page where it is when a chip is chosen,
	where a link would normally jump back to the top.

	On a phone the chips scroll sideways in one line rather than filling four
	rows, and from `md` up they wrap and are centred. "More" stays outside the
	part that scrolls, because a scrolling box would cut its menu off. `py-1`
	leaves room for the focus ring, which the scrolling box would cut off too.
-->
<nav
	aria-label="Quick filters"
	data-sveltekit-noscroll
	class="flex gap-2 md:justify-center md:gap-3"
>
	<ul
		class="flex min-w-0 gap-2 overflow-x-auto py-1 md:flex-wrap md:justify-center md:gap-3 md:overflow-visible"
	>
		<!-- The `(chip.key)` key lets Svelte reuse list items instead of rebuilding them. -->
		{#each chips.inRow as chip (chip.key)}
			<li class="shrink-0"><QuickFilterLink {chip} icon={iconFor(chip.key)} /></li>
		{/each}
	</ul>
	<div class="py-1"><MoreQuickFilters chips={chips.inMore} /></div>
</nav>

<!--
	The level is chosen with the chips above, which are links rather than controls
	in the filter form around them, so this carries it along when a filter changes.
-->
<input type="hidden" name="level" value={query.level} />

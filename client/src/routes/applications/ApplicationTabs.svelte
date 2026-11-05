<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import {
		APPLICATION_TABS,
		type ApplicationTab,
		type ApplicationTabCounts,
		type MyApplicationsQuery
	} from '$lib/my-applications-query';
	import { myApplicationsUrl } from '$lib/urls';
	// `cn` joins class names and lets a later class win over an earlier one.
	import { cn } from '$lib/utils';

	type Props = {
		/** The page as it is now, so a tab keeps the search and the order. */
		query: MyApplicationsQuery;
		counts: ApplicationTabCounts;
	};

	let { query, counts }: Props = $props();

	/**
	 * The open tab is underlined in light blue with dark blue words, the way the
	 * top bar marks the page being read. The border is there on every tab so the
	 * words do not shift when a tab becomes the open one; only its colour changes.
	 */
	function tabClasses(tab: ApplicationTab): string {
		return cn(
			'flex h-11 items-center gap-2 border-b-2 px-3 whitespace-nowrap transition-colors duration-150 focus-visible:-outline-offset-2',
			tab === query.tab
				? 'border-ring font-medium text-primary'
				: 'border-transparent text-muted-foreground hover:text-foreground'
		);
	}

	/** The number beside the tab, or `null` for "All" and "Past", which have none. */
	function tabCount(tab: ApplicationTab): number | null {
		if (tab === 'all' || tab === 'past') {
			return null;
		}

		return counts[tab];
	}

	/** Red means there is something to do, and only a "Needs action" above 0 can say so. */
	function countVariant(tab: ApplicationTab): 'destructive' | 'secondary' {
		return tab === 'needs-action' && counts['needs-action'] > 0 ? 'destructive' : 'secondary';
	}
</script>

<!--
	Links rather than buttons, so the address says which tab is open and the
	page works without JavaScript. On a phone the strip scrolls sideways inside
	its own box rather than making the page wider, and `max-sm:mask-r-from-…`
	fades out its last 2rem, so a tab cut off at the edge looks like more to
	scroll to rather than the end of the box. `max-sm:pr-8` on the list leaves
	that much room after "Past", so once scrolled to the end nothing is faded.
-->
<nav
	aria-label="Filter applications"
	class="w-fit max-w-full overflow-x-auto max-sm:mask-r-from-[calc(100%-2rem)]"
>
	<ul class="flex w-max max-sm:pr-8">
		<!-- The `(option.tab)` key lets Svelte reuse list items instead of rebuilding them. -->
		{#each APPLICATION_TABS as option (option.tab)}
			<li>
				<!-- `-outline-offset-2` draws the focus ring inside, where the scrolling box cannot cut it off. -->
				<a
					href={myApplicationsUrl({ ...query, tab: option.tab })}
					aria-current={option.tab === query.tab ? 'page' : undefined}
					class={tabClasses(option.tab)}
				>
					{option.label}

					{#if tabCount(option.tab) !== null}
						<!-- A shadcn `Badge`, with the 6px corners docs/DESIGN.md gives badges. -->
						<Badge variant={countVariant(option.tab)} class="rounded-lg tabular-nums">
							{tabCount(option.tab)}
						</Badge>
					{/if}
				</a>
			</li>
		{/each}
	</ul>
</nav>

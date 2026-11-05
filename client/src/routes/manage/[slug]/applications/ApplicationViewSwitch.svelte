<script lang="ts">
	import type { ApplicationListQuery, ApplicationListView } from '$lib/applications';
	import { manageApplicationsUrl } from '$lib/urls';

	type Props = {
		/** The tab, the filters and the view on screen; both links keep the filters. */
		query: ApplicationListQuery;
		conferenceSlug: string;
	};

	let { query, conferenceSlug }: Props = $props();

	/** The same applications, filtered the same way, in the other view. */
	function viewHref(view: ApplicationListView) {
		return manageApplicationsUrl(conferenceSlug, { ...query, view, page: 1 });
	}

	/** The colours of one of the two links. Written out in full for Tailwind. */
	function linkClasses(view: ApplicationListView): string {
		if (view === query.view) return 'bg-muted font-medium text-foreground';

		return 'text-muted-foreground hover:text-foreground';
	}
</script>

<!--
	Two plain links rather than a toggle button, so the view is part of the
	address like the tab and the filters, and works without JavaScript.

	The board is for dragging with a mouse or a pen, so on a phone the table is
	the only view offered: the switch is hidden below `md`, except on the board
	itself, where it is the way back to the table.
-->
<nav
	aria-label="View"
	class="{query.view === 'board'
		? 'flex'
		: 'hidden md:flex'} rounded-control border border-border p-0.5"
>
	<a
		href={viewHref('table')}
		aria-current={query.view === 'table' ? 'page' : undefined}
		class="flex min-h-10 items-center rounded-lg px-3 text-dense lg:min-h-8.5 {linkClasses(
			'table'
		)}">Table</a
	>
	<a
		href={viewHref('board')}
		aria-current={query.view === 'board' ? 'page' : undefined}
		class="flex min-h-10 items-center rounded-lg px-3 text-dense lg:min-h-8.5 {linkClasses(
			'board'
		)}">Board</a
	>
</nav>

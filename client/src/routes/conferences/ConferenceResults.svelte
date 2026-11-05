<script lang="ts">
	import CalendarSearch from '@lucide/svelte/icons/calendar-search';
	import ConferenceCard from '$lib/components/ConferenceCard.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Pagination from '$lib/components/Pagination.svelte';
	import { PAGE_SIZE, type Conference, type ConferenceQuery } from '$lib/conferences';
	import { conferenceListUrl } from '$lib/urls';
	import SortSelect from './SortSelect.svelte';

	type Props = {
		/** The conferences on this page of results. */
		rows: Conference[];
		/** How many conferences match, on every page together. */
		total: number;
		/** The filters the results were built from, which the pager's links keep. */
		query: ConferenceQuery;
		/** The moment the page was drawn, which decides each card's applications pill. */
		now: Date;
	};

	let { rows, total, query, now }: Props = $props();

	const pageCount = $derived(Math.ceil(total / PAGE_SIZE));

	// "1 conference found" rather than "1 conferences found".
	const foundLine = $derived(total === 1 ? '1 conference found' : `${total} conferences found`);

	/**
	 * The address of one page of results. `Pagination` calls this for the
	 * previous and the next page and makes each one an ordinary link, so every
	 * page of the directory can be bookmarked or shared.
	 */
	function hrefForPage(page: number) {
		return conferenceListUrl({ ...query, page });
	}
</script>

<!-- `min-w-0` lets the column shrink below its widest card inside the page's grid. -->
<div class="flex min-w-0 flex-col gap-4">
	{#if rows.length === 0}
		<!-- The empty state says there is nothing, so the "37 conferences found" line is left out. -->
		<!-- The "Sort by" dropdown is not drawn here, so the order is kept for the next search. -->
		<input type="hidden" name="sort" value={query.sort} />
		<EmptyState
			icon={CalendarSearch}
			title="No conferences match."
			description="Try fewer filters, or clear them."
			actionLabel="Clear filters"
			actionHref={conferenceListUrl()}
		/>
	{:else}
		<div class="flex flex-wrap items-center justify-between gap-3">
			<p class="text-small text-ink-600">{foundLine}</p>
			<SortSelect sort={query.sort} />
		</div>

		<!--
		`@container` makes this box a container, and the `@xl:` and `@4xl:` classes
		below are container queries: they count the width of this box rather than
		of the window. The results share the window with the filter card on a
		desktop, so it is their own width that decides how many cards fit across:
		one on a phone, two on a tablet, and three once there are 56rem to share.
	-->
		<div class="@container">
			<ul class="grid gap-4 @xl:grid-cols-2 @4xl:grid-cols-3">
				<!-- The `(conference.id)` key lets Svelte reuse list items instead of rebuilding them. -->
				{#each rows as conference (conference.id)}
					<li><ConferenceCard {conference} {now} /></li>
				{/each}
			</ul>
		</div>

		<Pagination page={query.page} {pageCount} {hrefForPage} />
	{/if}
</div>

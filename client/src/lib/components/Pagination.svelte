<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import { Button } from '$lib/components/ui/button';

	type Props = {
		/** The page being shown, counting from 1. */
		page: number;
		/** How many pages there are altogether. */
		pageCount: number;
		/**
		 * The address of a given page. Build it with a helper from `$lib/urls.ts`;
		 * a hand-written string is refused by the type check.
		 */
		hrefForPage: (page: number) => ResolvedPathname;
	};

	let { page, pageCount, hrefForPage }: Props = $props();

	const hasPrevious = $derived(page > 1);
	const hasNext = $derived(page < pageCount);
</script>

<!--
	Ordinary links, so every page of results is a real address that can be
	bookmarked, shared, or opened in a new tab. Given an `href`, the shadcn
	`Button` draws a link that looks like an outline button. One page of results
	needs no pager at all. The empty `<span>`s keep "Page 2 of 5" in the middle
	when one of the two links is missing.
-->
{#if pageCount > 1}
	<nav aria-label="Pagination" class="flex items-center justify-between gap-4">
		{#if hasPrevious}
			<Button href={hrefForPage(page - 1)} variant="outline" class="h-11 md:h-9">← Previous</Button>
		{:else}
			<span></span>
		{/if}

		<!-- `tabular-nums` keeps the numbers the same width from page to page. -->
		<span class="text-small text-muted-foreground tabular-nums">Page {page} of {pageCount}</span>

		{#if hasNext}
			<Button href={hrefForPage(page + 1)} variant="outline" class="h-11 md:h-9">Next →</Button>
		{:else}
			<span></span>
		{/if}
	</nav>
{/if}

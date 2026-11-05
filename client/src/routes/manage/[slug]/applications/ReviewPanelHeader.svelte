<script lang="ts">
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import type { ResolvedPathname } from '$app/types';
	import Button from '$lib/components/Button.svelte';

	type Props = {
		/** The applicant's name, which is the panel's heading. */
		applicantName: string;
		/** "Applied 26 September · 1 of 4", under the name. */
		metaLine: string;
		/** The panel showing the row above this one, or null on the first row. */
		previousHref: ResolvedPathname | null;
		/** The panel showing the row below this one, or null on the last row. */
		nextHref: ResolvedPathname | null;
	};

	let { applicantName, metaLine, previousHref, nextHref }: Props = $props();
</script>

<header class="flex items-start justify-between gap-3 border-b border-border pb-4">
	<div class="min-w-0">
		<h2 class="font-display text-lg leading-6.5 font-semibold text-foreground">{applicantName}</h2>
		<p class="mt-0.5 text-small text-muted-foreground">{metaLine}</p>
	</div>

	<!--
		The arrows are plain links to the same list with another `?application=`,
		so they work without JavaScript and the address always says which
		application is open. An arrow with no row to go to is left out.
	-->
	<nav aria-label="Previous and next application" class="flex shrink-0 gap-1">
		{#if previousHref}
			<Button
				label="Previous application"
				variant="ghost"
				size="dense-sm"
				icon={ArrowLeft}
				isLabelHidden
				href={previousHref}
			/>
		{/if}
		{#if nextHref}
			<Button
				label="Next application"
				variant="ghost"
				size="dense-sm"
				icon={ArrowRight}
				isLabelHidden
				href={nextHref}
			/>
		{/if}
	</nav>
</header>

<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import Button from '$lib/components/Button.svelte';
	import BackLink from '$lib/components/manage/BackLink.svelte';

	type Props = {
		/** The applications table, on the same tab, search and page the organiser left. */
		backHref: ResolvedPathname;
		/** The application before this one in that queue, or `null` at its start. */
		previousHref: ResolvedPathname | null;
		/** The application after this one, or `null` at its end. */
		nextHref: ResolvedPathname | null;
	};

	let { backHref, previousHref, nextHref }: Props = $props();
</script>

<!--
	Plain links, so walking the queue works without JavaScript. An end of the
	queue, or an application that has just left it, simply has no link there.
	The link back sits above the title, the way every page that belongs to a
	list starts in the manage redesign.
-->
<nav aria-label="Applications" class="flex flex-wrap items-center justify-between gap-2 lg:mb-2">
	<BackLink href={backHref} label="Applications" />

	<div class="flex gap-2">
		{#if previousHref}
			<Button label="‹ Previous" variant="ghost" size="dense-sm" href={previousHref} />
		{/if}

		{#if nextHref}
			<Button label="Next ›" variant="ghost" size="dense-sm" href={nextHref} />
		{/if}
	</div>
</nav>

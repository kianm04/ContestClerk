<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import Card from './Card.svelte';

	type Props = {
		/** What is being counted, such as "Applications". */
		label: string;
		/** The number itself. A string when it needs a unit, such as "€1,240". */
		value: string | number;
		/** A quiet line under the number, such as "12 since Monday". */
		hint?: string;
		/**
		 * The page that holds what is counted. With it the whole tile is a link
		 * and lifts on hover, so the organiser dashboard's figures lead to the
		 * work (T137). Build it with a helper from `$lib/urls.ts`.
		 */
		href?: ResolvedPathname;
	};

	let { label, value, hint, href }: Props = $props();
</script>

<Card padding="tight" {href}>
	<p class="text-label text-ink-600 uppercase">{label}</p>
	<p class="mt-1 font-display text-h1-mobile md:text-h1">{value}</p>

	{#if hint}
		<p class="text-small text-ink-600">{hint}</p>
	{/if}
</Card>

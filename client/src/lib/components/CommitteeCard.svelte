<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import { committeeHeading, type Committee, type SeatSummary } from '$lib/committees';
	import { statusBadgeTone, statusLabel } from '$lib/status';
	import Badge from './Badge.svelte';
	import Card from './Card.svelte';

	type Props = {
		committee: Committee;
		/** How many of the committee's seats are taken. Left out where it is not known. */
		seatSummary?: SeatSummary;
		/**
		 * When given, the whole card becomes a link to the committee's own page.
		 * Build it with `committeeUrl` from `$lib/urls.ts`; a hand-written string is
		 * refused by the type check.
		 */
		href?: ResolvedPathname;
	};

	let { committee, seatSummary, href }: Props = $props();

	// A committee without a short name shows its full name at the top instead.
	// `committeeHeading` is the one place that rule is written; the committee page's
	// own `<title>` asks the same question.
	const heading = $derived(committeeHeading(committee));
</script>

<Card {href}>
	<div class="flex items-start justify-between gap-2">
		<h3 class="text-h3">{heading}</h3>

		<Badge
			tone={statusBadgeTone('experience_level', committee.level)}
			label={statusLabel('experience_level', committee.level)}
		/>
	</div>

	{#if committee.abbreviation}
		<p class="text-body">{committee.name}</p>
	{/if}

	{#if committee.topics.length > 0}
		<ul class="mt-2 list-inside list-disc text-small text-ink-600">
			<!--
				Topics have no id of their own, and two of them can read the same, so
				the place in the list is the key rather than the words.
			-->
			{#each committee.topics as topic, index (index)}
				<li>{topic}</li>
			{/each}
		</ul>
	{/if}

	{#if seatSummary}
		<p class="mt-2 text-small text-ink-600">
			{seatSummary.taken} of {seatSummary.total} seats taken
		</p>
	{/if}
</Card>

<script lang="ts">
	import { chairPaperReadingUrl } from '$lib/urls';

	type Props = {
		conferenceSlug: string;
		committeeSlug: string;
		/** The seat of the written paper before this one, or `null` for the first. */
		previousSeatId: string | null;
		/** The seat of the written paper after this one, or `null` for the last. */
		nextSeatId: string | null;
	};

	let { conferenceSlug, committeeSlug, previousSeatId, nextSeatId }: Props = $props();

	// `$derived` works this out again when "Previous" or "Next" opens another paper.
	const isOnlyPaper = $derived(previousSeatId === null && nextSeatId === null);
</script>

<!--
	Plain links, so they work without JavaScript. `chairPaperReadingUrl` builds
	each address with `resolve()`, which checks the route exists.
-->
<nav aria-label="Other papers" class="flex flex-wrap justify-between gap-3 text-small">
	{#if isOnlyPaper}
		<span class="text-ink-600">This is the committee's only written paper.</span>
	{:else}
		{#if previousSeatId}
			<a
				href={chairPaperReadingUrl(conferenceSlug, committeeSlug, previousSeatId)}
				class="font-medium text-brand-700 hover:underline"
			>
				← Previous paper
			</a>
		{:else}
			<span class="text-ink-600">This is the first written paper.</span>
		{/if}

		{#if nextSeatId}
			<a
				href={chairPaperReadingUrl(conferenceSlug, committeeSlug, nextSeatId)}
				class="font-medium text-brand-700 hover:underline"
			>
				Next paper →
			</a>
		{:else}
			<span class="text-ink-600">This is the last written paper.</span>
		{/if}
	{/if}
</nav>

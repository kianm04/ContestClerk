<script lang="ts">
	import Award from '@lucide/svelte/icons/award';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import type { ProfileAward } from '$lib/awards';
	import { formatDateRange } from '$lib/dates';

	type Props = {
		/**
		 * The reader's own awards whose conference has published them, newest
		 * first. A conference that scheduled its awards for later adds nothing
		 * here until that moment arrives.
		 */
		awards: ProfileAward[];
	};

	let { awards }: Props = $props();
</script>

{#if awards.length === 0}
	<EmptyState
		icon={Award}
		title="No awards yet."
		description="Awards appear here once a conference publishes them."
	/>
{:else}
	<ul class="divide-y divide-line">
		<!-- The `(award.id)` key lets Svelte reuse rows instead of rebuilding them. -->
		{#each awards as award (award.id)}
			<li class="flex flex-col gap-1 py-3 md:flex-row md:items-baseline md:justify-between">
				<div class="min-w-0">
					<strong class="font-semibold">{award.title}</strong>
					<span class="text-ink-600">· {award.committeeLabel} · {award.conferenceName}</span>
				</div>
				<!-- A range from one day to the same day is written as that day alone. -->
				<time datetime={award.publishedDay} class="text-small text-ink-600">
					{formatDateRange(award.publishedDay, award.publishedDay)}
				</time>
			</li>
		{/each}
	</ul>
{/if}

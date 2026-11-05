<script lang="ts">
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import type { ConferenceHistoryEntry } from '$lib/profiles';
	import { conferenceListUrl } from '$lib/urls';
	import ConferenceHistoryRow from './ConferenceHistoryRow.svelte';

	type Props = {
		/** Every seat held and committee chaired, soonest first. Empty is an ordinary case. */
		entries: ConferenceHistoryEntry[];
	};

	let { entries }: Props = $props();
</script>

{#if entries.length === 0}
	<EmptyState
		icon={CalendarDays}
		title="You have not taken part in a conference yet."
		description="Conferences where you hold a seat or chair a committee appear here."
		actionLabel="Browse conferences"
		actionHref={conferenceListUrl()}
	/>
{:else}
	<ul class="flex flex-col gap-3">
		<!-- The `(entry.id)` key lets Svelte reuse list items instead of rebuilding them. -->
		{#each entries as entry (entry.id)}
			<li>
				<ConferenceHistoryRow {entry} />
			</li>
		{/each}
	</ul>
{/if}

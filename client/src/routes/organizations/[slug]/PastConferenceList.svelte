<script lang="ts">
	import DateRange from '$lib/components/DateRange.svelte';
	import { conferenceLocationLine, type Conference } from '$lib/conferences';
	import { conferenceUrl } from '$lib/urls';

	type Props = {
		/** Conferences that are over, most recently finished first. */
		conferences: Conference[];
	};

	let { conferences }: Props = $props();
</script>

<!-- Plain rows rather than the cards the upcoming conferences get: these are a
	record of what this organisation has run, not something anybody can still
	apply to, so they are quieter and take less room. -->
<ul class="divide-y divide-line">
	<!-- The `(conference.id)` key lets Svelte reuse list items instead of rebuilding them. -->
	{#each conferences as conference (conference.id)}
		<li>
			<a
				href={conferenceUrl(conference.slug)}
				class="flex flex-col gap-1 py-3 hover:bg-brand-50 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
			>
				<span class="text-h3 text-ink-900">{conference.name}</span>

				<span class="flex flex-wrap gap-x-2 text-small text-ink-600">
					<DateRange startDate={conference.startDate} endDate={conference.endDate} />
					<span aria-hidden="true">·</span>
					<!-- The city alone, as the list always had it; "Online" or "Location to be
						announced" for a conference without one. -->
					<span>{conference.city ?? conferenceLocationLine(conference)}</span>
				</span>
			</a>
		</li>
	{/each}
</ul>

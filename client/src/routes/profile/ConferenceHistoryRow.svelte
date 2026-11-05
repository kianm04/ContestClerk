<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Card from '$lib/components/Card.svelte';
	import DateRange from '$lib/components/DateRange.svelte';
	import SeatName from '$lib/components/SeatName.svelte';
	import type { ConferenceHistoryEntry } from '$lib/profiles';
	import { committeeUrl } from '$lib/urls';

	type Props = {
		/** One seat held or one committee chaired. */
		entry: ConferenceHistoryEntry;
	};

	let { entry }: Props = $props();
</script>

<Card href={committeeUrl(entry.conferenceSlug, entry.committeeSlug)} padding="tight">
	<div class="flex items-center gap-3">
		<Avatar name={entry.conferenceName} imagePath={entry.conferenceLogoPath} size="sm" />

		<!-- `min-w-0` lets this column shrink, so a long name wraps instead of
			pushing the badge off the edge of the card.

			Neither line is `truncate`d. That class also sets `white-space: nowrap`,
			and a line that may not wrap is as wide as its text however narrow the
			column is: on a 390px phone that pushed the whole dashboard sideways
			once already. -->
		<div class="min-w-0 flex-1">
			<!-- A real heading, so a screen reader can jump from one to the next; an `<h3>` under its section's `<h2>`. -->
			<h3 class="text-h3">{entry.conferenceName}</h3>

			<!--
				The committee and the seat with its flag, as in "UNSC · France". A
				chair holds no seat, so theirs is the committee on its own. Each case
				is written out whole, so exactly one space sits around every "·".
			-->
			<p class="text-small text-ink-600">
				{#if entry.seatName !== null}
					{entry.committeeHeading} ·
					<SeatName name={entry.seatName} countryCode={entry.seatCountryCode} /> ·
					<DateRange startDate={entry.conferenceStartDate} endDate={entry.conferenceEndDate} />
				{:else}
					{entry.committeeHeading} ·
					<DateRange startDate={entry.conferenceStartDate} endDate={entry.conferenceEndDate} />
				{/if}
			</p>
		</div>

		<Badge tone="brand" label={entry.role} />
	</div>
</Card>

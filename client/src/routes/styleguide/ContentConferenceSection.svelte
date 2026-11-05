<script lang="ts">
	import CommitteeCard from '$lib/components/CommitteeCard.svelte';
	import ConferenceBanner from '$lib/components/ConferenceBanner.svelte';
	import ConferenceCard from '$lib/components/ConferenceCard.svelte';
	import DateRange from '$lib/components/DateRange.svelte';
	import Money from '$lib/components/Money.svelte';
	import {
		SAMPLE_COMMITTEE,
		SAMPLE_CONFERENCE,
		SAMPLE_CONFERENCE_WITHOUT_BANNER,
		SAMPLE_INVOICES
	} from '$lib/styleguide-samples';
	import Example from './Example.svelte';

	/*
	 * The styleguide pins the clock. `ConferenceCard` decides its applications
	 * badge from the moment it is given, and a real page gets that moment from its
	 * `load`. This page has none, and a badge that changed while somebody read the
	 * styleguide would make the examples impossible to talk about.
	 */
	const NOW = new Date('2026-06-01T12:00:00Z');
</script>

<div class="grid min-w-0 gap-4">
	<h3 class="font-display text-h2 text-brand-900">Conferences and money</h3>

	<Example name="ConferenceBanner" props="conference with bannerPath, aspect wide (16:6)">
		<ConferenceBanner conference={SAMPLE_CONFERENCE} aspect="wide" />
	</Example>

	<Example name="ConferenceBanner" props="conference with bannerPath, aspect card (2:1)">
		<ConferenceBanner conference={SAMPLE_CONFERENCE} aspect="card" />
	</Example>

	<Example name="ConferenceBanner" props="conference with bannerPath, aspect listing (3:1)">
		<ConferenceBanner conference={SAMPLE_CONFERENCE} aspect="listing" />
	</Example>

	<Example name="ConferenceBanner" props="bannerPath null, aspect wide · the initials gradient">
		<ConferenceBanner conference={SAMPLE_CONFERENCE_WITHOUT_BANNER} aspect="wide" />
	</Example>

	<Example name="ConferenceBanner" props="bannerPath null, aspect card">
		<ConferenceBanner conference={SAMPLE_CONFERENCE_WITHOUT_BANNER} aspect="card" />
	</Example>

	<Example name="ConferenceCard" props="conference, no role">
		<ConferenceCard conference={SAMPLE_CONFERENCE_WITHOUT_BANNER} now={NOW} />
	</Example>

	<Example name="ConferenceCard" props="conference, role">
		<ConferenceCard conference={SAMPLE_CONFERENCE} now={NOW} role="Delegate" />
	</Example>

	<Example name="CommitteeCard" props="committee, no seatSummary">
		<CommitteeCard committee={SAMPLE_COMMITTEE} />
	</Example>

	<Example name="CommitteeCard" props="committee, seatSummary">
		<CommitteeCard committee={SAMPLE_COMMITTEE} seatSummary={{ taken: 12, total: 15 }} />
	</Example>

	<Example name="DateRange" props="startDate, endDate">
		<DateRange startDate={SAMPLE_CONFERENCE.startDate} endDate={SAMPLE_CONFERENCE.endDate} />
	</Example>

	<Example name="DateRange" props="startDate, endDate, timezone">
		<DateRange
			startDate={SAMPLE_CONFERENCE.startDate}
			endDate={SAMPLE_CONFERENCE.endDate}
			timezone="Europe/Amsterdam"
		/>
	</Example>

	<Example name="Money" props="amountCents, currency · three currencies">
		<ul class="grid gap-1">
			{#each SAMPLE_INVOICES as invoice (invoice.id)}
				<li class="flex flex-wrap justify-between gap-4">
					<span>{invoice.description}</span>
					<Money amountCents={invoice.amountCents} currency={invoice.currency} />
				</li>
			{/each}
		</ul>
	</Example>
</div>

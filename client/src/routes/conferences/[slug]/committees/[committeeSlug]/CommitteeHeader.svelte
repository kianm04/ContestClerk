<script lang="ts">
	import Armchair from '@lucide/svelte/icons/armchair';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import type { Committee, CommitteeChair } from '$lib/committees';
	import Avatar from '$lib/components/Avatar.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import { statusBadgeTone, statusLabel } from '$lib/status';

	type Props = {
		committee: Committee;
		chairs: CommitteeChair[];
		/** How many seats the committee offers, for the "15 seats" line. */
		seatCount: number;
		/**
		 * Whether the reader could see a chair's name if there were one. Signed-out
		 * visitors never can: `committee_chairs` is readable by anybody, but
		 * `profiles` is readable only by somebody signed in
		 * (`02-architecture/permissions.md`), so an empty list means "no chairs yet"
		 * for a signed-in reader and "not for you to see" for a visitor, and the two
		 * must not be told the same thing.
		 */
		isSignedIn: boolean;
	};

	let { committee, chairs, seatCount, isSignedIn }: Props = $props();

	// `$derived` counts this again whenever `seatCount` changes. A committee with
	// one seat is the only size where "seats" would be the wrong word.
	const seatLine = $derived(seatCount === 1 ? '1 seat' : `${seatCount} seats`);
</script>

<header class="flex flex-col gap-3">
	<div class="flex flex-wrap items-center gap-3">
		{#if committee.abbreviation}
			<Badge tone="brand" label={committee.abbreviation} />
		{/if}

		<h1 class="font-display text-h1-mobile text-brand-900 md:text-h1">{committee.name}</h1>

		<Badge
			tone={statusBadgeTone('experience_level', committee.level)}
			label={statusLabel('experience_level', committee.level)}
		/>
	</div>

	<!-- The facts wrap onto a second line on a phone rather than pushing the page sideways. -->
	<div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-ink-600">
		{#if committee.room}
			<span class="flex items-center gap-1">
				<MapPin size={20} strokeWidth={1.75} aria-hidden="true" />
				{committee.room}
			</span>
		{/if}

		<span class="flex items-center gap-1">
			<Armchair size={20} strokeWidth={1.75} aria-hidden="true" />
			{seatLine}
		</span>
	</div>

	<!--
		A visitor who is signed out is shown nothing here at all. Their `chairs` list
		is empty because the database will not hand a profile to somebody signed out,
		not because the committee has no chairs, and "Chairs to be announced" would
		tell them something we do not know to be true.
	-->
	{#if chairs.length > 0}
		<div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-small">
			<span class="text-ink-600">Chairs:</span>

			<!-- One person chairs one committee once, so their user id is the key. -->
			{#each chairs as chair (chair.userId)}
				<span class="flex items-center gap-2">
					<Avatar name={chair.fullName} imagePath={chair.avatarPath} size="sm" />
					{chair.fullName}

					<!-- Most chairs are simply called "Chair", and repeating it after every
						name would say nothing. A vice chair or a rapporteur is worth saying. -->
					{#if chair.title !== 'Chair'}
						<span class="text-ink-600">{chair.title}</span>
					{/if}
				</span>
			{/each}
		</div>
	{:else if isSignedIn}
		<p class="text-small text-ink-600">Chairs to be announced.</p>
	{/if}
</header>

<script lang="ts">
	import Landmark from '@lucide/svelte/icons/landmark';
	import Users from '@lucide/svelte/icons/users';
	import CommitteeCard from '$lib/components/CommitteeCard.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Section from '$lib/components/Section.svelte';
	import type { Committee, SeatSummary } from '$lib/committees';
	import { committeeUrl } from '$lib/urls';

	/**
	 * One committee with how many of its seats are taken, exactly as
	 * `getConferencePage` returned it.
	 *
	 * The shape is written out here rather than imported from
	 * `$lib/server/committees.ts`, because everything under `$lib/server` only
	 * runs on the server and a component may not import from it at all, not even
	 * a type. The two pieces it is made of come from `$lib/committees.ts`, which
	 * both sides share, so the two cannot drift apart.
	 */
	type CommitteeWithSeats = {
		committee: Committee;
		seatSummary: SeatSummary;
	};

	type Props = {
		committees: CommitteeWithSeats[];
		/** The conference the committees belong to, for the link on each card. */
		conferenceSlug: string;
	};

	let { committees, conferenceSlug }: Props = $props();
</script>

<Section
	title="Committees"
	icon={Landmark}
	description="Open a committee to see its topics, its chairs and its seats."
>
	{#if committees.length === 0}
		<EmptyState
			icon={Users}
			title="Committees will be announced soon."
			description="The organisers have not published the committee list yet."
		/>
	{:else}
		<!-- Two columns from a tablet up, one on a phone. -->
		<ul class="grid gap-4 md:grid-cols-2">
			<!-- The `(row.committee.id)` key lets Svelte reuse list items instead of rebuilding them. -->
			{#each committees as row (row.committee.id)}
				<li>
					<CommitteeCard
						committee={row.committee}
						seatSummary={row.seatSummary}
						href={committeeUrl(conferenceSlug, row.committee.slug)}
					/>
				</li>
			{/each}
		</ul>
	{/if}
</Section>

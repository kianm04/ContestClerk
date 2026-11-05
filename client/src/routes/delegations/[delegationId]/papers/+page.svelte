<script lang="ts">
	import FileText from '@lucide/svelte/icons/file-text';
	import Card from '$lib/components/Card.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { delegationPaperHref } from '$lib/delegation-papers';
	import DelegationPaperRow from './DelegationPaperRow.svelte';
	import type { PageProps } from './$types';

	// `data` is what `load` in `+page.server.ts` returned together with what the
	// layout's own `load` above it returned, so the delegation and its conference
	// are in here as well. `PageProps` comes from `./$types`, the types SvelteKit
	// generates for this one route.
	let { data }: PageProps = $props();

	// The moment "5 min ago" is counted from. The list is read afresh on every visit.
	const now = Date.now();
</script>

<svelte:head>
	<!-- Only this delegation's own members can open the page, so it has no link card. -->
	<title>Position papers · {data.delegation.name} · MUNMeet</title>
</svelte:head>

<!--
	One column, so the page keeps to 960px inside the shell. There is no back link
	here: the Overview tab in `+layout.svelte` above is the way back.
-->
<div class="mx-auto max-w-240">
	<div class="mb-6">
		<PageHeader
			title="Position papers"
			subtitle="Everybody in the delegation can open and edit these drafts. Only the delegate in the seat submits."
		/>
	</div>

	{#if data.papers.length === 0}
		<EmptyState
			icon={FileText}
			title="No seats yet."
			description="Once members of the delegation are given seats, their position papers appear here."
		/>
	{:else}
		<Card>
			<!-- `divide-y` draws a line between rows and none above the first one. -->
			<ul class="divide-y divide-line">
				<!-- The `(paper.seatId)` key lets Svelte reuse list items instead of rebuilding them. -->
				{#each data.papers as paper (paper.seatId)}
					<DelegationPaperRow
						{paper}
						href={delegationPaperHref(
							paper,
							data.delegation.id,
							data.conference.slug,
							data.readerId
						)}
						readerId={data.readerId}
						{now}
					/>
				{/each}
			</ul>
		</Card>
	{/if}
</div>

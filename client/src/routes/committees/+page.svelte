<script lang="ts">
	import Users from '@lucide/svelte/icons/users';
	import Button from '$lib/components/Button.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { myApplicationsUrl, myCommitteesUrl } from '$lib/urls';
	import MyCommitteeRow from './MyCommitteeRow.svelte';
	import type { PageProps } from './$types';

	// `data` is whatever `load` in `+page.server.ts` returned. It is replaced
	// with fresh results every time the URL changes, which here means the one
	// link below being followed.
	let { data }: PageProps = $props();

	/*
		The same link both shows the conferences that are over and hides them
		again, so its words and its address are worked out from what the reader is
		looking at now. `$derived` recalculates them whenever `data` changes.

		It sits under the list rather than beside the title, because
		`05-pages/delegate/applications.md` draws it there and T69 made the two
		sibling pages, which take the same `?past=1` parameter, read the same way.
	*/
	const pastLinkLabel = $derived(
		data.includesPast ? 'Hide past conferences' : 'Show past conferences'
	);
	const pastLinkHref = $derived(data.includesPast ? myCommitteesUrl() : myCommitteesUrl(true));
</script>

<svelte:head>
	<title>My committees · MUNMeet</title>
</svelte:head>

<!-- Two cards abreast read best at the 1000px the page file asks for. -->
<div class="mx-auto max-w-250">
	<div class="mb-6">
		<PageHeader title="My committees" />
	</div>

	{#if data.rows.length === 0}
		<EmptyState
			icon={Users}
			title="You are not in a committee yet."
			description="Once an organiser gives you a seat, your committee appears here."
			actionLabel="See your applications"
			actionHref={myApplicationsUrl()}
		/>
	{:else}
		<ul class="grid gap-4 md:grid-cols-2">
			<!--
				The `(row.committee.id)` key lets Svelte reuse list items instead of
				rebuilding them. There is one row per committee, so that id is unique
				even for somebody who sits in one committee and chairs another.
			-->
			{#each data.rows as row (row.committee.id)}
				<li>
					<MyCommitteeRow
						committee={row.committee}
						conference={row.conference}
						role={row.role}
						seat={row.seat ?? undefined}
						nextEvent={row.nextEvent ?? undefined}
						isLive={row.isLive}
						now={data.now}
					/>
				</li>
			{/each}
		</ul>
	{/if}

	<div class="mt-6">
		<!-- A `Button` with an `href` is a link that looks like a button, so this works with no JavaScript. -->
		<Button label={pastLinkLabel} variant="secondary" href={pastLinkHref} />
	</div>
</div>

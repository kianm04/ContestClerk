<script lang="ts">
	import * as Alert from '$lib/components/ui/alert';
	import { unpublishedApplicationsNotice } from '$lib/applications';
	import { conferenceListUrl } from '$lib/urls';
	import ApplicationCard from './ApplicationCard.svelte';
	import ApplicationToolbar from './ApplicationToolbar.svelte';
	import ListMessage from './ListMessage.svelte';
	import NoMatchingApplications from './NoMatchingApplications.svelte';
	import type { PageProps } from './$types';

	// `data` is whatever `load` in `+page.server.ts` returned. It is replaced
	// with fresh results every time the URL changes: a search, a tab or an order.
	let { data }: PageProps = $props();

	// Applications the list cannot show because their conference was unpublished,
	// or `null` when there are none and so nothing to say.
	const unpublishedNotice = $derived(unpublishedApplicationsNotice(data.unpublishedCount));
</script>

<svelte:head>
	<title>Applications · MUNMeet</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<!-- The page title, in the serif that names things (docs/DESIGN.md). -->
	<h1 class="font-display text-h1-mobile text-foreground md:text-h1">Applications</h1>

	<!-- Searching and tabs mean nothing to somebody with no applications at all. -->
	{#if data.hasAnyApplication}
		<ApplicationToolbar query={data.query} counts={data.counts} />
	{/if}

	<!--
		A shadcn `Alert` announces itself at once to a screen reader
		(`role="alert"`), which suits an error. This notice can wait until the
		reader reaches it, so it is a `status` instead.
	-->
	{#if unpublishedNotice !== null}
		<Alert.Root role="status" class="px-4 py-3">
			<Alert.Description>{unpublishedNotice}</Alert.Description>
		</Alert.Root>
	{/if}

	<!--
		"No applications yet" would be untrue beside a notice about applications
		that are hidden, so the empty state waits until there are none of those.
	-->
	{#if data.cards.length > 0}
		<ul class="flex flex-col gap-4">
			<!--
				The `(card.id)` key lets Svelte reuse list items instead of rebuilding
				them. An individual application and a delegation can never share an
				id, so one key is enough for the merged list.
			-->
			{#each data.cards as card (card.id)}
				<li>
					<ApplicationCard {card} />
				</li>
			{/each}
		</ul>
	{:else if data.hasAnyApplication}
		<NoMatchingApplications query={data.query} />
	{:else if unpublishedNotice === null}
		<!-- Browsing is the one thing left to do here, so it is the dark blue button. -->
		<ListMessage
			title="No applications yet."
			description="When you apply to a conference, it appears here."
			actionLabel="Browse conferences"
			actionHref={conferenceListUrl()}
			actionVariant="default"
		/>
	{/if}
</div>

<script lang="ts">
	import Calendar from '@lucide/svelte/icons/calendar';
	import History from '@lucide/svelte/icons/history';
	import ConferenceCard from '$lib/components/ConferenceCard.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Section from '$lib/components/Section.svelte';
	import PageMeta from '$lib/components/shell/PageMeta.svelte';
	import { splitIntoParagraphs } from '$lib/text';
	import { conferenceListUrl } from '$lib/urls';
	import type { PageProps } from './$types';
	import OrganizationHeader from './OrganizationHeader.svelte';
	import PastConferenceList from './PastConferenceList.svelte';

	// `PageProps` comes from `./$types`, which SvelteKit writes for this folder, so
	// `data` is exactly what `load` in `+page.server.ts` returned. It is replaced
	// with fresh data every time the URL changes.
	let { data }: PageProps = $props();

	// `$derived` keeps this up to date when the page is reused for another
	// organisation, for example after following a link from one to the next.
	const organization = $derived(data.organization);

	// The first paragraph of the description, or '' when there is no description.
	const firstParagraph = $derived(splitIntoParagraphs(organization.description ?? '')[0] ?? '');

	// What a shared link and a search result say under the name. `||` takes the
	// first of the two that is not empty, so the written sentence is only used
	// when the organisation has told us nothing about itself.
	const shareDescription = $derived(
		firstParagraph || `The Model UN conferences run by ${organization.name}.`
	);

	// `data.isAdmin` says whether this reader may edit the organisation. The
	// header draws its "Edit organisation" button for them and nobody else.
</script>

<PageMeta title={organization.name} description={shareDescription} imageUrl={data.shareImageUrl} />

<div class="flex flex-col gap-10">
	<OrganizationHeader {organization} isAdmin={data.isAdmin} />

	<Section title="Upcoming conferences" icon={Calendar}>
		{#if data.upcoming.length === 0}
			<EmptyState
				icon={Calendar}
				title="No upcoming conferences."
				description="When this organisation announces its next conference, it appears here."
				actionLabel="Browse all conferences"
				actionHref={conferenceListUrl()}
			/>
		{:else}
			<ul class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
				<!-- The `(conference.id)` key lets Svelte reuse list items instead of rebuilding them. -->
				{#each data.upcoming as conference (conference.id)}
					<li><ConferenceCard {conference} now={data.now} /></li>
				{/each}
			</ul>
		{/if}
	</Section>

	<!-- The page file asks for the whole section to disappear when there is
		nothing in it, rather than for an empty state: an organisation running its
		first conference has no history to apologise for. -->
	{#if data.past.length > 0}
		<!-- The same icon chip as the section above, so the two headings match. -->
		<Section title="Past conferences" icon={History}>
			<PastConferenceList conferences={data.past} />
		</Section>
	{/if}
</div>

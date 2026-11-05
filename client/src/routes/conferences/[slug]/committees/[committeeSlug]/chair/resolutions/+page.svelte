<script lang="ts">
	import AmendmentQueueSection from './AmendmentQueueSection.svelte';
	import DaisSection from './DaisSection.svelte';
	import type { PageProps } from './$types';

	// `data` holds what the chair layout's `load` returned and what this page's
	// `load` added in `+page.server.ts`.
	let { data }: PageProps = $props();

	// *Submitted* comes first, then the amendments waiting for the dais, then the rest.
	const firstSection = $derived(data.sections[0]);
	const laterSections = $derived(data.sections.slice(1));
</script>

<svelte:head>
	<title>{data.title} · {data.committee.name} · MUNMeet</title>
</svelte:head>

<h1 class="font-display text-h1-mobile text-foreground sm:text-[1.875rem]/9">{data.title}</h1>

<!--
	The sections in the order the dais works through them: *Submitted*, the
	amendments, then the papers approved, introduced and decided. The
	`(section.key)` key tells Svelte which section is which when the list loads again.
-->
<div class="mt-8 flex flex-col gap-10">
	<DaisSection
		section={firstSection}
		timeZone={data.conference.timezone}
		conferenceSlug={data.conference.slug}
		committeeSlug={data.committee.slug}
	/>

	<AmendmentQueueSection
		queue={data.amendmentQueue}
		conferenceSlug={data.conference.slug}
		committeeSlug={data.committee.slug}
	/>

	{#each laterSections as section (section.key)}
		<DaisSection
			{section}
			timeZone={data.conference.timezone}
			conferenceSlug={data.conference.slug}
			committeeSlug={data.committee.slug}
		/>
	{/each}
</div>

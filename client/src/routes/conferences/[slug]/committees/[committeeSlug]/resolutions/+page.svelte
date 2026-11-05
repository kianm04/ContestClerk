<script lang="ts">
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import { Button } from '$lib/components/ui/button';
	import { committeeUrl, newCommitteePaperUrl } from '$lib/urls';
	import PaperListSection from './PaperListSection.svelte';
	import type { PageProps } from './$types';

	// `data` is whatever `load` in `+page.server.ts` returned. `PageProps` comes
	// from `./$types`, the types SvelteKit generates for this one route.
	let { data }: PageProps = $props();

	// `$derived` keeps these in step with `data` when the page loads again.
	const conferenceSlug = $derived(data.conference.slug);
	const committeeSlug = $derived(data.committee.slug);
</script>

<svelte:head>
	<title>{data.title} · {data.committee.heading} · {data.conference.name} · MUNMeet</title>
</svelte:head>

<Breadcrumb
	links={[{ href: committeeUrl(conferenceSlug, committeeSlug), label: data.committee.heading }]}
/>

<div class="mt-1 flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
	<h1 class="font-display text-h1-mobile text-foreground sm:text-[1.875rem]/9">{data.title}</h1>

	{#if data.canStart}
		<Button
			href={newCommitteePaperUrl(conferenceSlug, committeeSlug)}
			size="lg"
			class="max-lg:h-11"
		>
			Start a paper
		</Button>
	{/if}
</div>

<!-- The sections in the order a delegate needs them (docs/committee-papers.md, section 6). -->
<div class="mt-8 flex flex-col gap-10">
	{#if data.hasSeat}
		<PaperListSection
			heading="Yours"
			papers={data.sections.yours}
			emptySentence="You are not on a paper yet."
			showsStatus
			{conferenceSlug}
			{committeeSlug}
		/>
	{/if}

	<PaperListSection
		heading="Open for signatures"
		papers={data.sections.openForSignatures}
		emptySentence="No paper is open for signatures."
		{conferenceSlug}
		{committeeSlug}
	/>

	<PaperListSection
		heading="Introduced"
		papers={data.sections.introduced}
		emptySentence="No paper has been introduced."
		{conferenceSlug}
		{committeeSlug}
	/>

	<PaperListSection
		heading={data.title}
		papers={data.sections.passed}
		emptySentence={data.passedSentence}
		{conferenceSlug}
		{committeeSlug}
	/>

	{#if data.pressReleases}
		<PaperListSection
			heading="Press releases"
			papers={data.pressReleases}
			emptySentence="No press release has been published."
			{conferenceSlug}
			{committeeSlug}
		/>
	{/if}
</div>

<script lang="ts">
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Button from '$lib/components/Button.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import ManageHeader from '$lib/components/manage/ManageHeader.svelte';
	import StatStrip from '$lib/components/manage/StatStrip.svelte';
	import { conferenceUrl } from '$lib/urls';
	import AllocationSections from './AllocationSections.svelte';
	import ApplicationsSections from './ApplicationsSections.svelte';
	import ConferenceDaySections from './ConferenceDaySections.svelte';
	import NeedsYou from './NeedsYou.svelte';
	import QuietAction from './QuietAction.svelte';
	import type { PageProps } from './$types';

	// `data` is what `load` in `+page.server.ts` returned together with what the
	// layout above it loaded, because a page also receives everything its
	// layouts read. It is replaced after every action on this page. `form` is
	// what the last action returned, and is `null` until one of them has refused.
	let { data, form }: PageProps = $props();

	/* Every word on the dashboard was written by `load` with the
	   `$lib/dashboard-*` modules, so this page only puts the phase's sections in
	   the order `05-pages/organiser/dashboard.md` gives. A draft never gets here:
	   `load` sends it on to its next setup step. */
	const slug = $derived(data.conference.slug);
	const sections = $derived(data.sections);
</script>

<svelte:head>
	<!-- A private page has nothing to share, so it writes its own title rather
		than using `PageMeta`, which asks for a description for the link card. -->
	<title>{data.conference.name} · MUNMeet</title>
</svelte:head>

<ManageHeader title={data.conference.name} summary={data.summary}>
	<Button
		label="View public page"
		variant="secondary"
		size="dense"
		icon={ExternalLink}
		isIconAfterLabel
		href={conferenceUrl(slug)}
	/>
</ManageHeader>

<div class="flex flex-col gap-9">
	{#if form?.message}
		<Notice tone="error">{form.message}</Notice>
	{/if}

	{#if data.figures.length > 0}
		<StatStrip stats={data.figures} />
	{/if}

	<!--
		`sections.phase` says which sections there are. Inside each branch Svelte
		knows the other fields that phase has, such as `sections.waiting`.
	-->
	{#if sections.phase === 'conference-days'}
		<ConferenceDaySections
			{sections}
			attentionTitle={data.attentionTitle}
			attention={data.attention}
			conferenceSlug={slug}
		/>
	{:else}
		<NeedsYou
			title={data.attentionTitle}
			items={data.attention}
			isFirstPrimary={data.isFirstAttentionLinePrimary}
		/>
	{/if}

	{#if sections.phase === 'applications'}
		<ApplicationsSections {sections} conferenceSlug={slug} />
	{:else if sections.phase === 'allocation'}
		<AllocationSections {sections} conferenceSlug={slug} />
	{/if}

	{#if data.quietAction}
		<QuietAction action={data.quietAction} conferenceName={data.conference.name} />
	{/if}
</div>

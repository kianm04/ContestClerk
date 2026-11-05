<script lang="ts">
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import CommitteePaperSheet from '$lib/components/paper-writing/CommitteePaperSheet.svelte';
	import { committeeUrl, crisisDeskUrl } from '$lib/urls';
	import CrisisPanel from '../../resolutions/[paperId]/CrisisPanel.svelte';
	import CrisisAnswerForm from './CrisisAnswerForm.svelte';
	import type { PageProps } from './$types';

	// `data` is whatever `load` in `+page.server.ts` returned; `form` is what
	// the answer action sent back when it refused, or `null`.
	let { data, form }: PageProps = $props();

	// `$derived` keeps these in step with `data` when the page loads again.
	const conferenceSlug = $derived(data.conference.slug);
	const committeeSlug = $derived(data.committee.slug);
	const deskHref = $derived(crisisDeskUrl(conferenceSlug, committeeSlug));
	// What the action sent back with its refusal, so the typed answer is not lost.
	const typed = $derived(
		form && 'answer' in form ? { answer: form.answer, error: form.error } : null
	);
</script>

<svelte:head>
	<title>{data.paper.title} · Crisis staff · {data.committee.heading} · MUNMeet</title>
</svelte:head>

<Breadcrumb
	links={[
		{ href: committeeUrl(conferenceSlug, committeeSlug), label: data.committee.heading },
		{ href: deskHref, label: 'Crisis staff' }
	]}
/>

<h1 class="mt-1 font-display text-h1-mobile text-foreground sm:text-[1.875rem]/9">
	{data.paper.title}
</h1>
<p class="mt-1 text-small text-muted-foreground tabular-nums">{data.metaLine}</p>

<!-- The text first, then the answer: on a desktop the answer sits beside the text. -->
<div class="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-8">
	<div class="min-w-0">
		<CommitteePaperSheet html={data.bodyHtml} label={data.textLabel} />
	</div>
	<div class="min-w-0">
		{#if data.answered}
			<CrisisPanel panel={data.answered} />
		{:else if data.choices.length > 0}
			<CrisisAnswerForm choices={data.choices} {typed} backHref={deskHref} />
		{/if}
	</div>
</div>

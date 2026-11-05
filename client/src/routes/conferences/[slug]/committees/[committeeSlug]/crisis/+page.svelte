<script lang="ts">
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import { committeeUrl } from '$lib/urls';
	import CrisisDeskList from './CrisisDeskList.svelte';
	import CrisisUpdateForm from './CrisisUpdateForm.svelte';
	import type { PageProps } from './$types';

	// `data` is whatever `load` in `+page.server.ts` returned; `form` is what
	// the "Send update" action answered with when it refused, or `null`.
	// `PageProps` comes from `./$types`, the types SvelteKit generates for this route.
	let { data, form }: PageProps = $props();

	// `$derived` keeps these in step with `data` when the page loads again.
	const conferenceSlug = $derived(data.conference.slug);
	const committeeSlug = $derived(data.committee.slug);
	const timeZone = $derived(data.conference.timezone);
	// What the action sent back with its refusal, so the typed update is not lost.
	const typed = $derived(
		form && 'message' in form ? { message: form.message, error: form.error } : null
	);
</script>

<svelte:head>
	<title>Crisis staff · {data.committee.heading} · {data.conference.name} · MUNMeet</title>
</svelte:head>

<Breadcrumb
	links={[{ href: committeeUrl(conferenceSlug, committeeSlug), label: data.committee.heading }]}
/>

<h1 class="mt-1 font-display text-h1-mobile text-foreground sm:text-[1.875rem]/9">Crisis staff</h1>

<!-- What waits first, oldest at the top, since it is the next to answer (section 6). -->
<div class="mt-8 flex flex-col gap-10">
	<CrisisDeskList
		heading="Waiting for an answer"
		items={data.sections.waiting}
		emptySentence="Nothing is waiting for an answer."
		{conferenceSlug}
		{committeeSlug}
		{timeZone}
	/>

	<CrisisUpdateForm update={data.update} {typed} {timeZone} />

	<CrisisDeskList
		heading="Answered"
		items={data.sections.answered}
		emptySentence="Nothing has been answered yet."
		showsStatus
		{conferenceSlug}
		{committeeSlug}
		{timeZone}
	/>
</div>

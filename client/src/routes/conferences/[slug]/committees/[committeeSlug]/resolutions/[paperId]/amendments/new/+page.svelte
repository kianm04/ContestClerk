<script lang="ts">
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import { Button } from '$lib/components/ui/button';
	import { committeePaperUrl, committeePapersUrl, committeeUrl } from '$lib/urls';
	import AmendmentFields from './AmendmentFields.svelte';
	import AmendmentTextField from './AmendmentTextField.svelte';
	import type { PageProps } from './$types';

	// `data` is what `load` returned. `form` is what `propose` answered when it
	// refused, holding what was typed; an amendment proposed opens its draft instead.
	let { data, form }: PageProps = $props();

	const values = $derived(form?.values ?? data.values);
	const errors = $derived(form?.errors ?? {});
	const conferenceSlug = $derived(data.conference.slug);
	const committeeSlug = $derived(data.committee.slug);
	const title = $derived(
		data.parent === null ? 'Propose an amendment' : `Amend ${data.parent.name.toLowerCase()}`
	);
</script>

<svelte:head>
	<title>{title} · {data.paper.name} · {data.committee.heading} · MUNMeet</title>
</svelte:head>

<Breadcrumb
	links={[
		{ href: committeeUrl(conferenceSlug, committeeSlug), label: data.committee.heading },
		{ href: committeePapersUrl(conferenceSlug, committeeSlug), label: data.papersTitle },
		{
			href: committeePaperUrl(conferenceSlug, committeeSlug, data.paper.id),
			label: data.paper.name
		}
	]}
/>

<h1 class="mt-1 font-display text-h1-mobile text-foreground sm:text-[1.875rem]/9">{title}</h1>
<p class="mt-1 text-small text-muted-foreground">{data.paper.name} · {data.paper.title}</p>

<!-- One column, 42rem wide, labels above fields; it works without JavaScript. -->
<form method="post" action="?/propose" class="mt-8 flex max-w-2xl flex-col gap-6">
	{#if data.parent}
		<!--
			"Amend this amendment" changes the amendment's own words, so the form
			is only those words. Its sentence is safe HTML from `renderMarkdown`
			on the server, which `{@html}` draws as HTML instead of as text.
		-->
		<p class="text-body text-foreground">
			<span class="font-semibold">{data.parent.name}:</span>
			<!-- eslint-disable-next-line svelte/no-at-html-tags -- made safe on the server, as said above -->
			{@html data.parent.sentenceHtml}
		</p>
		<AmendmentTextField
			label="Its words as amended"
			value={values.text}
			error={errors.text}
			help={null}
		/>
	{:else}
		<AmendmentFields
			content={data.content}
			isPreambleAmendable={data.isPreambleAmendable}
			{values}
			{errors}
		/>
	{/if}

	<div>
		<Button type="submit" size="lg" class="max-lg:h-11">Propose amendment</Button>
	</div>
</form>

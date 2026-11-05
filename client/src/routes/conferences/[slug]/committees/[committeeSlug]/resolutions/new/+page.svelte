<script lang="ts">
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import FieldError from '$lib/components/FieldError.svelte';
	import FormSelect, { type FormSelectOption } from '$lib/components/FormSelect.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { PAPER_TITLE_MAX_LENGTH } from '$lib/committee-papers';
	import { fieldErrorId, fieldId, labelClasses } from '$lib/form-fields';
	import KindFields from './KindFields.svelte';
	import { committeePapersUrl, committeeUrl } from '$lib/urls';
	import type { PageProps } from './$types';

	// `data` is what `load` returned. `form` is what `start` answered when it
	// refused, holding what was typed; a paper that was started opens instead.
	let { data, form }: PageProps = $props();

	const values = $derived(form?.values ?? data.values);
	const errors = $derived(form?.errors ?? {});
	const conferenceSlug = $derived(data.conference.slug);
	const committeeSlug = $derived(data.committee.slug);

	const topicOptions: FormSelectOption[] = $derived(
		data.topics.map((topic) => ({ value: topic, label: topic }))
	);

	/*
		What the title box holds: the title the server sent back, then whatever
		is typed. `bind:value` keeps letters typed before the page came to life,
		and `sentTitle` in between means only a different title starts it over,
		as `$lib/components/TextField.svelte` explains in full.
	*/
	const sentTitle = $derived(values.title);
	let titleText = $derived(sentTitle);
</script>

<svelte:head>
	<title>Start a paper · {data.committee.heading} · {data.conference.name} · MUNMeet</title>
</svelte:head>

<Breadcrumb
	links={[
		{ href: committeeUrl(conferenceSlug, committeeSlug), label: data.committee.heading },
		{ href: committeePapersUrl(conferenceSlug, committeeSlug), label: data.papersTitle }
	]}
/>

<h1 class="mt-1 font-display text-h1-mobile text-foreground sm:text-[1.875rem]/9">Start a paper</h1>

<!-- One column, 42rem wide, labels above fields; it works without JavaScript. -->
<form method="post" action="?/start" class="mt-8 flex max-w-2xl flex-col gap-6">
	<KindFields
		kindOptions={data.kindOptions}
		kind={values.kind}
		kindError={errors.kind}
		basedOnChoices={data.basedOnChoices}
		sourcePaperIds={values.sourcePaperIds}
	/>

	<!-- shadcn's box, as tall as the topic's dropdown: 44px to a finger, 2.25rem from `lg` up. -->
	<div>
		<label for={fieldId('title')} class={labelClasses(true)}>Title</label>
		<Input
			id={fieldId('title')}
			name="title"
			bind:value={titleText}
			required
			maxlength={PAPER_TITLE_MAX_LENGTH}
			aria-invalid={errors.title ? 'true' : undefined}
			aria-describedby={errors.title ? fieldErrorId('title') : undefined}
			class="h-11 lg:h-9"
		/>
		<FieldError id={fieldErrorId('title')} message={errors.title} />
	</div>

	<!-- A committee without topics writes papers without one, and sends none. -->
	{#if topicOptions.length > 0}
		<div>
			<!-- The same label as the title's, so the two fields read as one form. -->
			<label for={fieldId('topic')} class={labelClasses(true)}>Topic</label>
			<FormSelect
				id={fieldId('topic')}
				name="topic"
				value={values.topic ?? ''}
				options={topicOptions}
				placeholder="Choose a topic"
			/>
			<FieldError id={fieldErrorId('topic')} message={errors.topic} />
		</div>
	{/if}

	<div>
		<Button type="submit" size="lg" class="max-lg:h-11">Start writing</Button>
	</div>
</form>

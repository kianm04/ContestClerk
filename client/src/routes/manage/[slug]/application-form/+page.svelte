<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Button from '$lib/components/Button.svelte';
	import FormActions from '$lib/components/FormActions.svelte';
	import ManageHeader from '$lib/components/manage/ManageHeader.svelte';
	import StepFooter from '$lib/components/manage/StepFooter.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { findSetupStep, setupStepEyebrow, setupSteps } from '$lib/setup-steps';
	import { applyUrl } from '$lib/urls';
	import ApplicationWindowSection from './ApplicationWindowSection.svelte';
	import QuestionsSection from './QuestionsSection.svelte';
	import WhatTheFormAsksSection from './WhatTheFormAsksSection.svelte';
	import WhoCanApplySection from './WhoCanApplySection.svelte';
	import WindowNotice from './WindowNotice.svelte';
	import type { PageProps } from './$types';

	// `data` is what `load` in `+page.server.ts` returned together with what the
	// layout above it loaded, which is where the conference comes from. `load`
	// runs again after every action, so nothing below is ever stale. `form` is
	// what the last action returned: the ones that work redirect instead, so
	// `form` is always a refusal.
	let { data, form }: PageProps = $props();

	/** The `id` of the settings form, which the footer's "Save and continue" sends. */
	const SETTINGS_FORM_ID = 'application-form-settings';

	/** What the header says while the conference is being set up. */
	const SETUP_SUMMARY =
		'The last thing needed before you can publish: say how long people have to apply.';

	// `$derived` works each of these out again whenever `data` or `form` changes.
	// A refused post sends back everything that was typed, so nothing is lost;
	// otherwise the fields show what is saved.
	const windowValues = $derived(form?.windowValues ?? data.windowForm);
	const windowErrors = $derived(form?.windowErrors ?? {});
	const settingsValues = $derived(form?.settingsValues ?? data.settingsForm);
	const settingsErrors = $derived(form?.settingsErrors ?? {});
	const questionValues = $derived(form?.questionValues ?? data.questionForm);
	const questionErrors = $derived(form?.questionErrors ?? {});

	// The six setup steps while the conference is a draft, and null once it is
	// published, when this page is an ordinary settings page with no footer.
	const steps = $derived(
		data.setupProgress === null ? null : setupSteps(data.conference.slug, data.setupProgress)
	);
	const eyebrow = $derived(
		steps === null ? undefined : setupStepEyebrow(findSetupStep(steps, 'application-form'))
	);

	// Sends the form in the background and redraws the page without reloading it
	// (`$lib/in-place-form.svelte.ts`). `use:enhance` in the markup hands the
	// form over; without JavaScript it posts and reloads the page as before.
	const settingsForm = createInPlaceForm();
</script>

<svelte:head>
	<!-- A private page has nothing to share, so it writes its own title rather
		than using `PageMeta`, which asks for a description for the link card. -->
	<title>Application form · {data.conference.name} · MUNMeet</title>
</svelte:head>

<ManageHeader
	title="Application form"
	{eyebrow}
	summary={steps === null ? undefined : SETUP_SUMMARY}
>
	<!-- Opens the page a delegate sees. While the conference is a draft that page
		draws the form under a "Preview" banner rather than refusing, which is
		what `specs/05-pages/organiser/application-form.md` asks for. -->
	<Button
		label="Preview apply page"
		variant="secondary"
		size="dense"
		icon={ExternalLink}
		isIconAfterLabel
		href={applyUrl(data.conference.slug)}
	/>
</ManageHeader>

<div class="flex flex-col gap-3">
	<WindowNotice conference={data.conference} now={data.now} />

	{#if form?.message}
		<Notice tone="error">{form.message}</Notice>
	{/if}
</div>

<!--
	One form for the three settings sections, so one press saves them all. It
	is an ordinary HTML form, so the page works with JavaScript switched off.
-->
<form id={SETTINGS_FORM_ID} method="post" action="?/save" use:enhance={settingsForm.submit}>
	<ApplicationWindowSection
		values={windowValues}
		errors={windowErrors}
		timezone={data.conference.timezone}
	/>
	<WhoCanApplySection values={windowValues} errors={windowErrors} />
	<WhatTheFormAsksSection
		values={settingsValues}
		errors={settingsErrors}
		isPreferenceCountLocked={data.applicationCount > 0}
	/>

	<!-- While a draft, the footer below saves this form instead. -->
	{#if steps === null}
		<FormActions>
			<Button
				label="Save changes"
				variant="primary"
				size="dense"
				type="submit"
				isLoading={settingsForm.isBusy}
			/>
		</FormActions>
	{/if}
</form>

<!-- The line above "Your own questions", which the sections inside the form draw for themselves. -->
<div class="border-t border-border">
	<QuestionsSection
		questions={data.questions}
		values={questionValues}
		errors={questionErrors}
		conferenceSlug={data.conference.slug}
	/>
</div>

{#if steps}
	<StepFooter
		{steps}
		current="application-form"
		formId={SETTINGS_FORM_ID}
		isLoading={settingsForm.isBusy}
	/>
{/if}

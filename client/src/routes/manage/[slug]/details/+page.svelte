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
	import { conferenceUrl } from '$lib/urls';
	import AboutSection from './AboutSection.svelte';
	import AudienceSection from './AudienceSection.svelte';
	import ContactSection from './ContactSection.svelte';
	import PicturesSection from './PicturesSection.svelte';
	import PlaceAndDatesSection from './PlaceAndDatesSection.svelte';
	import type { PageProps } from './$types';

	// `data` is what `load` in `+page.server.ts` returned together with what the
	// layout above it loaded, which is where the conference itself comes from.
	// `form` is what the last action returned, and is `null` until one of them
	// has refused: an action that worked redirects instead of returning.
	let { data, form }: PageProps = $props();

	/** What the error notice says when the fields themselves are what need fixing. */
	const FIELDS_FAILURE_MESSAGE =
		'Please fix the fields below. If you chose a picture, choose it again: a browser cannot keep a file for you.';

	/** The `id` of the details form, which the footer's "Save and continue" sends. */
	const DETAILS_FORM_ID = 'conference-details';

	/** The `id` of the small form the two "Remove" buttons send. */
	const REMOVE_PICTURE_FORM_ID = 'remove-picture';

	// A refused save sends back everything that was typed, so nothing is lost.
	// Until one has been refused there is nothing to send back, and the page
	// shows what is saved. `$derived` works both out again on every new `form`.
	const values = $derived(form?.values ?? data.values);
	const errors = $derived(form?.errors ?? {});

	// `message` is filled in when the fault was ours, and is null when the form
	// is what needs fixing, so the two cases share one notice.
	const failureMessage = $derived(form ? (form.message ?? FIELDS_FAILURE_MESSAGE) : null);

	// The six setup steps while the conference is a draft, and null once it is
	// published, when this page is an ordinary settings page with no footer.
	const steps = $derived(
		data.setupProgress === null ? null : setupSteps(data.conference.slug, data.setupProgress)
	);
	const eyebrow = $derived(
		steps === null ? undefined : setupStepEyebrow(findSetupStep(steps, 'details'))
	);

	// Sends a form in the background and redraws the page without reloading it
	// (`$lib/in-place-form.svelte.ts`). `use:enhance` in the markup hands each
	// form over; without JavaScript they post and reload the page as before.
	// This edits the conference's own details, so it is never emptied after a save.
	const detailsForm = createInPlaceForm();
	const removePictureForm = createInPlaceForm();
</script>

<svelte:head>
	<!-- A private page has nothing to share, so it writes its own title rather
		than using `PageMeta`, which asks for a description for the link card. -->
	<title>Details · {data.conference.name} · MUNMeet</title>
</svelte:head>

<ManageHeader title="Details" {eyebrow}>
	<!--
		The spec asks for the public page in a new tab, and `Button` has no way
		to open one. The dashboard's own "View public page" is the same link in
		the same tab, and what the criterion is really about is that a draft can
		be read at all by the staff who are working on it.
	-->
	<Button
		label="Preview public page"
		variant="secondary"
		size="dense"
		icon={ExternalLink}
		isIconAfterLabel
		href={conferenceUrl(data.conference.slug)}
	/>
</ManageHeader>

<div class="flex flex-col gap-3">
	{#if data.conference.status === 'published'}
		<Notice tone="info">This conference is public. Changes appear immediately.</Notice>
	{/if}

	{#if failureMessage}
		<Notice tone="error">{failureMessage}</Notice>
	{/if}
</div>

<!--
	One form for the whole page, so one press saves the text and both pictures
	together. `enctype="multipart/form-data"` is what lets a form carry files at
	all, and it is an ordinary HTML form, so the page works with JavaScript off.
-->
<form
	id={DETAILS_FORM_ID}
	method="post"
	action="?/save"
	enctype="multipart/form-data"
	use:enhance={detailsForm.submit}
>
	<AboutSection {values} {errors} />
	<PicturesSection
		conference={data.conference}
		{errors}
		removeFormId={REMOVE_PICTURE_FORM_ID}
		isSending={removePictureForm.isSending}
	/>
	<PlaceAndDatesSection {values} {errors} timezoneOptions={data.timezoneOptions} />
	<AudienceSection
		{values}
		{errors}
		levelOptions={data.levelOptions}
		currencyOptions={data.currencyOptions}
		isCurrencyLocked={data.isCurrencyLocked}
	/>
	<ContactSection {values} {errors} />

	<!-- While a draft, the footer below saves this form instead. -->
	{#if steps === null}
		<FormActions>
			<Button
				label="Save changes"
				variant="primary"
				size="dense"
				type="submit"
				isLoading={detailsForm.isBusy}
			/>
		</FormActions>
	{/if}
</form>

<!--
	The "Remove" buttons sit among the pictures but belong to this empty form,
	through their `form` attribute; a form cannot sit inside another. Were they
	buttons of the details form, the first of them would be the button that
	pressing Enter in any field presses, and Enter would take a picture away.
-->
<form id={REMOVE_PICTURE_FORM_ID} method="post" use:enhance={removePictureForm.submit}></form>

{#if steps}
	<StepFooter {steps} current="details" formId={DETAILS_FORM_ID} isLoading={detailsForm.isBusy} />
{/if}

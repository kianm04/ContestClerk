<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import CheckboxField from '$lib/components/CheckboxField.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import TextArea from '$lib/components/TextArea.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import {
		ANNOUNCEMENT_BODY_MAX_LENGTH,
		ANNOUNCEMENT_TITLE_MAX_LENGTH,
		type AnnouncementFormErrors,
		type AnnouncementFormValues,
		type AudienceCount
	} from '$lib/announcement-form';
	import type { AnnouncementGroup } from '$lib/announcements';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { pressedAction } from '$lib/row-changes';
	import { manageAnnouncementsUrl } from '$lib/urls';
	import AudiencePicker from './AudiencePicker.svelte';

	type Props = {
		/** What the fields show: a new announcement, the one being edited, or what was typed. */
		values: AnnouncementFormValues;
		/** One message per field that has something wrong with it. */
		errors: AnnouncementFormErrors;
		/** Whether everyone, the delegates and the staff are offered, or only a committee. */
		mayAddressConference: boolean;
		committees: AnnouncementGroup[];
		delegations: AnnouncementGroup[];
		/** Who the audience was last counted as, or null when it has not been counted. */
		audienceCount: AudienceCount | null;
		conferenceSlug: string;
		/**
		 * Send publishing and saving through this: the page's instant form
		 * (`$lib/instant-form.svelte.ts`), which shows the new or changed row at
		 * once with no spinner (T142).
		 */
		onSubmit: SubmitFunction;
	};

	let {
		values,
		errors,
		mayAddressConference,
		committees,
		delegations,
		audienceCount,
		conferenceSlug,
		onSubmit
	}: Props = $props();

	// `$derived` works these out again whenever the props change.
	const isEditing = $derived(values.announcementId !== '');
	const heading = $derived(isEditing ? 'Edit announcement' : 'New announcement');
	const submitAction = $derived(isEditing ? '?/update' : '?/publish');
	const submitLabel = $derived(isEditing ? 'Save changes' : 'Post announcement');
	const cancelHref = $derived(manageAnnouncementsUrl(conferenceSlug));

	/*
		"Preview recipients" asks the database how many people an audience
		reaches, which the browser cannot work out for itself, so it keeps the
		older `createInPlaceForm` helper (`$lib/in-place-form.svelte.ts`) and its
		own spinner. Publishing and saving an edit are sent through `onSubmit`
		instead, which shows the result at once.
	*/
	const inPlaceForm = createInPlaceForm();

	/** Routes "Preview recipients" through `inPlaceForm`, and every other button through `onSubmit`. */
	const submitForm: SubmitFunction = (input) => {
		if (pressedAction(input.action) === '?/preview') return inPlaceForm.submit(input);

		return onSubmit(input);
	};
</script>

<!--
	An ordinary HTML form, so posting works with JavaScript switched off.
	`group` lets the audience picker inside show the committee or delegation
	list only while it is chosen; `AudiencePicker` explains how.
-->
<form
	method="post"
	action={submitAction}
	class="group flex flex-col gap-4"
	use:enhance={submitForm}
>
	<h2 class="border-b border-foreground pb-2 text-h3 text-foreground">{heading}</h2>

	<input type="hidden" name="announcementId" value={values.announcementId} />

	<TextField
		isDense
		label="Title"
		name="title"
		value={values.title}
		error={errors.title}
		isRequired
		maxLength={ANNOUNCEMENT_TITLE_MAX_LENGTH}
	/>

	<TextArea
		isDense
		label="Message"
		name="body"
		value={values.body}
		error={errors.body}
		rows={5}
		isRequired
		maxLength={ANNOUNCEMENT_BODY_MAX_LENGTH}
	/>

	<!-- An announcement keeps the audience it was published with, so an edit cannot change it. -->
	{#if isEditing}
		<Notice tone="info">Editing does not send a new notification.</Notice>
	{:else}
		<AudiencePicker
			choice={values}
			{errors}
			{mayAddressConference}
			{committees}
			{delegations}
			{audienceCount}
			isPreviewSending={inPlaceForm.isSending('?/preview')}
		/>
	{/if}

	<CheckboxField label="Pin to the top" name="isPinned" isChecked={values.isPinned} />

	<div class="flex flex-wrap gap-3">
		<Button label={submitLabel} variant="primary" size="dense" type="submit" />
		{#if isEditing}
			<Button label="Cancel" variant="secondary" size="dense" href={cancelHref} />
		{/if}
	</div>
</form>

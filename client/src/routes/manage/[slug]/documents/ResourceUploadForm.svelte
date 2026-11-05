<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import FileField from '$lib/components/FileField.svelte';
	import SelectField from '$lib/components/SelectField.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import FormSection from '$lib/components/manage/FormSection.svelte';
	import {
		DOCUMENT_AUDIENCE_OPTIONS,
		DOCUMENT_MAX_SIZE_MB,
		RESOURCE_ACCEPTED_TYPES
	} from '$lib/documents';
	import {
		RESOURCE_TITLE_MAX_LENGTH,
		type ResourceFormErrors,
		type ResourceFormValues
	} from '$lib/documents-page';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { manageDocumentsActionUrl } from '$lib/urls';

	type Props = {
		/** What was typed before a refusal, or `null` for an empty form. */
		values: ResourceFormValues | null;
		/** One message per field that has something wrong with it. */
		errors: ResourceFormErrors;
		conferenceSlug: string;
	};

	let { values, errors, conferenceSlug }: Props = $props();

	// `$derived` works these out again whenever the props change, which is
	// after every refused upload.
	const title = $derived(values?.title ?? '');
	const audience = $derived(values?.audience ?? 'delegates');
	const uploadAction = $derived(manageDocumentsActionUrl(conferenceSlug, {}, 'uploadResource'));

	// Sends the form in the background and redraws the page without reloading
	// it (`$lib/in-place-form.svelte.ts`). `use:enhance` in the markup hands the
	// form over; without JavaScript it posts and reloads the page as before. A
	// saved file empties the fields, the way a reload would leave them.
	const inPlaceForm = createInPlaceForm({ isResetAfterSave: true });
</script>

<!--
	`enctype="multipart/form-data"` is what makes a form send the file itself
	rather than only its name. A browser can never put a chosen file back into
	a file box, so after a refusal the title and audience come back and the
	file has to be chosen again.

	`id="upload-document"` is where the page header's "Upload document" link
	jumps to, and `scroll-mt-24` keeps the form clear of the sticky bar at the
	top of the window.
-->
<form
	id="upload-document"
	method="post"
	action={uploadAction}
	enctype="multipart/form-data"
	class="mt-8 scroll-mt-24 border-t border-border"
	use:enhance={inPlaceForm.submit}
>
	<FormSection
		title="Upload a document"
		description="Give delegates or chairs a file to download. It appears in the table above."
	>
		<TextField
			label="Title"
			name="title"
			value={title}
			error={errors.title}
			isRequired
			maxLength={RESOURCE_TITLE_MAX_LENGTH}
			isDense
		/>

		<FileField
			label="File"
			name="file"
			accept={RESOURCE_ACCEPTED_TYPES}
			maxSizeMb={DOCUMENT_MAX_SIZE_MB}
			help="A PDF, an image or a Word document."
			error={errors.file}
			isDense
		/>

		<SelectField
			label="Audience"
			name="audience"
			value={audience}
			options={DOCUMENT_AUDIENCE_OPTIONS}
			error={errors.audience}
			isDense
		/>

		<div>
			<Button label="Upload" variant="primary" size="dense" isLoading={inPlaceForm.isBusy} />
		</div>
	</FormSection>
</form>

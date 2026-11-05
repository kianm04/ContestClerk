<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import FileField from '$lib/components/FileField.svelte';
	import SelectField from '$lib/components/SelectField.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import {
		DOCUMENT_MAX_SIZE_MB,
		GUIDE_AUDIENCE_OPTIONS,
		PDF_ACCEPTED_TYPES,
		formatFileSize,
		type BackgroundGuide
	} from '$lib/documents';

	type Props = {
		/** The committee's guide now, or null when it has none. */
		guide: BackgroundGuide | null;
		/** The title a new guide gets, such as "UNSC background guide". */
		defaultTitle: string;
		/** What was typed before a refused upload, so it is not lost; null otherwise. */
		typed: { title: string; audience: string } | null;
		/** Why the last upload was refused, or null. */
		error: string | null;
		uploadAction: string;
		removeAction: string;
	};

	let { guide, defaultTitle, typed, error, uploadAction, removeAction }: Props = $props();

	// `$derived` works these out again after every action on the page. The
	// audience starts on the saved one, so a replacement does not widen it.
	const title = $derived(typed?.title ?? guide?.title ?? defaultTitle);
	const audience = $derived(typed?.audience ?? guide?.audience ?? 'delegates');

	// This upload stays on the older in-place form rather than the instant one
	// (T141): whether a chosen file will be accepted, and what its saved name
	// and size will be, cannot be known until the server has actually read it,
	// so there is nothing honest to show at once. It sends the form in the
	// background and redraws the page without reloading it
	// (`$lib/in-place-form.svelte.ts`). `use:enhance` in the markup hands the
	// form over; without JavaScript it posts and reloads the page as before.
	// The file box empties once the guide is saved.
	const uploadForm = createInPlaceForm({ isResetAfterSave: true });
	const audienceLabel = $derived(
		GUIDE_AUDIENCE_OPTIONS.find((option) => option.value === guide?.audience)?.label ?? ''
	);
</script>

<section
	aria-labelledby="guide-heading"
	class="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4"
>
	<h2 id="guide-heading" class="font-display text-h2">Background guide</h2>

	{#if guide}
		<p class="text-body">
			{guide.fileName}
			<span class="text-ink-600">· {formatFileSize(guide.fileSizeBytes)} · {audienceLabel}</span>
			{#if guide.downloadUrl}
				<!-- A signed Storage address, not a page of this app, so `resolve()` does not apply. -->
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a
					href={guide.downloadUrl}
					target="_blank"
					rel="noopener"
					class="ml-2 text-small font-medium text-brand-700 hover:underline"
				>
					Download
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/if}
		</p>
	{:else}
		<p class="text-body text-ink-600">Delegates see this on the committee page.</p>
	{/if}

	<!-- `multipart/form-data` is what carries the file itself rather than only its name. -->
	<form
		method="post"
		action={uploadAction}
		enctype="multipart/form-data"
		class="flex flex-col gap-4"
		use:enhance={uploadForm.submit}
	>
		<FileField
			label={guide ? 'Replace with' : 'Guide'}
			name="file"
			accept={PDF_ACCEPTED_TYPES}
			maxSizeMb={DOCUMENT_MAX_SIZE_MB}
			{error}
		/>
		<TextField label="Title" name="title" value={title} maxLength={120} />
		<SelectField
			label="Who can download it"
			name="audience"
			value={audience}
			options={GUIDE_AUDIENCE_OPTIONS}
		/>
		<div>
			<Button
				label={guide ? 'Replace' : 'Upload'}
				variant="secondary"
				isLoading={uploadForm.isBusy}
			/>
		</div>
	</form>

	<!-- A sibling of the upload form, because `ConfirmButton` is a form of its own. -->
	{#if guide}
		<ConfirmButton
			label="Remove guide"
			confirmTitle="Remove this background guide?"
			confirmText="Delegates can no longer download it from the committee page."
			formaction={removeAction}
			variant="ghost"
			size="sm"
		>
			<input type="hidden" name="documentId" value={guide.id} />
		</ConfirmButton>
	{/if}
</section>

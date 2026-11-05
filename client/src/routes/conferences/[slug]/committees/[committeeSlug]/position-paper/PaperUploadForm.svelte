<script lang="ts">
	import Upload from '@lucide/svelte/icons/upload';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import FileField from '$lib/components/FileField.svelte';
	import Section from '$lib/components/Section.svelte';
	import { DOCUMENT_MAX_SIZE_MB, PDF_ACCEPTED_TYPES } from '$lib/documents';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { paperWayAction } from '$lib/paper-writing';

	type Props = {
		/** Whether this seat already has a paper, so the button says "Replace" rather than "Upload". */
		isReplacing: boolean;
		/** The problem the last upload had, if any, shown under the file box. */
		error?: string | null;
	};

	let { isReplacing, error = null }: Props = $props();

	// Sends the form in the background and redraws the page without reloading
	// it (`$lib/in-place-form.svelte.ts`). `use:enhance` in the markup hands the
	// form over; without JavaScript it posts and reloads the page as before.
	// The file box empties once the paper is saved.
	const uploadForm = createInPlaceForm({ isResetAfterSave: true });

	// `?way=upload&/upload`, so the page drawn after a refused upload stays on this way.
	const UPLOAD_ACTION = paperWayAction('upload', 'upload');

	const buttonLabel = $derived(isReplacing ? 'Replace position paper' : 'Upload position paper');
</script>

<Section title="Upload" icon={Upload}>
	<!--
		`enctype="multipart/form-data"` is what lets a `<form>` carry a real file
		rather than just its name; without it the `upload` action would receive an
		empty box whatever was chosen. Nothing here needs JavaScript: a plain post
		to the `upload` action works with it turned off, and `use:enhance` only sends it in
		the background when JavaScript is on.
	-->
	<form
		method="post"
		action={UPLOAD_ACTION}
		enctype="multipart/form-data"
		class="flex flex-col gap-4"
		use:enhance={uploadForm.submit}
	>
		<FileField
			label="Position paper"
			name="file"
			accept={PDF_ACCEPTED_TYPES}
			maxSizeMb={DOCUMENT_MAX_SIZE_MB}
			{error}
		/>

		<div>
			<Button label={buttonLabel} variant="primary" isLoading={uploadForm.isBusy} />
		</div>
	</form>
</Section>

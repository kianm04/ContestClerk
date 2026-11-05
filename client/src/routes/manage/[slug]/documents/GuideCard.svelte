<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import FileField from '$lib/components/FileField.svelte';
	import SelectField from '$lib/components/SelectField.svelte';
	import StatusDot from '$lib/components/manage/StatusDot.svelte';
	import {
		DOCUMENT_MAX_SIZE_MB,
		GUIDE_AUDIENCE_OPTIONS,
		PDF_ACCEPTED_TYPES,
		formatFileSize
	} from '$lib/documents';
	import type { CommitteeGuide } from '$lib/documents';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { manageDocumentsActionUrl } from '$lib/urls';

	type Props = {
		/** One committee and the guide it has now, if any. */
		committee: CommitteeGuide;
		/** Why this committee's last upload was refused, or `null`. */
		error: string | null;
		conferenceSlug: string;
		/** `BackgroundGuideList`'s shared instant form for "Delete guide". */
		onDelete: SubmitFunction;
	};

	let { committee, error, conferenceSlug, onDelete }: Props = $props();

	// `$derived` works these out again after every action on this page. The
	// audience starts on the saved one, so a replacement does not widen it.
	const guide = $derived(committee.guide);
	const chosenAudience = $derived(guide?.audience ?? 'delegates');
	const uploadLabel = $derived(guide ? 'Replace' : 'Upload');

	// Both actions keep `?tab=guides`, so the organiser comes back to this tab.
	const uploadAction = $derived(
		manageDocumentsActionUrl(conferenceSlug, { tab: 'guides' }, 'uploadBackgroundGuide')
	);
	const deleteAction = $derived(
		manageDocumentsActionUrl(conferenceSlug, { tab: 'guides' }, 'deleteDocument')
	);

	/*
		Sends the form in the background and redraws the page without reloading
		it (`$lib/in-place-form.svelte.ts`). `use:enhance` in the markup hands the
		form over; without JavaScript it posts and reloads the page as before. The
		file box is emptied after a successful upload, because a browser never
		lets a page set one back to the file it already held.
	*/
	const inPlaceForm = createInPlaceForm({ isResetAfterSave: true });
</script>

<!-- One committee's line in `BackgroundGuideList`: its guide and the form that uploads it. -->
<article class="flex flex-col gap-4 px-1 py-5">
	<div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
		<h2 class="text-body font-semibold text-foreground">{committee.committeeHeading}</h2>
		<StatusDot text={guide ? 'Uploaded' : 'Missing'} tone={guide ? 'success' : 'warning'} />
	</div>

	{#if guide}
		<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-dense">
			<p class="text-foreground">
				{guide.fileName}
				<span class="text-muted-foreground">({formatFileSize(guide.fileSizeBytes)})</span>
			</p>

			<!-- A one-minute Storage address; `BackgroundGuidePanel.svelte` explains the rule switched off. -->
			{#if guide.downloadUrl}
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a
					href={guide.downloadUrl}
					target="_blank"
					rel="noreferrer"
					title="Link valid for one minute"
					class="text-link hover:underline"
				>
					Download
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/if}

			<!-- Outside the upload form, because `ConfirmButton` is a form of its own. It
				is a grey bin that turns red under the pointer; "Delete guide" is its name. -->
			<ConfirmButton
				label="Delete guide"
				confirmTitle="Delete this background guide?"
				confirmText="Delegates of {committee.committeeHeading} can no longer download it."
				formaction={deleteAction}
				variant="quiet-danger"
				size="dense-sm"
				icon={Trash2}
				areFieldsInDialog
				onSubmit={onDelete}
			>
				<input type="hidden" name="documentId" value={guide.id} />
			</ConfirmButton>
		</div>
	{/if}

	<!-- `multipart/form-data` is what carries the file itself rather than only its name. -->
	<form
		method="post"
		action={uploadAction}
		enctype="multipart/form-data"
		class="flex flex-wrap items-start gap-x-4 gap-y-3"
		use:enhance={inPlaceForm.submit}
	>
		<input type="hidden" name="committeeId" value={committee.committeeId} />

		<div class="min-w-0 flex-[1_1_16rem]">
			<FileField
				label="Background guide for {committee.committeeHeading}"
				name="file"
				idKey="guide-file-{committee.committeeId}"
				accept={PDF_ACCEPTED_TYPES}
				maxSizeMb={DOCUMENT_MAX_SIZE_MB}
				help="One PDF per committee."
				error={error ?? undefined}
				isDense
			/>
		</div>

		<div class="min-w-0 flex-[1_1_14rem]">
			<SelectField
				label="Who can download it"
				name="audience"
				idKey="guide-audience-{committee.committeeId}"
				value={chosenAudience}
				options={GUIDE_AUDIENCE_OPTIONS}
				isDense
			/>
		</div>

		<div class="w-full">
			<Button label={uploadLabel} variant="secondary" size="dense" isLoading={inPlaceForm.isBusy} />
		</div>
	</form>
</article>

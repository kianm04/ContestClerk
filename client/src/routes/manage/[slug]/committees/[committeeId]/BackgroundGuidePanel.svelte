<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import FileField from '$lib/components/FileField.svelte';
	import RadioGroup from '$lib/components/RadioGroup.svelte';
	import FormSection from '$lib/components/manage/FormSection.svelte';
	import {
		DOCUMENT_MAX_SIZE_MB,
		GUIDE_AUDIENCE_OPTIONS,
		PDF_ACCEPTED_TYPES,
		type BackgroundGuide
	} from '$lib/documents';
	import { describeGuideRemovalFailure, guideAfterPresses } from '$lib/committee-editor-presses';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { createInstantForm } from '$lib/instant-form.svelte';
	import { pressedAction } from '$lib/row-changes';
	import GuideFileLine from './GuideFileLine.svelte';

	type Props = {
		/** The guide this committee has now, or `null` when it has none. */
		guide: BackgroundGuide | null;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { guide }: Props = $props();

	/*
		`$derived` works both out again after every action on this page. The
		audience starts on whatever the saved guide says, so replacing a file does
		not quietly widen who may download it.
	*/
	const chosenAudience = $derived(guide?.audience ?? 'delegates');

	/*
		"Remove guide" goes through an instant form (`$lib/instant-form.svelte.ts`):
		the guide disappears the moment it is pressed, and a refused press brings
		it back with a toast (T142). An upload cannot be shown before the server
		has the file, so it stays on the in-place form below. `handleSubmit`
		hands each press to the right one.
	*/
	const removeGuideForm = createInstantForm({ describeFailure: describeGuideRemovalFailure });
	const shownGuide = $derived(guideAfterPresses(guide, removeGuideForm.presses));
	const uploadLabel = $derived(shownGuide ? 'Replace guide' : 'Upload guide');

	/*
		Sends whichever button was pressed in the background and redraws the page
		without reloading it (`$lib/in-place-form.svelte.ts`); without JavaScript
		the form still posts and reloads the page as before. This form edits the
		guide that is already saved, so `isResetAfterSave` is wrong here: it would
		clear the whole form, including which "Who can download it" option is
		picked, and a save straight after would then be refused for not saying
		who the guide is for. The file box is different: a browser can never show
		a chosen file again after a reload either, so `clearChosenFile` empties
		just that one box, saved or refused, to match what a reload always did
		(the same reasoning as `OrganizationDetailsForm.svelte`'s `clearChosenLogo`).
	*/
	const inPlaceForm = createInPlaceForm({ onSettle: clearChosenFile });

	function clearChosenFile(formElement: HTMLFormElement) {
		const fileField = formElement.querySelector<HTMLInputElement>('input[name="guide"]');
		if (fileField) fileField.value = '';
	}

	const handleSubmit: SubmitFunction = (input) => {
		if (pressedAction(input.action) === '?/removeGuide') return removeGuideForm.submit(input);

		return inPlaceForm.submit(input);
	};
</script>

<FormSection title="Background guide" description="The PDF delegates read to prepare.">
	<!--
		One `<form>` for the whole section, with `enctype="multipart/form-data"`,
		which is what carries a file rather than only its name. The cross in the
		guide's row sends the same form to `?/removeGuide` through `formaction`,
		because a second `<form>` around it would be a form inside a form.
	-->
	<form
		method="post"
		action="?/uploadGuide"
		enctype="multipart/form-data"
		class="flex flex-col gap-5"
		use:enhance={handleSubmit}
	>
		{#if shownGuide}
			<GuideFileLine guide={shownGuide} />
		{:else}
			<p class="text-dense text-muted-foreground">
				No background guide yet. Delegates read it to prepare for the debate.
			</p>
		{/if}

		<RadioGroup
			legend="Who can download it"
			name="audience"
			value={chosenAudience}
			options={GUIDE_AUDIENCE_OPTIONS}
			isDense
		/>

		<!-- `FileField` can print the name of the file already uploaded, and it is
			deliberately not told one: the row above already gives the name and the
			size, and "Replace guide" below says what choosing another one does. -->
		<FileField
			label="Background guide"
			name="guide"
			accept={PDF_ACCEPTED_TYPES}
			maxSizeMb={DOCUMENT_MAX_SIZE_MB}
			help="One PDF per committee."
			isDense
		/>

		<div>
			<Button
				label={uploadLabel}
				variant="secondary"
				size="dense"
				isLoading={inPlaceForm.isSending('?/uploadGuide')}
			/>
		</div>
	</form>
</FormSection>

<script lang="ts">
	import ClipboardList from '@lucide/svelte/icons/clipboard-list';
	import Plus from '@lucide/svelte/icons/plus';
	import type { ResolvedPathname } from '$app/types';
	import { enhance } from '$app/forms';
	import type { ApplicationQuestion } from '$lib/application-questions';
	import IconCircle from '$lib/components/creation/IconCircle.svelte';
	import type { CreationDraft, PreviousConference } from '$lib/creation-draft';
	import type { ApplicationsFormErrors, ApplicationsFormValues } from '$lib/creation-setup-forms';
	import { dialogAction } from '$lib/creation-setup-dialog';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { createSetupDialogUrl } from '$lib/urls';
	import ApplicationsOpeningFields from './ApplicationsOpeningFields.svelte';
	import ApplicationsWhoFields from './ApplicationsWhoFields.svelte';
	import DialogActions from './DialogActions.svelte';
	import DialogFrame from './DialogFrame.svelte';
	import DialogQuestionRow from './DialogQuestionRow.svelte';
	import LastYearFormButton from './LastYearFormButton.svelte';

	type Props = {
		values: ApplicationsFormValues;
		errors: ApplicationsFormErrors;
		draft: CreationDraft;
		previous: PreviousConference | null;
		questions: ApplicationQuestion[];
		committeeCount: number;
		closeHref: ResolvedPathname;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { values, errors, draft, previous, questions, committeeCount, closeHref }: Props = $props();

	const FORM_ID = 'applications-form';
	const saveForm = createInPlaceForm();
</script>

<!--
	The design's dialog is 626 pixels wide with a 56 pixel circle left of the
	title: the box becomes a two-column grid, the circle (passed as `above`, a
	snippet: a piece of markup handed to a component) spans the title's two
	rows, and everything after spans both columns.
-->
<DialogFrame
	title="Applications"
	description="Configure how people can apply to your conference."
	width={626}
	class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 pt-3.75 pr-4.75 pb-2.75 pl-5"
	titleClass="fs-28 lh-34"
	descriptionClass="mt-0 fs-16 lh-22"
	closeClass="top-4.75 right-4.75 size-6"
	above={circle}
	{closeHref}
>
	{#if previous !== null && previous.questionCount > 0 && questions.length === 0}
		<LastYearFormButton />
	{/if}

	<div class="col-span-2 lg:mx-2.5">
		<!--
			The settings are one form. Save sits outside it, in the footer, and
			joins it by its `form` attribute.
		-->
		<form
			id={FORM_ID}
			method="POST"
			action={dialogAction('saveApplications', 'applications')}
			use:enhance={saveForm.submit}
		>
			<ApplicationsOpeningFields {values} {errors} {draft} />
			<ApplicationsWhoFields {values} {errors} {committeeCount} />
		</form>

		<section aria-labelledby="dialog-questions-title" class="mt-2.5">
			<h3 id="dialog-questions-title" class="fs-17 lh-22 font-semibold text-creation-ink-950">
				Custom questions
			</h3>
			{#if questions.length > 0}
				<!-- Keyed by id, so Svelte keeps each row with its question. -->
				<ol class="mt-2 flex flex-col gap-2">
					{#each questions as question (question.id)}
						<DialogQuestionRow slug={draft.slug} {question} />
					{/each}
				</ol>
			{/if}
			<a
				href={createSetupDialogUrl(draft.slug, 'question')}
				class="mt-2 flex h-10 items-center justify-center gap-3.5 rounded-md bg-creation-note fs-16 lh-22 font-semibold text-creation-blue transition-colors hover:bg-creation-hover max-lg:min-h-11"
			>
				<Plus class="size-5" aria-hidden="true" />
				Add question
			</a>
		</section>
	</div>

	<!-- The design's footer: Cancel 88 and Save 130 pixels wide, 17 pixel words. -->
	<DialogActions
		submitLabel="Save changes"
		layout="end"
		{closeHref}
		isBusy={saveForm.isBusy}
		form={FORM_ID}
		class="col-span-2 mt-3.25"
		buttonClass="w-22 fs-17 lh-24 [&[type=submit]]:w-32.5"
	/>
</DialogFrame>

{#snippet circle()}
	<IconCircle icon={ClipboardList} class="row-span-2" />
{/snippet}

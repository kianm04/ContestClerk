<script lang="ts">
	import FileText from '@lucide/svelte/icons/file-text';
	import type { ResolvedPathname } from '$app/types';
	import { enhance } from '$app/forms';
	import {
		isChoiceType,
		isQuestionType,
		QUESTION_HELP_TEXT_MAX_LENGTH,
		QUESTION_LABEL_MAX_LENGTH,
		type QuestionFormErrors,
		type QuestionFormValues
	} from '$lib/application-questions';
	import FieldError from '$lib/components/FieldError.svelte';
	import { dialogAction } from '$lib/creation-setup-dialog';
	import { fieldErrorId } from '$lib/form-fields';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import DialogActions from './DialogActions.svelte';
	import DialogFrame from './DialogFrame.svelte';
	import DialogTitleIcon from './DialogTitleIcon.svelte';
	import QuestionOptionsField from './QuestionOptionsField.svelte';
	import QuestionPreview from './QuestionPreview.svelte';
	import QuestionTextField from './QuestionTextField.svelte';
	import QuestionTypeFields from './QuestionTypeFields.svelte';

	type Props = {
		values: QuestionFormValues;
		errors: QuestionFormErrors & { form?: string };
		/** Named in the question's example placeholder. */
		conferenceName: string;
		closeHref: ResolvedPathname;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { values, errors, conferenceName, closeHref }: Props = $props();

	// Writable `$derived`: what is typed now, which the preview beside it follows.
	let label = $derived(values.label);
	let helpText = $derived(values.helpText);
	let type = $derived(values.type);
	let options = $derived(values.options);
	let required = $derived(values.isRequired ? 'required' : 'optional');

	const isNew = $derived(values.questionId === '');
	const hasOptions = $derived(isQuestionType(type) && isChoiceType(type));
	const saveForm = createInPlaceForm();
</script>

<!--
	The Add question board: a 96 pixel header with the icon circle beside the
	title, a rule, the form and the live preview side by side, a rule, and a
	64 pixel band of buttons. The box itself has no padding; each band carries
	its own. The icon sits in the header's corner and the title moves right
	past it (20 + 56 + 22 pixels), since the frame draws the title itself.
-->
<DialogFrame
	title={isNew ? 'Add question' : 'Edit question'}
	description="Create a custom question for the application form."
	width={858}
	class="p-0 pt-4.5"
	titleClass="ml-24.5 mr-16 fs-30 lh-36 max-lg:ml-20"
	descriptionClass="ml-24.5 mr-16 mt-0.5 fs-15 lh-22 max-lg:ml-20"
	closeClass="top-6 right-5 text-creation-ink-800"
	{closeHref}
>
	{#snippet above()}
		<DialogTitleIcon
			icon={FileText}
			tone="brand"
			class="absolute top-5 left-5 size-14 max-lg:size-12"
			iconClass="size-7"
		/>
	{/snippet}
	<div
		class="mt-4.25 flex gap-4.25 border-t border-creation-rule pr-4 pl-6 max-lg:flex-col max-lg:px-4 max-lg:pb-4 lg:h-134.75"
	>
		<form
			id="question-form"
			method="POST"
			action={dialogAction(isNew ? 'addQuestion' : 'updateQuestion', 'question', values.questionId)}
			use:enhance={saveForm.submit}
			class="pt-5.5 lg:w-124.5 lg:shrink-0"
		>
			<input type="hidden" name="questionId" value={values.questionId} />
			<FieldError id={fieldErrorId('form')} message={errors.form} />
			<QuestionTextField
				id="label"
				label="Question"
				maxLength={QUESTION_LABEL_MAX_LENGTH}
				placeholder="e.g. Why do you want to participate in {conferenceName}?"
				heightClass="h-18"
				error={errors.label}
				bind:value={label}
			/>
			<QuestionTextField
				id="helpText"
				label="Help text"
				labelNote="(optional)"
				maxLength={QUESTION_HELP_TEXT_MAX_LENGTH}
				placeholder="Provide additional context or instructions for applicants."
				heightClass="h-18.5"
				error={errors.helpText}
				class="mt-4.5"
				bind:value={helpText}
			/>
			<QuestionTypeFields bind:type bind:required error={errors.type} />
			<QuestionOptionsField bind:options {hasOptions} error={errors.options} />
		</form>
		<QuestionPreview
			{label}
			{helpText}
			{type}
			{options}
			{conferenceName}
			isRequired={required === 'required'}
		/>
	</div>

	<DialogActions
		submitLabel={isNew ? 'Add question' : 'Save changes'}
		layout="end"
		{closeHref}
		isBusy={saveForm.isBusy}
		form="question-form"
		class="mt-0 h-16.25 border-t border-creation-rule px-4 py-3.25 *:gap-3.25 max-lg:h-auto"
		buttonClass="h-9.5"
	/>
</DialogFrame>

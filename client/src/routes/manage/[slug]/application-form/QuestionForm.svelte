<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import CheckboxField from '$lib/components/CheckboxField.svelte';
	import FormActions from '$lib/components/FormActions.svelte';
	import FieldRow from '$lib/components/manage/FieldRow.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import SelectField from '$lib/components/SelectField.svelte';
	import TextArea from '$lib/components/TextArea.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import {
		MAX_QUESTIONS,
		QUESTION_HELP_TEXT_MAX_LENGTH,
		QUESTION_LABEL_MAX_LENGTH,
		QUESTION_TYPE_OPTIONS,
		type QuestionFormErrors,
		type QuestionFormValues
	} from '$lib/application-questions';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { manageApplicationFormUrl } from '$lib/urls';

	type Props = {
		/** What the fields show: an empty form, the question being edited, or what was typed. */
		values: QuestionFormValues;
		/** One message per field that has something wrong with it. */
		errors: QuestionFormErrors;
		/** True when the form is saving an existing question rather than adding one. */
		isEditing: boolean;
		/** True when the conference already has as many questions as it may have. */
		isFull: boolean;
		conferenceSlug: string;
	};

	let { values, errors, isEditing, isFull, conferenceSlug }: Props = $props();

	/*
		Which action the form posts to travels on the button rather than in the
		form's `action`, the way the fee form carries its own two: a `formaction`
		is an ordinary HTML attribute, so the right action is posted to with
		JavaScript switched off as well.
	*/
	const submitAction = $derived(isEditing ? '?/updateQuestion' : '?/addQuestion');
	const submitLabel = $derived(isEditing ? 'Save question' : 'Add question');
	const heading = $derived(isEditing ? 'Edit this question' : 'Add a question');

	/*
		Both adding and saving an edit redirect back to the plain list address,
		which closes the edit and shows an empty "Add a question" form again, so
		emptying the fields here after either one matches what that reload does.
	*/
	// Sends the form in the background and redraws the page without reloading
	// it (`$lib/in-place-form.svelte.ts`). `use:enhance` in the markup hands the
	// form over; without JavaScript it posts and reloads the page as before.
	const inPlaceForm = createInPlaceForm({ isResetAfterSave: true });
</script>

{#if isFull && !isEditing}
	<Notice tone="warning">
		You can add up to {MAX_QUESTIONS} questions. Delete one to add another.
	</Notice>
{:else}
	<!--
		An ordinary HTML form, so adding and editing a question both work with
		JavaScript switched off.

		The heading, and the line the last question draws under itself, are what
		keep the boxes from reading as part of that question.
	-->
	<form method="post" class="flex flex-col gap-5 pt-2" use:enhance={inPlaceForm.submit}>
		<h3 class="text-dense font-semibold text-foreground">{heading}</h3>

		{#if isEditing}
			<input type="hidden" name="questionId" value={values.questionId} />
		{/if}

		<!-- Two to a row on anything wider than a phone, so the form stays short
			enough to take in at a glance. -->
		<FieldRow columns={2}>
			<TextField
				label="Question"
				name="label"
				value={values.label}
				error={errors.label}
				isRequired
				maxLength={QUESTION_LABEL_MAX_LENGTH}
				isDense
			/>

			<TextField
				label="Help text"
				name="helpText"
				value={values.helpText}
				error={errors.helpText}
				help="A quiet line under the question on the apply form."
				maxLength={QUESTION_HELP_TEXT_MAX_LENGTH}
				isDense
			/>
		</FieldRow>

		<!--
			The options box is always in the HTML rather than appearing once a choice
			type is picked: the page has to work with JavaScript switched off, and
			the server is what refuses an empty one for the two choice types.
		-->
		<FieldRow columns={2}>
			<SelectField
				label="Type"
				name="type"
				value={values.type}
				error={errors.type}
				options={QUESTION_TYPE_OPTIONS}
				isRequired
				isDense
			/>

			<TextArea
				label="Options"
				name="options"
				value={values.options}
				error={errors.options}
				rows={3}
				help="One per line. Only the two choice types use them."
				isDense
			/>
		</FieldRow>

		<CheckboxField label="Required" name="isRequired" isChecked={values.isRequired} />

		<FormActions>
			{#if isEditing}
				<Button
					label="Cancel"
					variant="secondary"
					size="dense"
					href={manageApplicationFormUrl(conferenceSlug)}
				/>
			{/if}
			<Button
				label={submitLabel}
				variant="primary"
				size="dense"
				formaction={submitAction}
				isLoading={inPlaceForm.isBusy}
			/>
		</FormActions>
	</form>
{/if}

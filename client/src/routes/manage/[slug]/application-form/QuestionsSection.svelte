<script lang="ts">
	import FormSection from '$lib/components/manage/FormSection.svelte';
	import {
		MAX_QUESTIONS,
		type ApplicationQuestion,
		type QuestionFormErrors,
		type QuestionFormValues
	} from '$lib/application-questions';
	import QuestionForm from './QuestionForm.svelte';
	import QuestionsList from './QuestionsList.svelte';

	type Props = {
		/** The conference's own questions, in the order the apply form asks them. */
		questions: ApplicationQuestion[];
		/** What the question form shows: an empty form, the question being edited, or what was typed. */
		values: QuestionFormValues;
		/** One message per field of the question form that has something wrong with it. */
		errors: QuestionFormErrors;
		/** The conference's slug, for the links out of each row. */
		conferenceSlug: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { questions, values, errors, conferenceSlug }: Props = $props();

	/*
		The question form is an editor whenever it carries a question's id: `load`
		puts one there for `?edit=`, and a refused save hands the same id straight
		back. Reading it from the form rather than from the address is what keeps
		the editor open after a refusal, because posting to `?/updateQuestion`
		replaces the `?edit=` in the address. `$derived` works both of these out
		again whenever the props change.
	*/
	const isEditing = $derived(values.questionId !== '');
	const isFull = $derived(questions.length >= MAX_QUESTIONS);
</script>

<!--
	Not part of the settings form above it: each question is saved, moved and
	deleted on its own, with forms of their own, and a form cannot sit inside
	another form.
-->
<FormSection
	title="Your own questions"
	description="Up to {MAX_QUESTIONS} extra questions, asked in this order."
>
	<QuestionsList {questions} {conferenceSlug} />

	<QuestionForm {values} {errors} {isEditing} {isFull} {conferenceSlug} />
</FormSection>

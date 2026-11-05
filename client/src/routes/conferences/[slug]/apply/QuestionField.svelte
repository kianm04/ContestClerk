<script lang="ts">
	import CheckboxField from '$lib/components/CheckboxField.svelte';
	import FieldError from '$lib/components/FieldError.svelte';
	import SelectField, { type SelectOption } from '$lib/components/SelectField.svelte';
	import TextArea from '$lib/components/TextArea.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import { ANSWER_MAX_LENGTH, type ApplicationAnswer } from '$lib/applications';
	import type { ApplicationQuestion } from '$lib/application-questions';
	import { LABEL_CLASSES, fieldErrorId, fieldId } from '$lib/form-fields';

	type Props = {
		/** The question to ask, as the organiser wrote it. */
		question: ApplicationQuestion;
		/** The answer so far: a list for a multiple choice, a piece of text for the other four. */
		value: ApplicationAnswer;
		/** What is wrong with the answer, or nothing when all is well. */
		error?: string;
	};

	let { question, value, error }: Props = $props();

	// Every field of this question is sent under the question's own id, so an
	// answer can never be read as the answer to a different question. `$derived`
	// works these out again whenever the question or the answer changes.
	const name = $derived(`question_${question.id}`);
	const help = $derived(question.helpText ?? undefined);

	// A multiple choice holds a list and every other type holds text, so each of
	// the two takes the half of `value` that belongs to it and leaves the other
	// one empty.
	const textValue = $derived(Array.isArray(value) ? '' : value);

	/*
		Which choices are ticked now. It is a `$derived` that may also be assigned
		to, which is what lets `bind:group` below put the reader's ticks into it
		while it still follows the prop whenever the page sends a different
		answer. `$lib/components/TextField.svelte` explains in full why every
		control in this app binds rather than being written to.
	*/
	let checkedOptions = $derived(Array.isArray(value) ? value : []);

	const options: SelectOption[] = $derived(
		question.options.map((option) => ({ value: option, label: option }))
	);
</script>

<!-- One field per kind of question. The five branches are the five values of
	the `question_type` enum. The two text boxes stop at the length the
	database holds an answer to, so typing can never end in a refused save. -->
{#if question.type === 'short_text'}
	<TextField
		label={question.label}
		{name}
		value={textValue}
		{help}
		error={error ?? null}
		isRequired={question.isRequired}
		maxLength={ANSWER_MAX_LENGTH}
	/>
{:else if question.type === 'long_text'}
	<TextArea
		label={question.label}
		{name}
		value={textValue}
		{help}
		error={error ?? null}
		isRequired={question.isRequired}
		rows={4}
		maxLength={ANSWER_MAX_LENGTH}
	/>
{:else if question.type === 'single_choice'}
	<SelectField
		label={question.label}
		{name}
		value={textValue}
		{options}
		{help}
		error={error ?? null}
		isRequired={question.isRequired}
		placeholder="Pick an answer"
	/>
{:else if question.type === 'multiple_choice'}
	<!--
		A group of tick boxes is one question, so it is a `<fieldset>` with the
		question as its `<legend>`: that is what tells a screen reader which
		question the boxes belong to. They all carry the same `name` and each one
		sends its own option, which is how the server reads every ticked one at
		once.

		An option is a plain string with no id of its own, so its place in the
		list is the key, the way `KeyValueList` and `Timeline` key theirs.
	-->
	<!-- The group carries the id every other control gets from `fieldId`, because
		it has no single input to aim at and the apply form takes the reader to the
		first field with a message under it. -->
	<fieldset id={fieldId(name)}>
		<legend class={LABEL_CLASSES}>{question.label}</legend>

		{#if help}
			<p class="mb-1 text-small text-ink-600">{help}</p>
		{/if}

		{#each question.options as option, index (index)}
			<label class="flex min-h-11 items-center gap-3 py-2 text-body">
				<input
					type="checkbox"
					{name}
					value={option}
					bind:group={checkedOptions}
					aria-describedby={error ? fieldErrorId(name) : undefined}
					class="h-5 w-5 shrink-0 rounded border-line text-brand-700"
				/>
				{option}
			</label>
		{/each}

		<FieldError id={fieldErrorId(name)} message={error} />
	</fieldset>
{:else}
	<!--
		`checkbox` is the one kind of question that is a single tick box.
		`CheckboxField` carries no message of its own, so the error goes under it.
		A browser sends nothing at all for a box nobody ticked, and
		`readApplicationForm` stores what does arrive as 'yes'; the box is
		therefore ticked whenever any answer was saved.
	-->
	<div>
		<CheckboxField
			label={question.label}
			{name}
			isChecked={textValue !== ''}
			{help}
			describedById={error ? fieldErrorId(name) : undefined}
		/>
		<FieldError id={fieldErrorId(name)} message={error} />
	</div>
{/if}

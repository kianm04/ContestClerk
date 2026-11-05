<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import {
		controlClasses,
		labelClasses,
		fieldDescribedBy,
		fieldErrorId,
		fieldHelpId,
		fieldId
	} from '$lib/form-fields';
	import FieldError from './FieldError.svelte';

	type Props = {
		/** The words above the input. */
		label: string;
		/** The name the value is sent under when the form is submitted. */
		name: string;
		/** What the server sent back, so a failed submit keeps what was typed. */
		value: string;
		/** The kind of input. Browsers show their own picker for `date` and `number`. */
		type?: 'text' | 'email' | 'password' | 'date' | 'datetime-local' | 'time' | 'number' | 'url';
		/** What is wrong with the value, if anything. */
		error?: string | null;
		/** A quiet line under the field explaining what to put in it. */
		help?: string;
		isRequired?: boolean;
		placeholder?: string;
		/** What the browser may fill in by itself, such as `email` or `new-password`. */
		autocomplete?: HTMLInputAttributes['autocomplete'];
		/** The shortest the value may be. The password fields ask for eight. */
		minLength?: number;
		maxLength?: number;
		/** For `number`, `date` and `datetime-local`. Money uses `step=0.01` and `min=0`. */
		min?: string | number;
		max?: string | number;
		step?: string | number;
		/**
		 * What the field's ids are built from, `name` when left out. A page that
		 * draws the same form more than once gives each copy its own, such as
		 * `title-<committee id>`, so every label points at its own box.
		 */
		idKey?: string;
		/** Draws the compact field of the management pages (the manage redesign). */
		isDense?: boolean;
	};

	let {
		label,
		name,
		value,
		type = 'text',
		error = null,
		help,
		isRequired = false,
		placeholder,
		autocomplete,
		minLength,
		maxLength,
		min,
		max,
		step,
		idKey,
		isDense = false
	}: Props = $props();

	/*
		What the box holds now.

		It starts as the value the server sent, and because a `$derived` may also
		be assigned to, `bind:value` below can put what is typed into it while it
		still follows the prop whenever the page sends a different value.

		`bind:value` rather than writing `value` straight onto the input, which is
		the difference this whole arrangement is for: a page arrives as finished
		HTML and can be typed into at once, and a moment later Svelte brings it to
		life. Writing the value onto the input at that moment would write over
		whatever had been typed in between; a binding keeps what is already in the
		box instead. See `tests/e2e/typing-before-javascript.spec.ts`.

		`sentValue` sits in between so that only a different value counts. A page
		passes one field of an object, such as `value={values.totalMinutes}`, and
		fresh page data builds a new object with the same text in it. Read
		straight from the prop, that would count as a change and wipe the typing;
		a `$derived` holding just the text only changes when the text does.
	*/
	const sentValue = $derived(value);
	let currentValue = $derived(sentValue);

	// `$derived` works these out again whenever `name`, `help` or `error` changes.
	// The ids tie the label, help line and error to the box; see `idKey` above.
	const fieldKey = $derived(idKey ?? name);
	const inputId = $derived(fieldId(fieldKey));
	const describedBy = $derived(
		fieldDescribedBy(fieldKey, { hasHelp: Boolean(help), hasError: Boolean(error) })
	);
</script>

<div>
	<label for={inputId} class={labelClasses(isDense)}>{label}</label>

	<!--
		`{name}` is short for `name={name}`, and the same goes for the rest.
		`aria-invalid` and `aria-describedby` let a screen reader say that this
		field has a problem and read out the lines underneath it.
	-->
	<input
		id={inputId}
		{name}
		{type}
		bind:value={currentValue}
		{placeholder}
		{autocomplete}
		{min}
		{max}
		{step}
		minlength={minLength}
		maxlength={maxLength}
		required={isRequired}
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={describedBy}
		class={controlClasses(isDense)}
	/>

	{#if help}
		<p id={fieldHelpId(fieldKey)} class="mt-1 text-small text-muted-foreground">{help}</p>
	{/if}

	<FieldError id={fieldErrorId(fieldKey)} message={error} />
</div>

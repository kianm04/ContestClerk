<script lang="ts">
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
		/** The words above the box. */
		label: string;
		/** The name the text is sent under when the form is submitted. */
		name: string;
		/** What the server sent back, so a failed submit keeps what was typed. */
		value: string;
		/** How many lines tall the box starts. */
		rows?: number;
		error?: string | null;
		help?: string;
		isRequired?: boolean;
		/** The longest the text may be. Setting it also shows a character count. */
		maxLength?: number;
		/**
		 * What the box's ids are built from, `name` when left out. A page that
		 * draws the same box once per row gives each row its own, such as
		 * `comment-<document id>`, so every label points at its own box.
		 */
		idKey?: string;
		/**
		 * Focuses the box when the page loads, with or without JavaScript. Only
		 * where the reader sent themselves back to write more, as after adding a
		 * chair note.
		 */
		hasAutofocus?: boolean;
		/** Draws the compact field of the management pages (the manage redesign). */
		isDense?: boolean;
	};

	let {
		label,
		name,
		value,
		rows = 4,
		error = null,
		help,
		isRequired = false,
		maxLength,
		idKey,
		hasAutofocus = false,
		isDense = false
	}: Props = $props();

	// The ids tie the label, help line and error to the box; see `idKey` above.
	const fieldKey = $derived(idKey ?? name);
	const inputId = $derived(fieldId(fieldKey));
	const describedBy = $derived(
		fieldDescribedBy(fieldKey, { hasHelp: Boolean(help), hasError: Boolean(error) })
	);

	/*
		What the box holds now: the server's text to begin with, and whatever is
		typed after that. `bind:value` rather than writing `value` onto the box
		keeps text typed before Svelte brought the page to life, which
		`$lib/components/TextField.svelte` explains in full.
		`sentValue` counts only a different value as a change, so fresh page data
		carrying the same value does not undo what was chosen; see `TextField`.
	*/
	const sentValue = $derived(value);
	let currentValue = $derived(sentValue);

	// The number under the box, worked out again on every keystroke because
	// `currentValue` is what the box holds.
	const characterCount = $derived(currentValue.length);
</script>

<div>
	<label for={inputId} class={labelClasses(isDense)}>{label}</label>

	<!-- `hasAutofocus` is off unless a page asks; its comment above says when that is right. -->
	<!-- svelte-ignore a11y_autofocus -->
	<textarea
		id={inputId}
		{name}
		bind:value={currentValue}
		{rows}
		maxlength={maxLength}
		required={isRequired}
		autofocus={hasAutofocus}
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={describedBy}
		class={controlClasses(isDense)}></textarea>

	{#if maxLength !== undefined}
		<p class="mt-1 text-right text-small text-muted-foreground">{characterCount} / {maxLength}</p>
	{/if}

	{#if help}
		<p id={fieldHelpId(fieldKey)} class="mt-1 text-small text-muted-foreground">{help}</p>
	{/if}

	<FieldError id={fieldErrorId(fieldKey)} message={error} />
</div>

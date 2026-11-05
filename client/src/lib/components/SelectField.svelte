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

	/** One choice in the dropdown: the value is sent, the label is read. */
	export type SelectOption = {
		value: string;
		label: string;
	};

	type Props = {
		label: string;
		/** The name the chosen value is sent under. */
		name: string;
		/** The value chosen so far, or `''` for nothing yet. */
		value: string;
		options: SelectOption[];
		error?: string | null;
		help?: string;
		isRequired?: boolean;
		/** The words on the empty first option, such as "Pick a country". */
		placeholder?: string;
		/**
		 * What the field's ids are built from, `name` when left out. A page that
		 * draws the same field once per row gives each row its own, such as
		 * `audience-<document id>`, so every label points at its own box.
		 */
		idKey?: string;
		/**
		 * Called when the reader picks another option. Only with JavaScript, so
		 * the form must still make sense without it, as the chair's new-motion
		 * form does by showing every field.
		 */
		onchange?: (event: Event & { currentTarget: HTMLSelectElement }) => void;
		/** Draws the compact field of the management pages (the manage redesign). */
		isDense?: boolean;
	};

	let {
		label,
		name,
		value,
		options,
		error = null,
		help,
		isRequired = false,
		placeholder,
		idKey,
		onchange,
		isDense = false
	}: Props = $props();

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
		The Tailwind forms plugin draws the chevron on the right of every select
		and pads the text away from it. The shared `px-3` would shrink that padding
		back, so `pr-10` puts it back: without it a select no wider than its words,
		such as "Sort" on the conference list, draws the chevron over the last letter.
	-->
	<select
		id={inputId}
		{name}
		required={isRequired}
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={describedBy}
		class="{controlClasses(isDense)} pr-10"
		{onchange}
	>
		{#if placeholder}
			<option value="" selected={value === ''}>{placeholder}</option>
		{/if}

		<!--
			The `(option.value)` key lets Svelte reuse options instead of rebuilding
			them. `selected` marks the earlier choice in the HTML itself, so it also
			shows without JavaScript.
		-->
		{#each options as option (option.value)}
			<option value={option.value} selected={option.value === value}>{option.label}</option>
		{/each}
	</select>

	{#if help}
		<p id={fieldHelpId(fieldKey)} class="mt-1 text-small text-muted-foreground">{help}</p>
	{/if}

	<FieldError id={fieldErrorId(fieldKey)} message={error} />
</div>

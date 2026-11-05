<script lang="ts">
	import { fieldErrorId, fieldId, labelClasses } from '$lib/form-fields';
	import FieldError from './FieldError.svelte';

	/** One choice. The optional description is a quiet line under the label. */
	export type RadioOption = {
		value: string;
		label: string;
		description?: string;
		/**
		 * Set when the choice cannot be made yet, to say why, such as "No accepted
		 * delegations yet". The button is greyed out and the reason is shown in
		 * place of the description.
		 */
		disabledReason?: string;
	};

	type Props = {
		/** The question the choices answer. Shown above them. */
		legend: string;
		/** The name every button in the group is sent under. */
		name: string;
		/** The value chosen so far, or `''` for nothing yet. */
		value: string;
		options: RadioOption[];
		error?: string | null;
		/** Draws the compact field of the management pages (the manage redesign). */
		isDense?: boolean;
	};

	let { legend, name, value, options, error = null, isDense = false }: Props = $props();

	/*
		Which button is chosen now: the server's answer to begin with, and whatever
		the reader picks after that. `bind:group` is how Svelte binds a set of
		radio buttons that share a name, and it is used rather than writing
		`checked` onto each button so that a choice made before Svelte brought the
		page to life is kept. `$lib/components/TextField.svelte` explains it in
		full.
		`sentValue` counts only a different value as a change, so fresh page data
		carrying the same value does not undo what was chosen; see `TextField`.
	*/
	const sentValue = $derived(value);
	let chosenValue = $derived(sentValue);

	/** Every button needs its own id so its own label can point at it. */
	function optionId(optionValue: string): string {
		return `${fieldId(name)}-${optionValue}`;
	}
</script>

<!--
	A `<fieldset>` with a `<legend>` is how HTML groups radio buttons: a screen
	reader reads the legend before each choice, so "Yes" is heard as an answer to
	the question rather than on its own.
-->
<fieldset aria-describedby={error ? fieldErrorId(name) : undefined}>
	<legend class={labelClasses(isDense)}>{legend}</legend>

	<!-- The `(option.value)` key lets Svelte reuse list items instead of rebuilding them. -->
	{#each options as option (option.value)}
		<div class="flex min-h-11 items-start gap-3 py-2">
			<input
				id={optionId(option.value)}
				{name}
				type="radio"
				value={option.value}
				bind:group={chosenValue}
				disabled={option.disabledReason !== undefined}
				title={option.disabledReason}
				class="mt-0.5 h-5 w-5 shrink-0 border-border text-link disabled:opacity-50"
			/>

			<div>
				<label for={optionId(option.value)} class="text-body text-foreground">{option.label}</label>

				{#if option.disabledReason}
					<p class="text-small text-muted-foreground">{option.disabledReason}</p>
				{:else if option.description}
					<p class="text-small text-muted-foreground">{option.description}</p>
				{/if}
			</div>
		</div>
	{/each}

	<FieldError id={fieldErrorId(name)} message={error} />
</fieldset>

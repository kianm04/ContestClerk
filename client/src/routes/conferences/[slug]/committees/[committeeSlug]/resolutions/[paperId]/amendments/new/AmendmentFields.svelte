<script lang="ts">
	import { onMount } from 'svelte';
	import FieldError from '$lib/components/FieldError.svelte';
	import FormSelect from '$lib/components/FormSelect.svelte';
	import { clauseOptions } from '$lib/amendment-wording';
	import { fieldErrorId, fieldId, labelClasses } from '$lib/form-fields';
	import type { AmendmentFormErrors, AmendmentFormValues } from '$lib/paper-amendments';
	import type { AmendmentAction, ClauseContent } from '$lib/paper-clauses';
	import AmendmentActionRadios from './AmendmentActionRadios.svelte';
	import AmendmentTextField from './AmendmentTextField.svelte';

	type Props = {
		/** The draft as it stands, whose clauses the dropdown lists. */
		content: ClauseContent;
		isPreambleAmendable: boolean;
		values: AmendmentFormValues;
		errors: AmendmentFormErrors;
	};

	let { content, isPreambleAmendable, values, errors }: Props = $props();

	// The action chosen now, which starts from what the form arrived with.
	let chosenAction: string = $derived(values.action);

	// Whether the page has come to life; `FormSelect` explains the pattern.
	let isEnhanced = $state(false);
	onMount(() => (isEnhanced = true));

	/*
		The clauses offered. Without JavaScript the list cannot change when the
		action does, so it holds every choice, worded for any action. Once the
		page is alive it follows the radios: "After clause 2" for an addition,
		"Clause 2" for a change or a strike.
	*/
	const options = $derived(
		clauseOptions(
			content,
			isPreambleAmendable,
			isEnhanced ? (chosenAction as AmendmentAction) : null
		)
	);
	const isAdding = $derived(isEnhanced && chosenAction === 'add');
</script>

<AmendmentActionRadios
	action={values.action}
	error={errors.action}
	onChange={(action) => (chosenAction = action)}
/>

<div>
	<label for={fieldId('clause')} class={labelClasses(true)}>
		{isAdding ? 'Where the clause goes' : 'Which clause'}
	</label>
	<FormSelect
		id={fieldId('clause')}
		name="clause"
		value={values.clause}
		{options}
		placeholder="Choose a clause"
	/>
	{#if !isEnhanced}
		<p class="mt-1 text-small text-muted-foreground">An added clause goes after the one chosen.</p>
	{/if}
	<FieldError id={fieldErrorId('clause')} message={errors.clause} />
</div>

<!-- A strike has no words, so once the page is alive the box goes when it is chosen. -->
{#if !isEnhanced || chosenAction !== 'strike'}
	<AmendmentTextField
		label={isAdding ? 'The clause to add' : 'The clause as amended'}
		value={values.text}
		error={errors.text}
		help={isEnhanced ? null : 'Leave it empty to strike the clause.'}
	/>
{/if}

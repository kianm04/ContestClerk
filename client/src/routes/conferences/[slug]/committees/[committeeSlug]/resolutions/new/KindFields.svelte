<script lang="ts">
	import { onMount } from 'svelte';
	import FieldError from '$lib/components/FieldError.svelte';
	import FormSelect, { type FormSelectOption } from '$lib/components/FormSelect.svelte';
	import { fieldErrorId, fieldId, labelClasses } from '$lib/form-fields';
	import BasedOnFieldset from './BasedOnFieldset.svelte';

	type Props = {
		/** Only the kinds the committee's format offers. */
		kindOptions: FormSelectOption[];
		/** The kind chosen so far, as the page was given it. */
		kind: string;
		kindError?: string;
		/** The introduced working papers a draft resolution may be based on; none leaves "Based on" out. */
		basedOnChoices: { id: string; label: string }[];
		/** The ones ticked so far. */
		sourcePaperIds: string[];
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { kindOptions, kind, kindError, basedOnChoices, sourcePaperIds }: Props = $props();

	/*
		The kind picked in the dropdown. A `$derived` can be written to: it holds
		the pick, and starts over from `kind` when the page arrives with a new one,
		as it does when the form comes back refused.
	*/
	let chosenKind: string = $derived(kind);

	/*
		Whether the page has come to life. `onMount` only runs in the browser.
		Without JavaScript nothing can hide "Based on" when another kind is
		chosen, so it is always there and the server ignores it for any kind
		but a draft resolution; once the page runs, it shows only for one.
	*/
	let isEnhanced = $state(false);

	onMount(() => {
		isEnhanced = true;
	});

	const showsBasedOn = $derived(
		basedOnChoices.length > 0 && (!isEnhanced || chosenKind === 'draft_resolution')
	);

	function handleKindChange(value: string) {
		chosenKind = value;
	}
</script>

<div>
	<label for={fieldId('kind')} class={labelClasses(true)}>Kind</label>
	<FormSelect
		id={fieldId('kind')}
		name="kind"
		value={kind}
		options={kindOptions}
		onChange={handleKindChange}
	/>
	<FieldError id={fieldErrorId('kind')} message={kindError} />
</div>

{#if showsBasedOn}
	<BasedOnFieldset choices={basedOnChoices} checkedIds={sourcePaperIds} />
{/if}

<script lang="ts">
	import TextField from '$lib/components/TextField.svelte';
	import {
		PROCEDURE_NUMBER_MAX,
		WORDS_OPTIONS,
		type ProcedureFormErrors,
		type ProcedureFormValues
	} from '$lib/committee-procedure';
	import ProcedureSelectField from './ProcedureSelectField.svelte';
	import ProcedureTickBox from './ProcedureTickBox.svelte';
	import SupportField from './SupportField.svelte';

	type Props = {
		values: ProcedureFormValues;
		errors: ProcedureFormErrors;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { values, errors }: Props = $props();
</script>

<!--
	The settings about draft resolutions themselves, from the words they use to
	the support one needs: fields only, sent with the form around them.
-->
<ProcedureSelectField
	label="Words"
	name="paperWords"
	value={values.paperWords}
	options={WORDS_OPTIONS}
	help="Only the words on screen change. With THIMUN’s, the lead author is the main submitter and every other author and signatory a co-submitter."
	error={errors.paperWords}
/>

<ProcedureTickBox
	name="hasWorkingPapers"
	label="Working papers"
	help="Off, blocs write draft resolutions from the start."
	isChecked={values.hasWorkingPapers}
/>

<!-- As wide as the dropdowns above it, since the number is never long. -->
<div class="max-w-sm">
	<TextField
		label="Most sponsors on a draft resolution"
		name="sponsorLimit"
		type="number"
		min={1}
		max={PROCEDURE_NUMBER_MAX}
		step={1}
		value={values.sponsorLimit}
		help="Empty means no cap."
		error={errors.sponsorLimit}
		isDense
	/>
</div>

<SupportField
	label="Support a draft resolution needs"
	minimumName="supportMinimum"
	unitName="supportUnit"
	minimum={values.supportMinimum}
	unit={values.supportUnit}
	help="A number of seats, or a share of the seats with a delegate, rounded up."
	minimumError={errors.supportMinimum}
	unitError={errors.supportUnit}
/>

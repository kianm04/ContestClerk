<script lang="ts">
	import type { ProcedureFormErrors, ProcedureFormValues } from '$lib/committee-procedure';
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
	The rest of the settings form, from who counts towards support to
	the format check: fields only, sent with the form around them.
-->
<ProcedureTickBox
	name="supportCountsSponsors"
	label="Sponsors count towards that support"
	help="Off, signatories alone must reach it."
	isChecked={values.supportCountsSponsors}
/>

<ProcedureTickBox
	name="oneSponsorshipPerTopic"
	label="A seat may sponsor only one draft resolution per topic"
	help="Some conferences insist on it."
	isChecked={values.oneSponsorshipPerTopic}
/>

<ProcedureTickBox
	name="hasFriendlyAmendments"
	label="Friendly amendments"
	help="Off sends every amendment to the dais and the vote."
	isChecked={values.hasFriendlyAmendments}
/>

<SupportField
	label="Support an unfriendly amendment needs"
	minimumName="amendmentSupportMinimum"
	unitName="amendmentSupportUnit"
	minimum={values.amendmentSupportMinimum}
	unit={values.amendmentSupportUnit}
	help="Seats or a share, as above. The proposer counts, and 0 means none."
	minimumError={errors.amendmentSupportMinimum}
	unitError={errors.amendmentSupportUnit}
/>

<ProcedureTickBox
	name="preambleAmendable"
	label="Preambulatory clauses can be amended"
	help="Almost no conference allows it."
	isChecked={values.preambleAmendable}
/>

<ProcedureTickBox
	name="hasSecondDegreeAmendments"
	label="Amendments to amendments"
	help="The second degree. One level only."
	isChecked={values.hasSecondDegreeAmendments}
/>

<ProcedureTickBox
	name="checksFormat"
	label="Check the format"
	help="Off for a committee writing in another language or its own format."
	isChecked={values.checksFormat}
/>

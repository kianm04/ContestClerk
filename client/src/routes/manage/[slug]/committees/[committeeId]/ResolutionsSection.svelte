<script lang="ts">
	import FormSection from '$lib/components/manage/FormSection.svelte';
	import type {
		ProcedureCopyTarget,
		ProcedureFormErrors,
		ProcedureFormValues
	} from '$lib/committee-procedure';
	import CopyProcedureForm from './CopyProcedureForm.svelte';
	import ProcedureSettingsForm from './ProcedureSettingsForm.svelte';
	import StartFromProcedureForm from './StartFromProcedureForm.svelte';

	type Props = {
		/** The settings as saved, or as typed when a save was refused. */
		values: ProcedureFormValues;
		errors: ProcedureFormErrors;
		/** The other committees the reader may copy the settings to. */
		copyTargets: ProcedureCopyTarget[];
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { values, errors, copyTargets }: Props = $props();
</script>

<!--
	How this committee's draft resolutions and amendments work
	(`docs/committee-papers.md`, section 5). Three forms of their own, because
	each does one thing: fill the settings from a procedure, save them as
	changed, or copy them to other committees.
-->
<FormSection title="Resolutions" description="How draft resolutions and amendments work here.">
	<StartFromProcedureForm />

	<ProcedureSettingsForm {values} {errors} />

	{#if copyTargets.length > 0}
		<CopyProcedureForm {copyTargets} />
	{/if}
</FormSection>

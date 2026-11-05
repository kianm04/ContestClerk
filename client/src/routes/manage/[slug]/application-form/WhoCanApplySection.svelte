<script lang="ts">
	import CheckboxField from '$lib/components/CheckboxField.svelte';
	import FieldError from '$lib/components/FieldError.svelte';
	import FormSection from '$lib/components/manage/FormSection.svelte';
	import type {
		ApplicationWindowErrors,
		ApplicationWindowValues
	} from '$lib/application-form-settings';
	import { fieldErrorId } from '$lib/form-fields';

	type Props = {
		/** What the boxes show: the saved choice, or what was sent in a refused form. */
		values: ApplicationWindowValues;
		/** Carries the "at least one of the two" message, when there is one. */
		errors: ApplicationWindowErrors;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { values, errors }: Props = $props();

	/*
		`CheckboxField` has no `error` prop, because a message about one tick box
		would say nothing: the rule is about the pair. So the two boxes sit in a
		`<fieldset>` of their own and the message goes under both of them, with
		`aria-describedby` pointing the whole group at it so a screen reader reads
		it with the question rather than after it.
	*/
	const whoCanApplyErrorId = fieldErrorId('whoCanApply');
</script>

<!-- Fields only: the page's one settings form wraps this section. -->
<FormSection title="Who can apply">
	<fieldset aria-describedby={errors.whoCanApply ? whoCanApplyErrorId : undefined}>
		<!-- The section's own title says this on the screen; `sr-only` keeps the
			legend for a screen reader, which reads it before each box. -->
		<legend class="sr-only">Who can apply</legend>

		<div class="flex flex-col gap-3">
			<CheckboxField
				label="Individual delegates"
				name="acceptsIndividualApplications"
				isChecked={values.acceptsIndividualApplications}
			/>

			<CheckboxField
				label="Delegations"
				name="acceptsDelegations"
				isChecked={values.acceptsDelegations}
				help="A school or society applies for several seats at once."
			/>
		</div>

		<FieldError id={whoCanApplyErrorId} message={errors.whoCanApply} />
	</fieldset>
</FormSection>

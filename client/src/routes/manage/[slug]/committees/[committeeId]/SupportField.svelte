<script lang="ts">
	import FieldError from '$lib/components/FieldError.svelte';
	import FormSelect from '$lib/components/FormSelect.svelte';
	import { Label } from '$lib/components/ui/label';
	import { PROCEDURE_NUMBER_MAX, SUPPORT_UNIT_OPTIONS } from '$lib/committee-procedure';
	import { fieldErrorId, fieldId } from '$lib/form-fields';

	type Props = {
		/** The setting, as section 5 names it, such as "Support a draft resolution needs". */
		label: string;
		/** The names the number and its unit are sent under. */
		minimumName: string;
		unitName: string;
		minimum: string;
		unit: string;
		/** A quiet line under the field, from section 5's notes. */
		help: string;
		minimumError?: string;
		unitError?: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { label, minimumName, unitName, minimum, unit, help, minimumError, unitError }: Props =
		$props();
</script>

<!--
	A number and what it counts, side by side: "3 seats" or "20 % of the
	committee". The unit's label is for a screen reader only, since the
	number's label above names them both. The number box is as tall as the
	dropdown beside it, 44px on a phone and 36px from `lg` up.
-->
<div class="flex flex-col gap-1.5">
	<Label for={fieldId(minimumName)} class="text-small font-medium">{label}</Label>
	<div class="flex gap-3">
		<input
			id={fieldId(minimumName)}
			name={minimumName}
			type="number"
			min="0"
			max={PROCEDURE_NUMBER_MAX}
			step="1"
			value={minimum}
			aria-invalid={minimumError ? 'true' : undefined}
			class="h-11 w-24 rounded-control border border-border bg-background px-3 text-body text-foreground tabular-nums lg:h-9"
		/>
		<Label for={fieldId(unitName)} class="sr-only">Counted in</Label>
		<FormSelect
			id={fieldId(unitName)}
			name={unitName}
			value={unit}
			options={SUPPORT_UNIT_OPTIONS}
			class="max-w-56 min-w-0 flex-1"
		/>
	</div>
	<p class="text-small text-muted-foreground">{help}</p>
	<FieldError id={fieldErrorId(minimumName)} message={minimumError} />
	<FieldError id={fieldErrorId(unitName)} message={unitError} />
</div>

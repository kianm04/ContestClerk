<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import type { CommitteeFormErrors } from '$lib/committee-details';
	import type { CommitteeDialogValues } from '$lib/creation-setup-dialog';
	import { fieldErrorId, fieldHelpId } from '$lib/form-fields';
	import { DIALOG_INPUT_CLASSES } from './dialog-field-classes';
	import DialogNumberInput from './DialogNumberInput.svelte';
	import SetupField from './SetupField.svelte';

	type Props = {
		values: CommitteeDialogValues;
		errors: CommitteeFormErrors & { plannedSeatCount?: string };
		/** Create committee and Edit committee draw this row at different sizes. */
		isNew: boolean;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { values, errors, isNew }: Props = $props();

	// The two designs: Create committee's 286 and 285 pixel columns 22 apart
	// with a 12 pixel help line, and Edit committee's 316 and 318, 24 apart,
	// labels 3 pixels closer to their fields and a 14 pixel help line.
	const controlClass = $derived(isNew ? undefined : 'mt-0.75');
</script>

<!-- Seats beside room, one above the other on a phone. -->
<div
	class={[
		'grid grid-cols-1 gap-y-3 lg:mt-4.5',
		isNew ? 'lg:grid-cols-[286fr_285fr] lg:gap-x-5.5' : 'lg:grid-cols-[316fr_318fr] lg:gap-x-6'
	]}
>
	<SetupField id="plannedSeatCount" label="Seats" error={errors.plannedSeatCount} {controlClass}>
		<DialogNumberInput
			id="plannedSeatCount"
			name="plannedSeatCount"
			min={1}
			placeholder="Not decided"
			hasArrows={!isNew}
			describedBy={errors.plannedSeatCount ? fieldErrorId('plannedSeatCount') : undefined}
			value={values.plannedSeatCount}
		/>
	</SetupField>
	<SetupField
		id="room"
		label="Room"
		help="Rooms can be assigned later."
		hasHelpIcon
		helpClass={isNew ? undefined : 'fs-14 lh-20'}
		helpIconClass={isNew ? undefined : 'size-4'}
		error={errors.room}
		{controlClass}
	>
		<!--
			The room is free text ("Committee Room 1"): the conference keeps no
			list of rooms a dropdown could offer, so this stays a typed field.
			The design draws it as a dropdown reading "Unassigned", so the empty
			field's placeholder is in ink, as the design's words are.
		-->
		<Input
			id="room"
			name="room"
			maxlength={60}
			placeholder="Unassigned"
			class="{DIALOG_INPUT_CLASSES} placeholder:text-creation-ink-950"
			aria-describedby={fieldHelpId('room')}
			value={values.room}
		/>
	</SetupField>
</div>

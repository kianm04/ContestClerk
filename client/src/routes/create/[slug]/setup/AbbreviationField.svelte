<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { fieldErrorId } from '$lib/form-fields';
	import { DIALOG_INPUT_CLASSES } from './dialog-field-classes';
	import SetupField from './SetupField.svelte';

	type Props = {
		abbreviation: string;
		error?: string;
		/** The input's distance under the label: 6 when creating, 3 when editing. */
		controlClass?: string;
	};

	// `$bindable()` lets the dialog read the field back, so a catalogue pick can fill it.
	let { abbreviation = $bindable(), error, controlClass }: Props = $props();
</script>

<!--
	Twelve characters, as everywhere a committee is named; spaces are allowed.
	The design stars it as wanted, though the server does not refuse an empty
	one, so the input is not marked `aria-required`.
-->
<SetupField id="abbreviation" label="Abbreviation" isRequired {error} {controlClass}>
	<Input
		id="abbreviation"
		name="abbreviation"
		maxlength={12}
		class={DIALOG_INPUT_CLASSES}
		aria-describedby={error ? fieldErrorId('abbreviation') : undefined}
		bind:value={abbreviation}
	/>
</SetupField>

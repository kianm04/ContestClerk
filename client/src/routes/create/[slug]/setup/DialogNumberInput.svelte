<script lang="ts">
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import { Input } from '$lib/components/ui/input';
	import { DIALOG_INPUT_CLASSES } from './dialog-field-classes';

	type Props = {
		id: string;
		/** The name the number is sent as. */
		name: string;
		value: string;
		min: number;
		placeholder?: string;
		/** The up-and-down chevrons at the right, as the Edit committee design draws them. */
		hasArrows?: boolean;
		describedBy?: string;
	};

	// `$bindable()` lets the parent write `bind:value`, which a catalogue pick fills.
	let {
		id,
		name,
		value = $bindable(),
		min,
		placeholder,
		hasArrows = false,
		describedBy
	}: Props = $props();
</script>

<!--
	A number field in the dialogs' style. The browser's own spin buttons are
	hidden (`appearance` none): the design draws one quiet chevron pair in their
	place, which only shows the field takes a number; the arrow keys step it.
-->
<div class="relative">
	<Input
		{id}
		{name}
		type="number"
		{min}
		inputmode="numeric"
		{placeholder}
		class={[
			DIALOG_INPUT_CLASSES,
			'[appearance:textfield] tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
			hasArrows ? 'pr-11 focus-visible:pr-11' : ''
		].join(' ')}
		aria-describedby={describedBy}
		bind:value
	/>
	{#if hasArrows}
		<ChevronsUpDown
			class="pointer-events-none absolute top-1/2 right-3.5 size-4.5 -translate-y-1/2 text-creation-ink-950"
			aria-hidden="true"
		/>
	{/if}
</div>

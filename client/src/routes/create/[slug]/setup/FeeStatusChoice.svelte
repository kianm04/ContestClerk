<script lang="ts">
	import { enhance } from '$app/forms';
	import * as RadioGroup from '$lib/components/ui/radio-group';
	import type { FeeStatus } from '$lib/creation-draft';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import FeeStatusOption from './FeeStatusOption.svelte';

	type Props = {
		/** The choice as saved. */
		feeStatus: FeeStatus;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { feeStatus }: Props = $props();

	// Answers in place, so the page keeps its scroll position after a choice.
	const statusForm = createInPlaceForm();

	// The three cards, each as wide as its words, 6 and 8 apart.
	const OPTIONS: { value: FeeStatus; label: string; description: string; class: string }[] = [
		{ value: 'free', label: 'Free', description: 'No payment is required.', class: '' },
		{
			value: 'paid',
			label: 'Paid',
			description: 'Delegates pay a fee.',
			class: 'lg:ml-1.5'
		},
		{
			value: 'undecided',
			label: 'Decide later',
			description: 'You can configure this at any time.',
			class: 'lg:ml-2'
		}
	];

	// What is ticked now. `$derived` with a value it can be set to: a click
	// changes it at once, and a fresh `feeStatus` after the save resets it.
	let chosen = $derived<string>(feeStatus);

	// The form, so a choice can send it. `bind:this` below fills it in.
	let statusFormElement: HTMLFormElement | undefined = $state();

	/**
	 * Save as soon as a choice is made. shadcn's radio group keeps the choice
	 * in a hidden input named `feeStatus`, so the form posts the same field the
	 * native radios did; `requestSubmit` goes through `use:enhance`.
	 */
	function handleValueChange() {
		// The hidden input takes the new value once Svelte has updated the page.
		queueMicrotask(() => statusFormElement?.requestSubmit());
	}
</script>

<!--
	shadcn's `RadioGroup` (bits-ui underneath) draws buttons with the radio
	role, so the arrow keys and screen readers treat the three as one choice.
	It needs JavaScript to change; without it the saved choice still shows.
-->
<form
	bind:this={statusFormElement}
	method="POST"
	action="?/setFeeStatus"
	use:enhance={statusForm.submit}
>
	<RadioGroup.Root
		name="feeStatus"
		bind:value={chosen}
		onValueChange={handleValueChange}
		aria-label="Do delegates pay?"
		class="flex w-auto flex-col gap-2 lg:flex-row lg:gap-0"
	>
		<!-- Keyed by the value, which is different for each card. -->
		{#each OPTIONS as option (option.value)}
			<FeeStatusOption
				value={option.value}
				label={option.label}
				description={option.description}
				class={option.class}
			/>
		{/each}
	</RadioGroup.Root>
</form>

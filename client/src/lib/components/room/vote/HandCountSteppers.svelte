<script lang="ts">
	import type { HandCountDraft } from '$lib/vote-view';
	import CountStepper from '../CountStepper.svelte';

	type Props = {
		/** The hands as the chair is counting them; an emptied field is null. */
		draft: HandCountDraft;
		/** Called with the side that changed and its new count. */
		onChange: (side: keyof HandCountDraft, value: number | null) => void;
	};

	let { draft, onChange }: Props = $props();

	/** The three counts in the order the chair takes them, with the form field each one is. */
	const STEPPERS: { side: keyof HandCountDraft; name: string; label: string }[] = [
		{ side: 'for', name: 'votesFor', label: 'For' },
		{ side: 'against', name: 'votesAgainst', label: 'Against' },
		{ side: 'abstain', name: 'votesAbstain', label: 'Abstain' }
	];
</script>

<!--
	For, Against and Abstain, each a large `CountStepper`. They wrap onto a
	second row on a narrow phone rather than squeezing.
-->
<div class="flex flex-wrap gap-10 max-md:gap-4">
	<!-- The `(stepper.side)` key lets Svelte reuse each stepper instead of rebuilding it. -->
	{#each STEPPERS as stepper (stepper.side)}
		<CountStepper
			name={stepper.name}
			label={stepper.label}
			value={draft[stepper.side]}
			size="lg"
			onChange={(value) => onChange(stepper.side, value)}
		/>
	{/each}
</div>

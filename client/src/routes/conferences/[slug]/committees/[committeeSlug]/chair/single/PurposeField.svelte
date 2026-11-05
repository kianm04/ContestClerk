<script lang="ts">
	import { onMount } from 'svelte';
	import SegmentedChoice from '$lib/components/room/SegmentedChoice.svelte';
	import { OTHER_PURPOSE, SINGLE_SPEAKER_PURPOSES } from '$lib/single-speaker';

	type Props = {
		/** The purpose chosen before a refusal: one of the three, `other`, or empty for none. */
		purpose: string;
		/** The words of "Other…" typed before a refusal. */
		purposeOther: string;
	};

	let { purpose, purposeOther }: Props = $props();

	/* The four choices: the three fixed purposes, then "Other…" with words of its own. */
	const PURPOSE_OPTIONS = [
		...SINGLE_SPEAKER_PURPOSES.map((words) => ({ value: words, label: words })),
		{ value: OTHER_PURPOSE, label: 'Other…' }
	];

	// Whether this component is running in the browser: `onMount` only runs there.
	let isScriptRunning = $state(false);
	onMount(() => {
		isScriptRunning = true;
	});

	// The purpose chosen now. A `$derived` can be assigned to: a choice changes it.
	let chosen = $derived(purpose);

	// With JavaScript the words field shows only beside "Other…"; without, always.
	const isOtherShown = $derived(!isScriptRunning || chosen === OTHER_PURPOSE);

	function handleChoose(value: string) {
		chosen = value;
	}
</script>

<!--
	The single speaker's purpose: four radio buttons drawn as one row, none
	chosen at first, and a short field for the words of "Other…" ("Point of
	personal privilege"). The purpose shows on delegates' phones and on the
	projector.
-->
<SegmentedChoice name="purpose" options={PURPOSE_OPTIONS} value={chosen} onChange={handleChoose} />
{#if !isScriptRunning}
	<label for="single-purpose-other" class="text-small text-ink-600">Other purpose</label>
{/if}
{#if isOtherShown}
	<input
		id="single-purpose-other"
		name="purposeOther"
		value={purposeOther}
		aria-label={isScriptRunning ? 'Other purpose' : undefined}
		class="h-9 w-55 max-w-full rounded-lg border border-line bg-surface px-3 text-small max-md:h-11"
	/>
{/if}

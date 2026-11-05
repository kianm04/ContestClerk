<script lang="ts">
	import type { MotionKind } from '$lib/committee-room';
	import { MOTION_KIND_CHOICES } from '$lib/motion-input';
	import { isMotionKind } from '$lib/motions';
	import SegmentedChoice from '$lib/components/room/SegmentedChoice.svelte';

	type Props = {
		/** The kind chosen: a moderated caucus at first. */
		value: MotionKind;
		/** Called with the kind the chair chose. */
		onChange: (kind: MotionKind) => void;
	};

	let { value, onChange }: Props = $props();

	// The eight kinds by their short names: Mod, Unmod, Extend, … (`$lib/motion-input.ts`).
	const OPTIONS = MOTION_KIND_CHOICES.map((choice) => ({
		value: choice.kind,
		label: choice.label
	}));

	/** Hand the choice on; the radio buttons only ever send one of the eight kinds. */
	function handleChange(chosen: string) {
		if (isMotionKind(chosen)) onChange(chosen);
	}
</script>

<!--
	The eight kinds of motion in one row of segments. They are radio buttons
	named `kind`, so the choice is sent with the form without JavaScript; with
	it, choosing one shows only the fields that kind asks for. The group is
	named for a screen reader by the hidden words below.
-->
<span id="motion-kind-label" class="sr-only">Kind of motion</span>
<SegmentedChoice
	name="kind"
	labelledBy="motion-kind-label"
	options={OPTIONS}
	{value}
	isCompact
	onChange={handleChange}
/>

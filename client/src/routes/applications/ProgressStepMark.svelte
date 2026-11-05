<script lang="ts">
	import CheckmarkFilled from 'carbon-icons-svelte/lib/CheckmarkFilled.svelte';
	import type { ProgressStepState, ProgressTone } from '$lib/application-progress';
	import { TONE_ICON_CLASSES, TONE_RING_CLASSES } from '$lib/application-tone-classes';

	type Props = {
		state: ProgressStepState;
		/** The colour of the whole line, from the application's status. */
		tone: ProgressTone;
	};

	let { state, tone }: Props = $props();
</script>

<!--
	A finished step is a filled circle with a tick, the step the application is
	on now an empty ring in the same colour, and a step still to come a grey
	ring. The words under it say the same for a screen reader, so the circle
	itself is hidden from one.

	Carbon's `CheckmarkFilled` is that filled circle, with the tick cut out so
	the white card shows through. Its circle fills only 28 of the icon's 32
	units, so the icon is drawn at 18px to make the circle 16px like the rings,
	and `-m-px` stops those extra 2px from moving it out of line with them.
	Carbon icons hide themselves from screen readers when given no label.
-->
{#if state === 'done'}
	<CheckmarkFilled class="-m-px size-[18px] shrink-0 {TONE_ICON_CLASSES[tone]}" />
{:else if state === 'current'}
	<span aria-hidden="true" class="size-4 rounded-full border-2 bg-card {TONE_RING_CLASSES[tone]}"
	></span>
{:else}
	<span aria-hidden="true" class="size-4 rounded-full border-2 border-ink-400 bg-card"></span>
{/if}

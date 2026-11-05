<script lang="ts">
	import { formatDuration, type ClockState } from '$lib/committee-room';
	import { progressPercent, progressTone } from '$lib/floor-clock';

	type Props = {
		/** The seconds spoken so far, more than `totalSeconds` once over time. */
		spokenSeconds: number;
		/** The speaking time the bar measures against: "of 1:30". */
		totalSeconds: number;
		clockState: ClockState;
		/** Whether "0:38 spoken" and "of 1:30" show under the bar. The live strip leaves them out. */
		isLegendShown?: boolean;
		/** Half as thick: the Mod view's caucus clock line, smaller than the speaker's bar. */
		isThin?: boolean;
		/** `display` is the projector's, as thick as a share of the window's width (S12). */
		size?: 'console' | 'display';
	};

	let {
		spokenSeconds,
		totalSeconds,
		clockState,
		isLegendShown = true,
		isThin = false,
		size = 'console'
	}: Props = $props();

	/* The fill's colour by `progressTone`: light blue running, grey waiting, then warning and danger. */
	const FILL_CLASSES = {
		running: 'bg-brand-500',
		paused: 'bg-ink-400',
		warning: 'bg-warning-500',
		danger: 'bg-danger-500'
	};

	/* How thick the bar is: 8px and 4px on the console and a phone, 1% and 0.5% of the projector's width. */
	const HEIGHT_CLASSES = {
		console: { thick: 'h-2', thin: 'h-1' },
		display: { thick: 'h-[1vw]', thin: 'h-[0.5vw]' }
	};

	const percent = $derived(progressPercent(spokenSeconds, totalSeconds));
	const heightClasses = $derived(HEIGHT_CLASSES[size][isThin ? 'thin' : 'thick']);
	const fillClasses = $derived(FILL_CLASSES[progressTone(spokenSeconds, totalSeconds, clockState)]);
</script>

<!--
	The bar of time spoken against the speaking time. `spokenSeconds` changes
	once a second, so the fill moves one step a second, and the one-second
	linear transition makes the steps one smooth movement. `motion-reduce:`
	drops the transition for anybody who asked their system for less motion,
	so the bar steps instead. The bar repeats what the clock says, so a screen
	reader skips it (`aria-hidden`); the legend under it is read.
-->
<div class="overflow-hidden rounded-full bg-line {heightClasses}" aria-hidden="true">
	<div
		class="h-full rounded-full transition-[width] duration-1000 ease-linear motion-reduce:transition-none {fillClasses}"
		style:width="{percent}%"
	></div>
</div>
{#if isLegendShown}
	<div class="flex justify-between text-small text-ink-600 tabular-nums">
		<span>{formatDuration(spokenSeconds)} spoken</span>
		<span>of {formatDuration(totalSeconds)}</span>
	</div>
{/if}

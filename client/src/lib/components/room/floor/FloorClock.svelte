<script lang="ts">
	import { formatClock, timerTone, type ClockState } from '$lib/committee-room';

	type Props = {
		/** The seconds left, below zero once the speaker has gone over: -7 reads "+0:07". */
		secondsLeft: number;
		/** Ready (not run yet), running, or paused after running, which writes "Paused" beside it. */
		clockState: ClockState;
		/**
		 * `floor` is the speaker's clock; `unmod` the Unmod view's one clock, larger
		 * and centred, whose "Paused" is written in the line under it instead.
		 * `phone` is the delegate live view's speaker clock, with "Paused" beside it
		 * as on the console; `phoneUnmod` its Unmod clock. `display` and
		 * `displayUnmod` are the projector's, sized as a share of the window's
		 * width, which writes its own words beside the clock.
		 */
		size?: 'floor' | 'unmod' | 'phone' | 'phoneUnmod' | 'display' | 'displayUnmod';
	};

	let { secondsLeft, clockState, size = 'floor' }: Props = $props();

	/* The digits' colour: black, then warning under ten seconds and danger at zero and over. */
	const TONE_CLASSES = {
		normal: 'text-ink-900',
		warning: 'text-warning-700',
		danger: 'text-danger-700'
	};

	/*
		The digits' size: the speaker's clock shrinks first on a narrow window;
		Unmod's stays large. The phone's are 56px and 72px; the projector's are
		17% and 22% of the window's width, with lines a little tighter.
	*/
	const SIZE_CLASSES = {
		floor: 'text-[clamp(96px,12vw,168px)] leading-none max-md:text-[80px]',
		unmod: 'text-[clamp(120px,15vw,208px)] leading-none',
		phone: 'text-[56px] leading-none',
		phoneUnmod: 'text-[72px] leading-none',
		display: 'text-[17vw] leading-[0.9]',
		displayUnmod: 'text-[22vw] leading-[0.9]'
	};

	// `$derived` works these out again whenever `secondsLeft` changes, once a second.
	const toneClasses = $derived(TONE_CLASSES[timerTone(secondsLeft)]);
	const sizeClasses = $derived(SIZE_CLASSES[size]);
	const digits = $derived(formatClock(secondsLeft));
	// Only the console's and the phone's speaker clocks write "Paused" beside the digits.
	const isPausedWritten = $derived(size === 'floor' || size === 'phone');
</script>

<!--
	The speaker's clock: the largest thing on the screen, on its own line under
	the speaker. "0:52" with no leading zero, in tabular digits so the line does
	not jitter as they change; `clamp()` lets it shrink on a narrower window
	before anything else does. Nothing blinks. `role="timer"` tells a screen
	reader this is a clock, which it does not read out every second.
-->
<div class="mt-1 flex items-baseline gap-5">
	<span
		role="timer"
		aria-label="Time left"
		class="font-semibold tracking-[-0.03em] tabular-nums {sizeClasses} {toneClasses}"
	>
		{digits}
	</span>
	{#if clockState === 'paused' && isPausedWritten}
		<span class="text-xl leading-7 text-ink-600">Paused</span>
	{/if}
</div>

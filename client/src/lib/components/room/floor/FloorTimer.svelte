<script lang="ts">
	import { serverNow } from '$lib/clock-offset';
	import type { TimerSetting } from '$lib/committee-room';
	import { clockFace } from '$lib/floor-clock';
	import FloorClock from './FloorClock.svelte';
	import ProgressLine from './ProgressLine.svelte';

	type Props = {
		/** The room's timer, as stored, with the presses on their way laid on top. */
		timer: TimerSetting;
		/** The list's speaking time, shown in full while the speaker has no timer at all. */
		speakingTimeSeconds: number;
		/** How far the server's clock is ahead of this browser's (`$lib/clock-offset.ts`). */
		clockOffsetMs: number;
	};

	let { timer, speakingTimeSeconds, clockOffsetMs }: Props = $props();

	/** How often the clock reads the time while it runs, so each second turns over on time. */
	const TICK_MS = 100;

	// `$state` makes Svelte redraw whatever reads it when it changes. Here it is
	// the browser's clock, which the interval below moves on. `now` is the same
	// moment on the server's clock, the one the timer is on.
	let browserNow = $state(new Date());
	const now = $derived(serverNow(clockOffsetMs, browserNow));
	const face = $derived(clockFace(timer, now, speakingTimeSeconds));
	// When the running timer runs out, or null while it is ready or paused. A
	// `$derived` of its own, so the effect below starts again only when this
	// value really changes, not every time the page's data is read again.
	const runningEndsAt = $derived(timer.endsAt);

	// `$effect` is how a component talks to something outside Svelte, here the
	// browser's clock. It runs in the browser only, and again whenever
	// `runningEndsAt` changes, reading the clock at once so a new end is never
	// measured against an old moment. A running clock ticks; a ready or paused
	// one does not. The function it returns stops the ticking.
	$effect(() => {
		if (runningEndsAt === null) return;

		browserNow = new Date();
		const interval = setInterval(() => {
			browserNow = new Date();
		}, TICK_MS);

		return () => clearInterval(interval);
	});
</script>

<!-- The clock on its own line, then the bar the full width of the floor with its legend. -->
<FloorClock secondsLeft={face.secondsLeft} clockState={face.clockState} />
<ProgressLine
	spokenSeconds={face.spokenSeconds}
	totalSeconds={face.totalSeconds}
	clockState={face.clockState}
/>

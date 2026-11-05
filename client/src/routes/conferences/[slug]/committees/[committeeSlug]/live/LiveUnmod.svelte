<script lang="ts">
	import FloorClock from '$lib/components/room/floor/FloorClock.svelte';
	import ProgressLine from '$lib/components/room/floor/ProgressLine.svelte';
	import { caucusTitle } from '$lib/caucus-view';
	import type { TimerSetting } from '$lib/committee-room';
	import { clockFace } from '$lib/floor-clock';
	import { createRoomNow } from '$lib/room-now.svelte';
	import { unmodBackAtText } from '$lib/watched-floor';
	import LivePanel from './LivePanel.svelte';

	type Props = {
		/** The caucus's topic, or null when it has none. */
		topic: string | null;
		/** The caucus's one clock: the room's timer. */
		timer: TimerSetting;
		/** How far the server's clock is ahead of this browser's (`$lib/clock-offset.ts`). */
		clockOffsetMs: number;
		/** The conference's IANA timezone, which "Back at 14:32" is written in. */
		timezone: string;
	};

	let { topic, timer, clockOffsetMs, timezone }: Props = $props();

	/** How often the clock is redrawn: often while it runs, once a second while paused. */
	const RUNNING_TICK_MS = 100;
	const PAUSED_TICK_MS = 1000;

	// The moment the clock is drawn at. A paused caucus still ticks, because its
	// "Back at" moves on with the wall clock.
	const roomNow = createRoomNow(
		() => (timer.endsAt === null ? PAUSED_TICK_MS : RUNNING_TICK_MS),
		() => clockOffsetMs
	);
	// `$derived` works these out again every time `now` moves on.
	const face = $derived(clockFace(timer, roomNow.now, timer.totalSeconds ?? 0));
	const backAt = $derived(unmodBackAtText(timer, roomNow.now, timezone));
</script>

<!--
	An unmoderated caucus on a phone: the clock, centred and larger than a
	speaker's, when the room is back, and the bar. No list: nobody is called.
-->
<LivePanel title={caucusTitle('unmoderated_caucus', topic)}>
	<div class="flex flex-col items-center">
		<FloorClock secondsLeft={face.secondsLeft} clockState={face.clockState} size="phoneUnmod" />
		{#if backAt}
			<p class="text-ink-600 tabular-nums">{backAt}</p>
		{/if}
	</div>
	<ProgressLine
		spokenSeconds={face.spokenSeconds}
		totalSeconds={face.totalSeconds}
		clockState={face.clockState}
		isLegendShown={false}
	/>
</LivePanel>

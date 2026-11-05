<script lang="ts">
	import FloorClock from '$lib/components/room/floor/FloorClock.svelte';
	import { caucusTitle } from '$lib/caucus-view';
	import type { TimerSetting } from '$lib/committee-room';
	import { clockFace } from '$lib/floor-clock';
	import { createRoomNow } from '$lib/room-now.svelte';
	import { unmodBackAtText } from '$lib/watched-floor';

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
	const title = $derived(caucusTitle('unmoderated_caucus', topic));
</script>

<!--
	An unmoderated caucus on the projector: one huge clock, centred, with the
	caucus above it and when the room is back under it. At zero the clock
	counts up in danger colour; "Back at" holds still.
-->
<div class="flex flex-1 flex-col items-center justify-center gap-[1.6vw] text-center">
	<h1 class="text-[2.4vw]/[1.3] text-ink-600">{title}</h1>
	<FloorClock secondsLeft={face.secondsLeft} clockState={face.clockState} size="displayUnmod" />
	{#if backAt}
		<p class="text-[2.4vw]/[1.3] text-ink-600 tabular-nums">{backAt}</p>
	{/if}
</div>

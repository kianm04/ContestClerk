<script lang="ts">
	import FloorClock from '$lib/components/room/floor/FloorClock.svelte';
	import FloorSpeaker from '$lib/components/room/floor/FloorSpeaker.svelte';
	import ProgressLine from '$lib/components/room/floor/ProgressLine.svelte';
	import { clockFace } from '$lib/floor-clock';
	import { createRoomNow } from '$lib/room-now.svelte';
	import type { FloorScreenView } from '$lib/watched-floor';
	import DisplayCaucusLine from './DisplayCaucusLine.svelte';
	import DisplayNextSpeakers from './DisplayNextSpeakers.svelte';

	// The floor's words and rows, worked out by `floorScreenView` in
	// `$lib/watched-floor.ts`, and the clock offset to count the clock on.
	type Props = FloorScreenView & {
		/** How far the server's clock is ahead of this browser's (`$lib/clock-offset.ts`). */
		clockOffsetMs: number;
	};

	let {
		modeTitle,
		caucus,
		speaker,
		timer,
		speakingTimeSeconds,
		clockNote,
		nextSeats,
		emptyText,
		clockOffsetMs
	}: Props = $props();

	/** How often the clock reads the time while it runs, so each second turns over on time. */
	const TICK_MS = 100;

	// The moment the clock is drawn at, on the server's clock. It moves on only
	// while the speaker's clock runs; a ready or paused clock stands still.
	const roomNow = createRoomNow(
		() => (timer.endsAt === null ? null : TICK_MS),
		() => clockOffsetMs
	);
	// `$derived` works the face out again every time `now` moves on.
	const face = $derived(clockFace(timer, roomNow.now, speakingTimeSeconds));
</script>

<!--
	The GSL, a moderated caucus or a single speaker on the projector: the mode
	line, the caucus clock in a moderated caucus, then the speaker, their
	clock at the right of its row and the bar, and the next three along the
	bottom. With nobody on the floor a quiet sentence takes the speaker's place.
-->
<h1 class="mt-[3vw] text-[2.2vw]/[1.2] font-medium text-ink-600">{modeTitle}</h1>

<div class="flex min-h-0 flex-1 flex-col justify-center gap-[1.6vw]">
	{#if caucus}
		<DisplayCaucusLine {caucus} {clockOffsetMs} />
	{/if}

	{#if speaker}
		<FloorSpeaker seat={speaker} size="display" />
		<div class="flex items-baseline justify-between gap-[2vw]">
			<p class="text-[2vw]/[1.2] text-ink-600">{clockNote ?? ''}</p>
			<FloorClock secondsLeft={face.secondsLeft} clockState={face.clockState} size="display" />
		</div>
		<ProgressLine
			spokenSeconds={face.spokenSeconds}
			totalSeconds={face.totalSeconds}
			clockState={face.clockState}
			isLegendShown={false}
			size="display"
		/>
	{:else}
		<p class="font-display text-[5vw]/[1.1] font-semibold text-balance text-ink-600">
			{emptyText}
		</p>
	{/if}
</div>

<DisplayNextSpeakers seats={nextSeats} />

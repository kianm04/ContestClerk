<script lang="ts">
	import ProgressLine from '$lib/components/room/floor/ProgressLine.svelte';
	import type { CaucusClock } from '$lib/caucus-clock';
	import { caucusLine } from '$lib/caucus-view';
	import { createRoomNow } from '$lib/room-now.svelte';

	type Props = {
		/** The moderated caucus's own clock: its total, and when it ends or what it has left. */
		caucus: CaucusClock;
		/** How far the server's clock is ahead of this browser's (`$lib/clock-offset.ts`). */
		clockOffsetMs: number;
	};

	let { caucus, clockOffsetMs }: Props = $props();

	/** How often the line is redrawn while the caucus clock runs. */
	const TICK_MS = 250;

	// The moment the line is drawn at, moved on only while the caucus clock runs.
	const roomNow = createRoomNow(
		() => (caucus.endsAt === null ? null : TICK_MS),
		() => clockOffsetMs
	);
	// `$derived` works the line out again whenever `now` moves on or the clock changes.
	const line = $derived(caucusLine(caucus, roomNow.now));
</script>

<!--
	The caucus clock as one line above the speaker: "Caucus 6:12 left" and its
	own thin bar, as wide as the rest of the line, or "Caucus time is up" in
	danger colour once it has run out. No buttons: the projector only shows.
-->
<div class="flex items-center gap-[2vw] text-[2vw]/[1.2] whitespace-nowrap tabular-nums">
	<p role="timer" aria-label="Caucus time left">
		{#if line.isTimeUp}
			<strong class="font-semibold text-danger-700">Caucus time is up</strong>
		{:else}
			Caucus <strong class="font-semibold">{line.timeLeft}</strong> left
		{/if}
	</p>
	<div class="min-w-0 flex-1">
		<ProgressLine
			spokenSeconds={line.usedSeconds}
			totalSeconds={line.totalSeconds}
			clockState={line.clockState}
			isLegendShown={false}
			isThin
			size="display"
		/>
	</div>
</div>

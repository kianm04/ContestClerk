<script lang="ts">
	import FloorClock from '$lib/components/room/floor/FloorClock.svelte';
	import FloorSpeaker from '$lib/components/room/floor/FloorSpeaker.svelte';
	import ProgressLine from '$lib/components/room/floor/ProgressLine.svelte';
	import type { CaucusClock } from '$lib/caucus-clock';
	import type { RoomSeat, TimerSetting } from '$lib/committee-room';
	import { clockFace } from '$lib/floor-clock';
	import { createRoomNow } from '$lib/room-now.svelte';
	import { readerPlaceText, type ReaderWaitBasis } from '$lib/watched-floor';
	import LiveCaucusLine from './LiveCaucusLine.svelte';
	import LivePanel from './LivePanel.svelte';
	import LiveYouNote from './LiveYouNote.svelte';

	type Props = {
		/** "General Speakers’ List", "Moderated caucus · {topic}" or "Single speaker · Right of reply". */
		modeTitle: string;
		/** A moderated caucus's own clock, or null in the other two modes. */
		caucus: CaucusClock | null;
		/** Who has the floor, or null when nobody has. */
		speaker: RoomSeat | null;
		/** The speaker's clock, as stored. */
		timer: TimerSetting;
		/** The list's speaking time, shown in full while the speaker's clock is not set. */
		speakingTimeSeconds: number;
		/** Whether the reader's own seat has the floor. */
		isReadersFloor: boolean;
		/** What "You are 2nd · about 3 min" is worked out from, or null for staff watching. */
		readerWait: ReaderWaitBasis | null;
		/** How far the server's clock is ahead of this browser's (`$lib/clock-offset.ts`). */
		clockOffsetMs: number;
	};

	let {
		modeTitle,
		caucus,
		speaker,
		timer,
		speakingTimeSeconds,
		isReadersFloor,
		readerWait,
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
	// `$derived` works these out again every time `now` moves on, so the
	// reader's wait follows the clock as it runs.
	const face = $derived(clockFace(timer, roomNow.now, speakingTimeSeconds));
	const placeText = $derived(readerPlaceText(readerWait, speaker ? face.secondsLeft : null));
</script>

<!--
	The floor of the GSL, a moderated caucus or a single speaker, on a phone:
	the caucus clock in a moderated caucus, "You have the floor" when it is the
	reader's, the speaker, their clock left-aligned under them and the bar,
	then the reader's place in the list.
-->
<LivePanel title={modeTitle}>
	{#if caucus}
		<LiveCaucusLine {caucus} {clockOffsetMs} />
	{/if}

	{#if speaker}
		{#if isReadersFloor}
			<LiveYouNote text="You have the floor" />
		{/if}
		<FloorSpeaker seat={speaker} size="phone" />
		<FloorClock secondsLeft={face.secondsLeft} clockState={face.clockState} size="phone" />
		<ProgressLine
			spokenSeconds={face.spokenSeconds}
			totalSeconds={face.totalSeconds}
			clockState={face.clockState}
			isLegendShown={false}
		/>
	{:else}
		<p class="text-ink-600">Nobody has the floor</p>
	{/if}

	{#if placeText}
		<LiveYouNote text={placeText} />
	{/if}
</LivePanel>

<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import FloorClock from '$lib/components/room/floor/FloorClock.svelte';
	import FloorSpeaker from '$lib/components/room/floor/FloorSpeaker.svelte';
	import FloorTimer from '$lib/components/room/floor/FloorTimer.svelte';
	import ProgressLine from '$lib/components/room/floor/ProgressLine.svelte';
	import QueueRow from '$lib/components/room/queue/QueueRow.svelte';
	import SeatList from '$lib/components/room/SeatList.svelte';
	import TallyBar from '$lib/components/room/vote/TallyBar.svelte';
	import type { RoomSeat } from '$lib/committee-room';
	import {
		SAMPLE_ATTENDANCE,
		SAMPLE_SEATS,
		SAMPLE_SPEAKER,
		SAMPLE_WAITING_ENTRIES,
		sampleTimerEndsAt
	} from '$lib/styleguide-samples';
	import { styleguideUrl } from '$lib/urls';
	import Example from './Example.svelte';
	import Group from './Group.svelte';

	// Worked out once, when the page is drawn: a speaker's clock that ends in a
	// little under five minutes, so it is still running while somebody looks at it.
	const runningTimer = {
		totalSeconds: 300,
		endsAt: sampleTimerEndsAt(287),
		pausedRemainingSeconds: null
	};

	/** A single speaker typed by name, who holds no seat: the flag's box shows their initials. */
	const TYPED_SPEAKER: RoomSeat = { id: 'entry-sg', name: 'Secretary-General', countryCode: null };

	// Each seat links back to this page with `?seat=<id>`, the way the chair's
	// notes page chooses a seat. Nothing here reads it back.
	function seatHref(seat: RoomSeat): ResolvedPathname {
		return styleguideUrl({ seat: seat.id });
	}
</script>

<!--
	The pieces the chair's console, the projector and the delegate's phone all
	draw the room with (`03-design/components.md`, "The session console").
-->
<Group id="room" title="Committee room">
	<Example name="FloorTimer" props="timer running, speakingTimeSeconds=300, clockOffsetMs=0">
		<FloorTimer timer={runningTimer} speakingTimeSeconds={300} clockOffsetMs={0} />
	</Example>

	<Example name="FloorClock" props="secondsLeft=83, clockState='paused'">
		<FloorClock secondsLeft={83} clockState="paused" />
	</Example>

	<Example name="FloorClock" props="secondsLeft=7 (warning), -7 (over), size='phone'">
		<div class="flex flex-wrap items-baseline gap-8">
			<FloorClock secondsLeft={7} clockState="running" size="phone" />
			<FloorClock secondsLeft={-7} clockState="running" size="phone" />
		</div>
	</Example>

	<Example name="ProgressLine" props="spokenSeconds=38, totalSeconds=90, clockState='paused'">
		<ProgressLine spokenSeconds={38} totalSeconds={90} clockState="paused" />
	</Example>

	<Example name="FloorSpeaker" props="seat, size='console' | 'phone'">
		<div class="flex flex-col gap-6">
			<FloorSpeaker seat={SAMPLE_SPEAKER} />
			<FloorSpeaker seat={TYPED_SPEAKER} size="phone" />
		</div>
	</Example>

	<Example name="QueueRow" props="entry, index, isAbsent, isReader (to read only, S13)">
		<ol class="@container">
			<!-- The `(entry.id)` key lets Svelte reuse rows instead of rebuilding them. -->
			{#each SAMPLE_WAITING_ENTRIES as entry, index (entry.id)}
				<QueueRow {entry} {index} isAbsent={index === 1} isReader={index === 0} />
			{/each}
		</ol>
	</Example>

	<Example name="SeatList" props="seats, attendance, hrefForSeat, selectedSeatId='seat-br'">
		<SeatList
			seats={SAMPLE_SEATS}
			attendance={SAMPLE_ATTENDANCE}
			hrefForSeat={seatHref}
			selectedSeatId="seat-br"
		/>
	</Example>

	<Example name="TallyBar" props="counts 6–2–1, majority='simple', showsMark (an open vote)">
		<TallyBar counts={{ for: 6, against: 2, abstain: 1 }} majority="simple" showsMark />
	</Example>

	<Example name="TallyBar" props="counts 9–5–0, majority='two_thirds', showsMark={false}">
		<TallyBar counts={{ for: 9, against: 5, abstain: 0 }} majority="two_thirds" showsMark={false} />
	</Example>
</Group>

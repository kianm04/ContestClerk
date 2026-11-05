<script lang="ts">
	import RoomLiveUpdates from '$lib/components/room/RoomLiveUpdates.svelte';
	import { createClockOffsetGuess } from '$lib/clock-offset';
	import type { LiveStatus } from '$lib/committee-room-live';
	import { createRoomNow } from '$lib/room-now.svelte';
	import { attendanceText, roomScreen } from '$lib/room-screen';
	import { committeeLiveUrl, committeePapersUrl } from '$lib/urls';
	import { floorScreenView, readerOnFloor } from '$lib/watched-floor';
	import { readerAnswerText, watchedVoteCounts } from '$lib/watched-vote';
	import LiveContext from './LiveContext.svelte';
	import LiveCrisisUpdate from './LiveCrisisUpdate.svelte';
	import LiveFloor from './LiveFloor.svelte';
	import LiveMessage from './LiveMessage.svelte';
	import LiveAmendmentsLine from './LiveAmendmentsLine.svelte';
	import LivePaperLine from './LivePaperLine.svelte';
	import LiveSideColumn from './LiveSideColumn.svelte';
	import LiveStatusBar from './LiveStatusBar.svelte';
	import LiveUnmod from './LiveUnmod.svelte';
	import LiveVote from './LiveVote.svelte';
	// `./$types` holds the types SvelteKit writes for this one route.
	import type { PageProps } from './$types';

	// `data` is whatever `load` in `+page.server.ts` returned, with the clock
	// offset `+page.ts` added. Realtime runs that `load` again after every change
	// the chair makes, and `data` is replaced.
	let { data }: PageProps = $props();

	/** How often a suspension's "in 41 min" is worked out again. */
	const SUSPENDED_TICK_MS = 1000;

	// `$state` makes Svelte redraw what reads it. Null until the browser has
	// started listening, so a page without JavaScript never claims a connection.
	let liveStatus: LiveStatus | null = $state(null);

	// How far the server's clock is ahead of this browser's, so every clock
	// counts on the server's time (`$lib/clock-offset.ts`).
	const clockOffsetGuess = createClockOffsetGuess();
	const clockOffsetMs = $derived(clockOffsetGuess.learn(data.clockOffsetSampleMs));
	// The moment the suspended screen's countdown is drawn at; it stands still otherwise.
	const roomNow = createRoomNow(
		() => (data.committeeState.mode === 'suspended' ? SUSPENDED_TICK_MS : null),
		() => clockOffsetMs
	);

	// `$derived` works these out again whenever `data` is replaced: which screen
	// the room is on (`$lib/room-screen.ts`, shared with the projector), and
	// what its floor shows.
	const screen = $derived(roomScreen(data, 'phone', roomNow.now));
	const floorView = $derived(screen.kind === 'floor' ? screen.view : null);
	const floor = $derived(floorView ? floorScreenView(data, floorView, 'phone') : null);
	const seatName = $derived(data.seats.find((seat) => seat.id === data.mySeatId)?.name ?? null);

	function handleLiveStatusChange(status: LiveStatus) {
		liveStatus = status;
	}
</script>

<svelte:head>
	<title>Live · {data.committee.name} · MUNMeet</title>
</svelte:head>

<RoomLiveUpdates
	supabase={data.supabase}
	committeeId={data.committee.id}
	speakersListId={data.committeeState.activeSpeakersListId}
	sessionId={data.committeeState.currentSessionId}
	rollCallId={data.latestRollCallId}
	voteId={data.committeeState.currentVoteId}
	status={liveStatus}
	onStatusChange={handleLiveStatusChange}
/>

<div class="flex flex-col gap-3">
	<LiveContext
		committee={data.committee}
		agendaTopic={data.committeeState.agendaTopic}
		{seatName}
		attendanceText={attendanceText(data)}
		{liveStatus}
		papersTitle={data.papersTitle}
		papersHref={committeePapersUrl(data.conference.slug, data.committee.slug)}
	/>

	<LiveStatusBar
		status={liveStatus}
		refreshHref={committeeLiveUrl(data.conference.slug, data.committee.slug)}
	/>

	<!-- A crisis committee's latest update, read out when a new one comes, as the message below. -->
	<div aria-live="polite">
		{#if data.crisisUpdate}
			<LiveCrisisUpdate update={data.crisisUpdate} timeZone={data.conference.timezone} />
		{/if}
	</div>

	<!--
		On a phone the panels stack in the order written, so the speaker, the
		clock and the reader's place come first. From `lg` the floor (or the
		message, or the vote) is on the left and the list and the motion on the
		right, 26rem wide, as the console's floor and queue. `minmax(0, 1fr)`
		lets the left column shrink instead of pushing the page wider.
	-->
	<div class="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-6">
		<div class="min-w-0">
			<!--
				A polite live region: a screen reader reads out a change to the
				message inside once the reader is idle. It is always on the page,
				even empty, because a region that appears together with its words
				is often not read at all. The floor, the clock and the lists stay
				outside it, since they change too often to be read aloud usefully.
			-->
			<div aria-live="polite">
				{#if screen.kind === 'message'}
					<LiveMessage title={screen.title} lines={screen.lines} />
				{/if}
			</div>

			{#if floor}
				<LiveFloor {...floor} {...readerOnFloor(data, floor)} {clockOffsetMs} />
			{:else if screen.kind === 'unmod'}
				<LiveUnmod
					topic={data.currentMotion?.topic ?? null}
					timer={data.committeeState.timer}
					{clockOffsetMs}
					timezone={data.conference.timezone}
				/>
			{:else if screen.kind === 'vote' && data.currentVote}
				<LiveVote
					vote={data.currentVote}
					counts={watchedVoteCounts(data.currentVote)}
					answerText={readerAnswerText(data.currentVote, data.mySeatId, data.attendance)}
				/>
			{/if}

			<LivePaperLine {screen} room={data} />
			<LiveAmendmentsLine waiting={data.amendmentsToAnswer} room={data} />
		</div>

		<LiveSideColumn
			view={floorView}
			speakers={data.speakers}
			attendance={data.attendance}
			mySeatId={data.mySeatId}
			floorMotion={data.floorMotion}
		/>
	</div>
</div>

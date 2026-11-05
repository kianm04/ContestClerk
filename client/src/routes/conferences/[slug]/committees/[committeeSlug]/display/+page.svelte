<script lang="ts">
	import RoomLiveUpdates from '$lib/components/room/RoomLiveUpdates.svelte';
	import { createClockOffsetGuess } from '$lib/clock-offset';
	import type { LiveStatus } from '$lib/committee-room-live';
	import { paperShownOnScreen } from '$lib/papers-on-floor';
	import { createRoomNow } from '$lib/room-now.svelte';
	import { attendanceText, roomScreen } from '$lib/room-screen';
	import { floorScreenView } from '$lib/watched-floor';
	import { watchedVoteCounts } from '$lib/watched-vote';
	import DisplayAmendmentVote from './DisplayAmendmentVote.svelte';
	import DisplayCrisisUpdate from './DisplayCrisisUpdate.svelte';
	import DisplayFloor from './DisplayFloor.svelte';
	import DisplayFrame from './DisplayFrame.svelte';
	import DisplayMessage from './DisplayMessage.svelte';
	import DisplayPaper from './DisplayPaper.svelte';
	import DisplayUnmod from './DisplayUnmod.svelte';
	import DisplayVote from './DisplayVote.svelte';
	// `./$types` holds the types SvelteKit writes for this one route.
	import type { PageProps } from './$types';

	// `data` is whatever `load` in `+page.server.ts` returned, with the clock
	// offset `+page.ts` added. Realtime runs that `load` again after every change
	// the chair makes, and `data` is replaced.
	let { data }: PageProps = $props();

	/** How often a suspension's "in 41 min" is worked out again. */
	const SUSPENDED_TICK_MS = 1000;

	// `$state` makes Svelte redraw what reads it. Null until the browser has
	// started listening, so a page without JavaScript never claims to be paused.
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
	// the room is on (`$lib/room-screen.ts`, shared with the phones), and what it shows.
	const screen = $derived(roomScreen(data, 'display', roomNow.now));
	const floor = $derived(
		screen.kind === 'floor' ? floorScreenView(data, screen.view, 'display') : null
	);
	// The paper the dais put on screen takes the place of the floor and the Unmod clock.
	const paper = $derived(paperShownOnScreen(screen, data.paperOnScreen));

	function handleLiveStatusChange(status: LiveStatus) {
		liveStatus = status;
	}
</script>

<svelte:head>
	<title>Display · {data.committee.abbreviation ?? data.committee.name} · MUNMeet</title>
	<!--
		Without JavaScript nothing tells the page the room has changed, so it
		reloads itself every fifteen seconds: an unattended projector is never
		wrong for long. With JavaScript the browser ignores `<noscript>`.
	-->
	<noscript><meta http-equiv="refresh" content="15" /></noscript>
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

<DisplayFrame
	committee={data.committee}
	agendaTopic={data.committeeState.agendaTopic}
	timezone={data.conference.timezone}
	{clockOffsetMs}
	attendance={attendanceText(data)}
	{liveStatus}
>
	{#if screen.kind === 'message'}
		<DisplayMessage title={screen.title} lines={screen.lines} />
	{:else if paper}
		<DisplayPaper {paper} />
	{:else if floor}
		<DisplayFloor {...floor} {clockOffsetMs} />
	{:else if screen.kind === 'unmod'}
		<DisplayUnmod
			topic={data.currentMotion?.topic ?? null}
			timer={data.committeeState.timer}
			{clockOffsetMs}
			timezone={data.conference.timezone}
		/>
	{:else if data.currentVote && data.amendmentVote}
		<DisplayAmendmentVote
			vote={data.currentVote}
			amendment={data.amendmentVote}
			counts={watchedVoteCounts(data.currentVote)}
			presentCount={data.presentCount}
		/>
	{:else if data.currentVote}
		<DisplayVote vote={data.currentVote} counts={watchedVoteCounts(data.currentVote)} />
	{/if}
	{#if data.crisisUpdate}
		<DisplayCrisisUpdate update={data.crisisUpdate} timeZone={data.conference.timezone} />
	{/if}
</DisplayFrame>

<script lang="ts">
	// `page` from `$app/state` is the page being shown; its address builds End's link.
	import { page } from '$app/state';
	import { consoleFrame, sessionsAfterFrame } from '$lib/chair-frame';
	import { sharedChairForm, speakersAfterPresses } from '$lib/chair-form';
	import { liveRoomScreen, runningSinceText } from '$lib/chair-room';
	import { endedSummaryView } from '$lib/room-ended';
	import { lobbyView } from '$lib/room-ready';
	import { suspendedScreenView } from '$lib/room-suspended';
	import { sharedRollCallForm } from '$lib/roll-call-preview';
	import { pageWithQuery } from '$lib/urls';
	import EndedSummary from '$lib/components/room/session/EndedSummary.svelte';
	import Lobby from '$lib/components/room/session/Lobby.svelte';
	import SuspendedFloor from '$lib/components/room/session/SuspendedFloor.svelte';
	import LiveRoomView from './LiveRoomView.svelte';
	// `PageProps` is the type of this page's props, which SvelteKit writes into
	// `./$types` for this folder from what the `load` functions return.
	import type { PageProps } from './$types';

	// `data` holds what the chair layout's `load` returned and what this page's
	// `load` added in `+page.server.ts`. Both run again whenever realtime reports
	// a change in the room, and `data` is replaced with the fresh result. `form`
	// is what a refused action sent back, such as "Open vote" with what was typed.
	let { data, form }: PageProps = $props();

	// The chair layout's instant forms (`$lib/chair-form.ts`, `$lib/roll-call-preview.ts`).
	// The page draws its data with the presses still on their way laid on top,
	// so each one shows the moment it is made.
	const chairForm = sharedChairForm();
	const rollCallForm = sharedRollCallForm();
	// The room's state the same way the frame works it out (`consoleFrame`), so
	// the two never disagree, and the one screen that state draws.
	const shown = $derived(consoleFrame(data, 'chair', chairForm.presses, rollCallForm.presses));
	const state = $derived(shown.frame.committeeState);
	const screen = $derived(liveRoomScreen(shown.roomState, state.mode));
	const runningSince = $derived(
		runningSinceText(shown.frame.currentSession, data.today, data.conference.timezone)
	);
	// The sessions with "End session" laid on top, so the ended screen shows at the press.
	const room = $derived({
		...data,
		sessions: sessionsAfterFrame(data.sessions, shown.frame.currentSession)
	});

	// Each screen's words, worked out only while that screen is drawn.
	const lobby = $derived(
		screen === 'lobby' ? lobbyView(room, data.lobbyFacts, state.agendaTopic) : null
	);
	const ended = $derived(screen === 'ended' ? endedSummaryView(room, data.lobbyFacts) : null);
	// The list the suspended room was working through. At the press of Suspend,
	// before `load` has read it, the GSL this page already has stands in.
	const suspendedEntries = $derived(
		speakersAfterPresses(
			data.suspendedRoom?.speakers ?? data.gsl?.speakers ?? [],
			state.activeSpeakersListId,
			chairForm.presses
		)
	);
	const suspendedFacts = $derived({
		state,
		storedMode: data.committeeState.mode,
		entries: suspendedEntries,
		voteSubject: data.suspendedRoom?.voteSubject ?? null,
		reason: data.suspendedRoom?.reason ?? null
	});
	const suspended = $derived(
		screen === 'suspended' ? suspendedScreenView(suspendedFacts, new Date()) : null
	);
</script>

<!--
	The live room draws exactly one screen at a time, chosen by the room's
	state and its live mode (`liveRoomScreen`, `committee-room.md`, "The
	room's states"): the lobby, the suspended screen, the ended screen, or the
	view of the mode the room is in (`LiveRoomView`: the GSL view with the
	opening band above it until the first speaker is called, the Mod, Unmod,
	Single speaker or Vote view). A session left running overnight says so in
	one neutral line.
-->
{#if runningSince}
	<p class="border-b border-line px-5 py-2 text-small text-ink-600 max-md:px-3">{runningSince}</p>
{/if}

{#if lobby}
	<Lobby view={lobby} />
{:else if ended}
	<EndedSummary view={ended} />
{:else if suspended}
	<SuspendedFloor
		{...suspended}
		{state}
		timezone={data.conference.timezone}
		clockOffsetSampleMs={data.clockOffsetSampleMs}
		endHref={pageWithQuery(page.url, 'end', 'confirm')}
	/>
{:else if screen !== 'lobby' && screen !== 'ended' && screen !== 'suspended'}
	<LiveRoomView {screen} {data} {form} presence={shown.presence} />
{/if}

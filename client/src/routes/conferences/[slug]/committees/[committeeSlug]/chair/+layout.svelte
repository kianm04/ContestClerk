<script lang="ts">
	import { onMount } from 'svelte';
	// `page` from `$app/state` is the page being shown. Its route says which
	// chair page the frame is drawn around, and its address builds End's links.
	import { page } from '$app/state';
	import RoomLiveUpdates from '$lib/components/room/RoomLiveUpdates.svelte';
	import ConsoleTop from '$lib/components/room/frame/ConsoleTop.svelte';
	import ModeBar from '$lib/components/room/frame/ModeBar.svelte';
	import ShortcutKeys from '$lib/components/room/frame/ShortcutKeys.svelte';
	import {
		chairPageOfRoute,
		consoleFrame,
		hasOwnPageHeader,
		sessionControlsOf
	} from '$lib/chair-frame';
	import { createChairForm, shareChairForm } from '$lib/chair-form';
	import { createClockOffsetGuess } from '$lib/clock-offset';
	import type { LiveStatus } from '$lib/committee-room-live';
	import { keyView } from '$lib/console-keys';
	import { createShortcutsSetting } from '$lib/console-shortcuts.svelte';
	import { createInstantForm } from '$lib/instant-form.svelte';
	import { liveView } from '$lib/live-mode';
	import { describeRollCallFailure, shareRollCallForm } from '$lib/roll-call-preview';
	import { ROLL_CALL_FROM_FIELD } from '$lib/roll-calls';
	import { hasOpenRollCallVote } from '$lib/votes';
	import type { LayoutProps } from './$types';

	// `data` is what `load` in `+layout.server.ts` returned, with the root
	// layout's; it is read again whenever realtime reports a change in the room.
	// `children` is the chair page drawn inside this frame.
	let { data, children }: LayoutProps = $props();

	// `$state` redraws what reads it. Null until the browser listens, so a page
	// without JavaScript never claims to be live.
	let liveStatus: LiveStatus | null = $state(null);

	// Every button of the chair pages goes through this one instant form, kept
	// here so its presses carry on when the chair moves to another chair page
	// and the frame shows them too. The pages take it from context, as they do
	// the roll call's form, which lets the chip count an answer at the press.
	const chairForm = createChairForm(() => data.seats);
	shareChairForm(chairForm);
	const rollCallForm = createInstantForm({
		describeFailure: (press) => describeRollCallFailure(press, data.seats)
	});
	shareRollCallForm(rollCallForm);

	// How far the server's clock is ahead of this browser's (`$lib/clock-offset.ts`);
	// `+layout.ts` takes a fresh reading every time `data` arrives.
	const clockOffsetGuess = createClockOffsetGuess();
	const clockOffsetMs = $derived(clockOffsetGuess.learn(data.clockOffsetSampleMs));

	// Which chair page this is, and everything the frame draws with the presses
	// on their way laid on top (`consoleFrame` in `$lib/chair-frame.ts`). On the
	// roll call view the chip keeps the page the view was opened from (`?from=`).
	const chairPage = $derived(chairPageOfRoute(page.route.id));
	const fromInAddress = $derived(page.url.searchParams.get(ROLL_CALL_FROM_FIELD));
	const shown = $derived(
		consoleFrame(data, chairPage, chairForm.presses, rollCallForm.presses, fromInAddress)
	);

	// The "Keyboard shortcuts" switch; `onMount` runs once, in the browser,
	// where the switch this browser remembered can be read.
	const shortcuts = createShortcutsSetting();
	onMount(shortcuts.readRemembered);

	// End's confirmation, open from `?end=confirm` without JavaScript and then
	// by the chair's presses. The first `$derived` passes a change on only when
	// the address's answer changes, so a realtime reload does not reopen it.
	const isEndConfirmInAddress = $derived(data.isEndConfirmOpen);
	let isEndConfirming = $derived(isEndConfirmInAddress);

	// Suspend and End, in the mode bar and, on a phone, in the committee menu.
	const sessionControls = $derived(
		sessionControlsOf(shown, {
			clockOffsetMs,
			isConfirming: isEndConfirming,
			url: page.url,
			onAskToEnd: () => (isEndConfirming = true),
			onKeepGoing: () => (isEndConfirming = false)
		})
	);
</script>

<!--
	The chair console: the top bar (and the live strip when the chair looks
	away from the live view), the page, and the mode bar while a session runs.
	It is exactly the window's height on plain `surface`, so the bars stay put
	and only the page between them scrolls (`committee-room.md`, "The frame").
	A printed page, such as a paper saved as a PDF, leaves the bars out
	(`print:hidden` on each).
-->
<div class="flex h-dvh flex-col bg-surface print:block print:h-auto">
	<ConsoleTop
		{data}
		{shown}
		{chairPage}
		{liveStatus}
		{clockOffsetMs}
		submitExpecting={chairForm.submitExpecting}
		{shortcuts}
		{sessionControls}
	/>

	<!-- The root layout leaves `<main>` to the chair pages, so the bars sit outside it. -->
	<main id="main" class="flex min-h-0 flex-1 flex-col overflow-y-auto print:block">
		{#if hasOwnPageHeader(chairPage)}
			<!-- `min-w-0` lets the page be narrower than its contents instead of widening the screen. -->
			<div class="mx-auto w-full max-w-[1760px] min-w-0 px-4 py-4 md:px-6 md:py-6">
				{@render children()}
			</div>
		{:else}
			{@render children()}
		{/if}
	</main>

	{#if shown.isModeBarShown}
		<ModeBar
			tabs={shown.tabs}
			conferenceSlug={data.conference.slug}
			committeeSlug={data.committee.slug}
			{sessionControls}
		/>
	{/if}
</div>

<!--
	The keys of the console. While a roll call vote is open, Y, N and A answer
	the seat its marker is on, and N never calls a speaker. `page.data` is the
	page's own data; the Vote view's pages (`chair/voting`, and `chair` while
	the room votes) return it as `voteView`, which says whether one is open.
-->
<ShortcutKeys
	isEnabled={shortcuts.isOn}
	view={keyView(chairPage, liveView(shown.frame.committeeState.mode))}
	isRollCallVoteOpen={hasOpenRollCallVote(page.data.voteView)}
	onShowKeyList={shortcuts.askForKeyList}
/>
<RoomLiveUpdates
	supabase={data.supabase}
	committeeId={data.committee.id}
	speakersListId={data.committeeState.activeSpeakersListId}
	generalSpeakersListId={data.generalSpeakersListId}
	sessionId={data.committeeState.currentSessionId}
	rollCallId={data.latestRollCallId}
	voteId={data.committeeState.currentVoteId}
	status={liveStatus}
	onStatusChange={(status) => (liveStatus = status)}
/>

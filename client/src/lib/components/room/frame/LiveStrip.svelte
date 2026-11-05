<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import type { ChairForm } from '$lib/chair-form';
	import {
		liveStripControls,
		liveStripLine,
		type ChairFrameLinks,
		type LiveStripRoom
	} from '$lib/chair-frame';
	import type { CaucusClockSetting } from '$lib/caucus-clock';
	import type { ModeRoomState } from '$lib/caucus-presses';
	import { serverNow } from '$lib/clock-offset';
	import { modeStripControls, modeStripText, type ModeEndActions } from '$lib/mode-strip';
	import type { Floor } from '$lib/room-presses';
	import ProgressLine from '../floor/ProgressLine.svelte';
	import StripControls from './StripControls.svelte';

	type Props = {
		/** The live mode, its clock, its list and who is present (`LiveStripRoom`). */
		live: LiveStripRoom;
		/** What the clock and "Next" work on (`roomFloor` in `$lib/room-presses.ts`). */
		floor: Floor;
		/** The room's state as shown, which "End caucus" and "Return to GSL" change at the press. */
		committeeState: ModeRoomState;
		/** The session's General Speakers' List, which "End caucus" and "Return to GSL" put back. */
		generalListId: string | null;
		/** The live room, where the strip's words lead. */
		roomHref: ResolvedPathname;
		/** The live room's actions, naming the page the chair is on (`chairFrameLinks`). */
		links: ChairFrameLinks;
		/** How far the server's clock is ahead of this browser's (`$lib/clock-offset.ts`). */
		clockOffsetMs: number;
		/** The chair's instant form, which shows a press at once (`$lib/chair-form.ts`). */
		submitExpecting: ChairForm['submitExpecting'];
		/** Where "End caucus" and "Return to GSL" post from this page (`modeEndActions`). */
		endActions: ModeEndActions;
		/** The room's caucus clock, which a moderated caucus's line names (S7). */
		caucusClock?: CaucusClockSetting;
	};

	let {
		live,
		floor,
		committeeState,
		generalListId,
		roomHref,
		links,
		clockOffsetMs,
		submitExpecting,
		endActions,
		caucusClock
	}: Props = $props();

	/** How often the clock is read while it runs, so a second turns over within a tenth of one. */
	const TICK_MS = 100;

	// `$state` makes Svelte redraw what reads it: the browser's clock, moved on below.
	let browserNow = $state(new Date());
	const now = $derived(serverNow(clockOffsetMs, browserNow));
	// `$derived` works the words, the bar and the buttons out again as the room or the time changes.
	const line = $derived(liveStripLine(live, now));
	// The Mod, Unmod and Single speaker views' own words and primary (`$lib/mode-strip.ts`).
	const text = $derived(modeStripText(line.text, live, caucusClock, now));
	const controls = $derived(modeStripControls(liveStripControls(live), live, caucusClock, now));
	const liveMode = $derived({
		state: committeeState,
		generalListId,
		caucusClock: live.mode === 'moderated_caucus' ? (caucusClock ?? null) : null,
		endActions
	});
	const isRunning = $derived(
		live.timer.endsAt !== null && live.timer.pausedRemainingSeconds === null
	);

	/*
		`$effect` is how a component talks to something outside Svelte, here the
		browser's clock. It runs again whenever `isRunning` changes: a running
		clock ticks, a paused one does not. The function it returns stops the
		ticking when the clock stops or the strip leaves the page.
	*/
	$effect(() => {
		if (!isRunning) return;

		browserNow = new Date();
		const interval = setInterval(() => (browserNow = new Date()), TICK_MS);

		return () => clearInterval(interval);
	});
</script>

<!--
	The live view in one line, while the chair looks at another view: what is
	live, its clock and bar, then its most used buttons (`committee-room.md`,
	"Live strip"). It is the one tinted band of the console. Its words lead to
	the live room. On a phone it keeps its words and its primary only.

	The bar is the floor's `ProgressLine`, so the two always agree.
-->
<div
	class="flex h-11 shrink-0 items-center gap-4 border-b border-line bg-brand-50 pr-2 pl-3 text-small whitespace-nowrap md:pr-4 md:pl-5 print:hidden"
>
	<a href={roomHref} class="group/live flex min-w-0 items-center gap-2.5">
		<span class="inline-flex items-center gap-1.5 font-semibold">
			<span class="size-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden="true"></span>
			Live
		</span>
		<span class="truncate tabular-nums group-hover/live:underline">{text}</span>
	</a>

	<!-- The floor's own bar, without its legend and 4px thick, in a short line beside the words. -->
	{#if line.face}
		<div class="w-24 shrink-0 max-md:hidden">
			<ProgressLine
				spokenSeconds={line.face.spokenSeconds}
				totalSeconds={line.face.totalSeconds}
				clockState={line.face.clockState}
				isLegendShown={false}
				isThin
			/>
		</div>
	{/if}

	<StripControls
		{controls}
		{floor}
		timer={live.timer}
		{links}
		{clockOffsetMs}
		{submitExpecting}
		{liveMode}
	/>
</div>

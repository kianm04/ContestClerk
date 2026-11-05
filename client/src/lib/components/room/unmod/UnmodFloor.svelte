<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import { backAtText, caucusTitle, raisedByLine, type CaucusMotion } from '$lib/caucus-view';
	import type { TimerSetting } from '$lib/committee-room';
	import { clockFace } from '$lib/floor-clock';
	import {
		FLOOR_CLASSES,
		FLOOR_CONTROLS_CLASSES,
		FLOOR_HEADER_CLASSES,
		FLOOR_PRIMARY_CLASSES
	} from '$lib/floor-classes';
	import { createRoomNow } from '$lib/room-now.svelte';
	import FloorClock from '../floor/FloorClock.svelte';
	import FloorMessage from '../floor/FloorMessage.svelte';
	import ProgressLine from '../floor/ProgressLine.svelte';
	import CaucusHeading from '../mod/CaucusHeading.svelte';
	import ModeEndButton from '../mod/ModeEndButton.svelte';
	import UnmodControls from './UnmodControls.svelte';

	type Props = {
		/** The caucus, which the title names, or null in the moment before it is known. */
		motion: CaucusMotion | null;
		/** The caucus's one clock (the room's timer), with the presses on their way laid on top. */
		timer: TimerSetting;
		/** The conference's time zone, which "back at 14:32" is written in. */
		timeZone: string;
		/** How far the server's clock is ahead of this browser's (`$lib/clock-offset.ts`). */
		clockOffsetMs: number;
		/** The room is suspended in this caucus: no clock and no controls. */
		isSuspended: boolean;
		/** Sends every press through the chair's instant form (`$lib/chair-form.ts`). */
		onSubmit: SubmitFunction;
	};

	let { motion, timer, timeZone, clockOffsetMs, isSuspended, onSubmit }: Props = $props();

	/** How often the clock is redrawn: often while it runs, once a second while paused. */
	const RUNNING_TICK_MS = 100;
	const PAUSED_TICK_MS = 1000;

	// The moment the clock is drawn at. A paused caucus still ticks, because its
	// "back at" moves on with the wall clock.
	const roomNow = createRoomNow(
		() => (timer.endsAt === null ? PAUSED_TICK_MS : RUNNING_TICK_MS),
		() => clockOffsetMs
	);
	const face = $derived(clockFace(timer, roomNow.now, timer.totalSeconds ?? 0));
	const backAt = $derived(backAtText(timer, roomNow.now, timeZone));
	const title = $derived(caucusTitle('unmoderated_caucus', motion?.topic ?? null));
</script>

<!--
	The Unmod view's floor: one clock, centred and larger than the GSL's, the
	only centred clock of the console, with "back at 14:32" under it (what
	delegates ask as they leave their seats) and the bar across the floor. At
	zero it counts up in danger colour; nothing ends by itself. "End caucus" is
	the one filled button throughout, where the GSL's "Next" sits.
-->
<section aria-labelledby="unmod-floor-title" class={FLOOR_CLASSES}>
	<header class={FLOOR_HEADER_CLASSES}>
		<CaucusHeading id="unmod-floor-title" {title} line={motion ? raisedByLine(motion) : null} />
	</header>

	<div
		class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 py-6 text-center max-[860px]:min-h-70 max-[860px]:flex-none max-md:min-h-0 max-md:px-4 max-md:pb-4"
	>
		{#if isSuspended}
			<FloorMessage title="The caucus resumes with the session" line={null} />
		{:else}
			<FloorClock secondsLeft={face.secondsLeft} clockState={face.clockState} size="unmod" />
			{#if backAt}
				<p class="text-xl leading-7 text-ink-600 tabular-nums">{backAt}</p>
			{/if}
			<div class="mt-4 self-stretch">
				<ProgressLine
					spokenSeconds={face.spokenSeconds}
					totalSeconds={face.totalSeconds}
					clockState={face.clockState}
					isLegendShown={false}
				/>
			</div>
		{/if}
	</div>

	{#if !isSuspended}
		<footer class={FLOOR_CONTROLS_CLASSES}>
			<UnmodControls {timer} {onSubmit} />
			<div class={FLOOR_PRIMARY_CLASSES}>
				<ModeEndButton label="End caucus" action="?/endCaucus" note={null} {onSubmit} />
			</div>
		</footer>
	{/if}
</section>

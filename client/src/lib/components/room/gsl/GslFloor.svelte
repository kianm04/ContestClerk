<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { ResolvedPathname } from '$app/types';
	import { formatDuration, type CommitteeMode, type TimerSetting } from '$lib/committee-room';
	import type { GslFloorView } from '$lib/gsl-floor';
	import EmptyFloor from '../floor/EmptyFloor.svelte';
	import FloorSpeaker from '../floor/FloorSpeaker.svelte';
	import FloorTimer from '../floor/FloorTimer.svelte';
	import FloorWaiting from '../floor/FloorWaiting.svelte';
	import NextSpeakerButton from '../floor/NextSpeakerButton.svelte';
	import SpeechControls from '../floor/SpeechControls.svelte';

	type Props = {
		/** What the floor shows: live or waiting, who has it and who is next (`gslFloorView`). */
		floor: GslFloorView;
		/** The live mode, which the waiting floor names. */
		mode: CommitteeMode;
		/** The speaker's timer, with the presses on their way laid on top. */
		timer: TimerSetting;
		/** The GSL's speaking time: "· 1:30 each". */
		speakingTimeSeconds: number;
		/** How far the server's clock is ahead of this browser's (`$lib/clock-offset.ts`). */
		clockOffsetMs: number;
		/** The Notes page open on the speaker's seat, or null while nobody speaks. */
		noteHref: ResolvedPathname | null;
		/** Sends every press through the chair's instant form (`$lib/chair-form.ts`). */
		onSubmit: SubmitFunction;
	};

	let { floor, mode, timer, speakingTimeSeconds, clockOffsetMs, noteHref, onSubmit }: Props =
		$props();
</script>

<!--
	The floor, the left part of the view: the title, then the speaker, the
	clock and its bar in the middle of the free space, and the controls at the
	bottom with the one primary in the bottom right corner. While another mode
	is live it waits, with no clock and no controls. The title takes the focus
	(`tabindex="-1"`) when a press makes the control the chair was on go away.

	On a phone (`max-md:`) the floor's own box is dropped (`contents`), so its
	parts join the view's single column: the queue column comes between the bar
	and the controls, and the controls stick to the bottom of the screen above
	the mode bar.
-->
<section
	aria-labelledby="gsl-floor-title"
	class="flex min-h-0 min-w-0 flex-col px-8 pt-7 pb-6 max-[1100px]:px-6 max-[1100px]:pt-6 max-[1100px]:pb-5 max-md:contents"
>
	<header class="flex items-baseline gap-4 max-md:px-4 max-md:pt-4">
		<h2 id="gsl-floor-title" tabindex="-1" class="text-h3 focus:outline-none">
			General Speakers’ List
			<span class="font-normal text-ink-600">· {formatDuration(speakingTimeSeconds)} each</span>
		</h2>
	</header>

	<div
		class="flex min-h-0 flex-1 flex-col justify-center gap-4 py-6 max-[860px]:min-h-70 max-[860px]:flex-none max-md:min-h-0 max-md:px-4 max-md:pb-4"
	>
		{#if !floor.isLive}
			<FloorWaiting liveMode={mode} />
		{:else if floor.speaking}
			<FloorSpeaker seat={floor.speaking.seat} />
			<FloorTimer {timer} {speakingTimeSeconds} {clockOffsetMs} />
		{:else}
			<EmptyFloor spokeLast={floor.spokeLast} hasWaitingSeat={floor.nextSeat !== null} />
		{/if}
	</div>

	{#if floor.isLive}
		<footer
			class="flex flex-wrap items-end gap-4 max-md:sticky max-md:bottom-0 max-md:z-10 max-md:order-3 max-md:gap-2 max-md:border-t max-md:border-line max-md:bg-surface max-md:px-4 max-md:py-2.5"
		>
			{#if floor.speaking && noteHref}
				<SpeechControls
					{timer}
					startSeconds={speakingTimeSeconds}
					yieldSeats={floor.yieldSeats}
					{noteHref}
					{onSubmit}
				/>
			{/if}
			<div class="ml-auto flex max-[1100px]:w-full max-md:ml-0">
				<NextSpeakerButton
					nextSeat={floor.nextSeat}
					hasSpeaker={floor.speaking !== null}
					isPrimary={floor.isCallFilled}
					{onSubmit}
				/>
			</div>
		</footer>
	{/if}
</section>

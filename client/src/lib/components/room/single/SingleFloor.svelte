<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { ResolvedPathname } from '$app/types';
	import type { TimerSetting } from '$lib/committee-room';
	import {
		FLOOR_BODY_CLASSES,
		FLOOR_CLASSES,
		FLOOR_CONTROLS_CLASSES,
		FLOOR_HEADER_CLASSES,
		FLOOR_PRIMARY_CLASSES
	} from '$lib/floor-classes';
	import type { ListFloorView } from '$lib/list-floor';
	import { singleSpeakerTimeText, singleSpeakerTitle } from '$lib/single-speaker';
	import FloorMessage from '../floor/FloorMessage.svelte';
	import FloorSpeaker from '../floor/FloorSpeaker.svelte';
	import FloorTimer from '../floor/FloorTimer.svelte';
	import NextSpeakerButton from '../floor/NextSpeakerButton.svelte';
	import SpeechControls from '../floor/SpeechControls.svelte';
	import ModeEndButton from '../mod/ModeEndButton.svelte';

	type Props = {
		/** What the floor shows: who has it, who is next and which primary (`singleSpeakerFloorView`). */
		floor: ListFloorView;
		/** "Right of reply", or null when no purpose was given. */
		purpose: string | null;
		/** The speaker's timer, with the presses on their way laid on top. */
		timer: TimerSetting;
		/** The time each speaker gets: "· 1:00" in the title. */
		speakingTimeSeconds: number;
		/** How far the server's clock is ahead of this browser's (`$lib/clock-offset.ts`). */
		clockOffsetMs: number;
		/** Where "Note on this speech" leads, or null while nobody speaks. */
		noteHref: ResolvedPathname | null;
		/** Sends every press through the chair's instant form (`$lib/chair-form.ts`). */
		onSubmit: SubmitFunction;
	};

	let { floor, purpose, timer, speakingTimeSeconds, clockOffsetMs, noteHref, onSubmit }: Props =
		$props();
</script>

<!--
	The Single speaker view's floor: the GSL's floor exactly, with the same
	controls in the same places, titled "Single speaker · Right of reply ·
	1:00". The speaker may be a typed name ("Secretary-General"), drawn with
	its initials where a flag would be and no delegate under it. Once nobody
	waits on "Also speaking", the primary is "Return to GSL".
-->
<section aria-labelledby="single-floor-title" class={FLOOR_CLASSES}>
	<header class={FLOOR_HEADER_CLASSES}>
		<h2 id="single-floor-title" tabindex="-1" class="text-h3 focus:outline-none">
			{singleSpeakerTitle(purpose)}
			<span class="font-normal text-ink-600">{singleSpeakerTimeText(speakingTimeSeconds)}</span>
		</h2>
	</header>

	<div class={FLOOR_BODY_CLASSES}>
		{#if floor.speaking}
			<FloorSpeaker seat={floor.speaking.seat} />
			<FloorTimer {timer} {speakingTimeSeconds} {clockOffsetMs} />
		{:else if floor.words}
			<FloorMessage title={floor.words.title} line={floor.words.line} />
		{/if}
	</div>

	{#if floor.isLive}
		<footer class={FLOOR_CONTROLS_CLASSES}>
			{#if floor.speaking && noteHref}
				<SpeechControls
					{timer}
					startSeconds={speakingTimeSeconds}
					yieldSeats={floor.yieldSeats}
					{noteHref}
					{onSubmit}
				/>
			{/if}
			<div class={FLOOR_PRIMARY_CLASSES}>
				{#if floor.primary === 'returnToGsl'}
					<ModeEndButton label="Return to GSL" action="?/returnToGsl" note={null} {onSubmit} />
				{:else}
					<NextSpeakerButton
						nextSeat={floor.nextSeat}
						hasSpeaker={floor.speaking !== null}
						isPrimary
						{onSubmit}
					/>
				{/if}
			</div>
		</footer>
	{/if}
</section>

<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { ResolvedPathname } from '$app/types';
	import type { CaucusClock } from '$lib/caucus-clock';
	import { caucusTitle, raisedByLine, type CaucusMotion } from '$lib/caucus-view';
	import type { TimerSetting } from '$lib/committee-room';
	import {
		FLOOR_BODY_CLASSES,
		FLOOR_CLASSES,
		FLOOR_CONTROLS_CLASSES,
		FLOOR_HEADER_CLASSES,
		FLOOR_PRIMARY_CLASSES
	} from '$lib/floor-classes';
	import type { ListFloorView } from '$lib/list-floor';
	import FloorMessage from '../floor/FloorMessage.svelte';
	import FloorSpeaker from '../floor/FloorSpeaker.svelte';
	import FloorTimer from '../floor/FloorTimer.svelte';
	import NextSpeakerButton from '../floor/NextSpeakerButton.svelte';
	import SpeechControls from '../floor/SpeechControls.svelte';
	import CaucusClockLine from './CaucusClockLine.svelte';
	import CaucusHeading from './CaucusHeading.svelte';
	import ModeEndButton from './ModeEndButton.svelte';

	type Props = {
		/** What the floor shows: who has it, who is next and which primary (`modFloorView`). */
		floor: ListFloorView;
		/** The caucus, which the title names, or null in the moment before it is known. */
		motion: CaucusMotion | null;
		/** The caucus's own clock, or null when none is set. */
		clock: CaucusClock | null;
		/** The moment the caucus clock line is drawn at, moved on while it runs. */
		now: Date;
		/** The speaker's timer, with the presses on their way laid on top. */
		timer: TimerSetting;
		/** The caucus's speaking time, which "Start" gives a speaker with no timer at all. */
		speakingTimeSeconds: number;
		/** How far the server's clock is ahead of this browser's (`$lib/clock-offset.ts`). */
		clockOffsetMs: number;
		/** The Notes page open on the speaker's seat, or null while nobody speaks. */
		noteHref: ResolvedPathname | null;
		/** Sends every press through the chair's instant form (`$lib/chair-form.ts`). */
		onSubmit: SubmitFunction;
	};

	let {
		floor,
		motion,
		clock,
		now,
		timer,
		speakingTimeSeconds,
		clockOffsetMs,
		noteHref,
		onSubmit
	}: Props = $props();

	const title = $derived(caucusTitle('moderated_caucus', motion?.topic ?? null));
</script>

<!--
	The Mod view's floor: the GSL's floor, with the caucus clock line between
	the title and the speaker, no Yield (a moderated caucus has no yields),
	and its own primary: "End caucus" once the caucus time is up, with the
	speaker still allowed to finish. While the room is suspended it says the
	caucus resumes with the session, with no clocks and no controls.
-->
<section aria-labelledby="mod-floor-title" class={FLOOR_CLASSES}>
	<header class={FLOOR_HEADER_CLASSES}>
		<CaucusHeading id="mod-floor-title" {title} line={motion ? raisedByLine(motion) : null} />
	</header>

	{#if clock && floor.isLive}
		<CaucusClockLine {clock} {now} {onSubmit} />
	{/if}

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
					yieldSeats={[]}
					{noteHref}
					{onSubmit}
					canYield={false}
				/>
			{/if}
			<div class={FLOOR_PRIMARY_CLASSES}>
				{#if floor.primary === 'endCaucus'}
					<ModeEndButton
						label="End caucus"
						action="?/endCaucus"
						note="The speaker may finish"
						{onSubmit}
					/>
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

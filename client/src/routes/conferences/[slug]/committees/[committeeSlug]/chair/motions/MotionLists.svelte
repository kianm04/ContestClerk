<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { SessionMotion } from '$lib/motions';
	import DecidedMotions from './DecidedMotions.svelte';
	import FurtherMotions from './FurtherMotions.svelte';

	type Props = {
		/** The floor less the motion to decide, in rank order. */
		further: SessionMotion[];
		/** Each floor motion's rank, by id. */
		ranks: Record<string, number>;
		/** Whether anything is on the floor at all. */
		hasFloor: boolean;
		/** The session's decided motions, newest first. */
		decided: SessionMotion[];
		/** Whether rows can be acted on: not on an ended session's record. */
		canAct: boolean;
		conferenceSlug: string;
		committeeSlug: string;
		/** The conference's time zone, which each decision's time is shown in. */
		timeZone: string;
		/** Sends every press of the lists through the chair's instant form. */
		onSubmit: SubmitFunction;
	};

	let {
		further,
		ranks,
		hasFloor,
		decided,
		canAct,
		conferenceSlug,
		committeeSlug,
		timeZone,
		onSubmit
	}: Props = $props();
</script>

<!--
	The right column, the full height of the view: only lists, as the GSL's
	queue column is. "Further motions", then "Decided this session". The lists
	scroll inside the column when they are long; the page does not. Under 861px
	the column moves under the left one, divided by a rule above.
-->
<aside
	aria-label="Motions on the floor and decided"
	class="flex min-h-0 min-w-0 flex-col border-l border-line px-6 pt-7 pb-4 max-[860px]:border-t max-[860px]:border-l-0 max-md:px-4 max-md:py-5"
>
	<div class="min-h-24 flex-1 overflow-auto">
		<FurtherMotions
			motions={further}
			{ranks}
			{hasFloor}
			{canAct}
			{conferenceSlug}
			{committeeSlug}
			{onSubmit}
		/>
		<DecidedMotions motions={decided} {timeZone} {canAct} {onSubmit} />
	</div>
</aside>

<script lang="ts">
	// `page` from `$app/state` is the page being shown; its address builds the
	// band's "Change", which opens the agenda menu without JavaScript.
	import { page as shownPage } from '$app/state';
	import { roomFrameAfterPresses, sharedChairForm } from '$lib/chair-form';
	import type { FramePresence } from '$lib/chair-frame';
	import type { GslList, GslViewFrame } from '$lib/gsl-floor';
	import type { GslPage } from '$lib/gsl-links';
	import { openingBandLinks, openingRollCall } from '$lib/room-opening';
	import { pageWithQuery } from '$lib/urls';
	import OpeningBand from '../session/OpeningBand.svelte';
	import GslView from './GslView.svelte';

	type Props = {
		/** The session's General Speakers' List (`readGslList`). */
		gsl: GslList;
		/** The chair layout's data: the room, the seats, the attendance and the committee's topics. */
		frame: GslViewFrame & { committee: { topics: string[] } };
		/** Whether the address asked for the speaking time field (`?time=change`). */
		isTimeFieldOpen: boolean;
		/** The page drawing the view, `chair` or `chair/gsl`, where every press comes back to. */
		page: GslPage;
		/**
		 * Who is present while the session opens, which the band "Before debate"
		 * is drawn above the list with (`framePresence`); null once the first
		 * speaker has been called, when the band is gone.
		 */
		openingPresence: FramePresence | null;
		/** A quick session's band offers "Add a topic" while the committee has none. */
		canAddTopic: boolean;
	};

	let { gsl, frame, isTimeFieldOpen, page, openingPresence, canAddTopic }: Props = $props();

	// The agenda with the chair's presses laid on top (`$lib/chair-form.ts`), so
	// a topic pressed in the band or the agenda menu ticks the row off at once.
	const chairForm = sharedChairForm();
	const agendaTopic = $derived(
		roomFrameAfterPresses(frame, chairForm.presses).committeeState.agendaTopic
	);
</script>

<!--
	The GSL view, with the opening band "Before debate" above it until the
	first speaker is called (`committee-room.md`, "Opening band"). The band is
	part of the GSL view, so the live room (`chair`) and `chair/gsl` both draw
	this one component and show the same band.
-->
<div class="flex min-h-0 flex-1 flex-col">
	{#if openingPresence}
		<OpeningBand
			rollCall={openingRollCall(openingPresence)}
			topics={frame.committee.topics}
			{agendaTopic}
			links={openingBandLinks(frame.conference.slug, frame.committee.slug, page)}
			changeAgendaHref={pageWithQuery(shownPage.url, 'agenda', 'change')}
			fromView={page}
			{canAddTopic}
		/>
	{/if}
	<GslView {gsl} {frame} {isTimeFieldOpen} {page} />
</div>

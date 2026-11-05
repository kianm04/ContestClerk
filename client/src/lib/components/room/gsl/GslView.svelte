<script lang="ts">
	import {
		NEW_ROW_ID_FIELD,
		newRowId,
		roomFrameAfterPresses,
		sharedChairForm,
		speakersAfterPresses,
		speakersListAfterPresses,
		type ChairSubmitInput
	} from '$lib/chair-form';
	import { createClockOffsetGuess, PRESSED_AT_FIELD, serverNow } from '$lib/clock-offset';
	import { gslViewState, type GslList, type GslViewFrame } from '$lib/gsl-floor';
	import { speakingTimeFieldUrl, type GslPage } from '$lib/gsl-links';
	import { addsAnEntry, listViewPress } from '$lib/room-presses';
	import {
		hasRollCallAfterPresses,
		latestAttendanceAfterPresses,
		sharedRollCallForm
	} from '$lib/roll-call-preview';
	import { chairNotesUrl } from '$lib/urls';
	import QueueColumn from '../queue/QueueColumn.svelte';
	import GslFloor from './GslFloor.svelte';

	type Props = {
		/** The session's General Speakers' List, as `readGslList` in `$lib/server/gsl-view.ts` read it. */
		gsl: GslList;
		/** The chair layout's data: the room, the seats, the attendance and the clock offset. */
		frame: GslViewFrame;
		/** Whether the address asked for the speaking time field (`?time=change`). */
		isTimeFieldOpen: boolean;
		/** The page drawing the view, `chair` or `chair/gsl`, where every press comes back to. */
		page: GslPage;
	};

	let { gsl, frame, isTimeFieldOpen, page }: Props = $props();

	// The chair layout's instant form (`$lib/chair-form.ts`) and the roll call's
	// (`$lib/roll-call-preview.ts`). The view is drawn with the presses still on
	// their way laid on top, so each one shows the moment it is made.
	const chairForm = sharedChairForm();
	const rollCallForm = sharedRollCallForm();

	// The room's state with the presses laid on top; `{ committeeState }` takes
	// that one part of what `roomFrameAfterPresses` answers.
	const { committeeState } = $derived(roomFrameAfterPresses(frame, chairForm.presses));
	const list = $derived(speakersListAfterPresses(gsl.speakersList, chairForm.presses));
	const entries = $derived(speakersAfterPresses(gsl.speakers, list.id, chairForm.presses));
	const seatIds = $derived(frame.seats.map((seat) => seat.id));
	// Before the session's first roll call nobody is absent (an empty attendance).
	const attendance = $derived(
		latestAttendanceAfterPresses(
			frame.attendance,
			frame.latestRollCallId,
			rollCallForm.presses,
			seatIds
		) ?? {}
	);
	const hasRollCall = $derived(
		hasRollCallAfterPresses(frame.latestRollCallId, rollCallForm.presses)
	);
	// The floor, and what a press works on (`$lib/gsl-floor.ts`).
	const view = $derived(
		gslViewState({ committeeState, list, entries, seats: frame.seats, attendance, hasRollCall })
	);
	const floor = $derived(view.floor);
	const noteHref = $derived(
		floor.speaking === null
			? null
			: chairNotesUrl(frame.conference.slug, frame.committee.slug, floor.speaking.seat.id)
	);

	// The best guess from every reading of the clock offset so far. The clock
	// and the presses share it, so a press is stamped on the clock it counts on.
	const clockOffsetGuess = createClockOffsetGuess();
	const clockOffsetMs = $derived(clockOffsetGuess.learn(frame.clockOffsetSampleMs));

	/**
	 * Every press of the view: stamped with the moment it was made on the
	 * server's clock, so the stored timer is the one already on screen (T139),
	 * and, when it adds an entry, with the id this browser chose for it, which
	 * the server saves it under (T141). Answers what the press will change.
	 */
	function handlePress(input: ChairSubmitInput) {
		const action = input.action.search;
		const pressed = serverNow(clockOffsetMs);
		input.formData.set(PRESSED_AT_FIELD, pressed.toISOString());

		if (addsAnEntry(action)) input.formData.set(NEW_ROW_ID_FIELD, newRowId());

		return listViewPress(action, input.formData, view.pressRoom, pressed);
	}

	const submitPress = chairForm.submitExpecting(handlePress);
</script>

<!--
	The GSL view: the floor on the left and the queue column on the right, the
	full height of the console, from 861px wide. Narrower, the column moves
	under the floor; on a phone the floor's controls stick to the bottom.
	`minmax(0, 1fr)` lets the floor shrink instead of widening the page; the
	column keeps 320 to 480px, about 40% of the width. S5's opening band will
	sit above the two columns during the opening.
-->
<div
	class="grid min-h-0 flex-1 grid-cols-1 max-md:flex max-md:flex-col min-[861px]:grid-cols-[minmax(0,1fr)_clamp(320px,38%,480px)] min-[861px]:grid-rows-[minmax(0,1fr)]"
>
	<GslFloor
		{floor}
		mode={committeeState.mode}
		timer={committeeState.timer}
		speakingTimeSeconds={list.speakingTimeSeconds}
		{clockOffsetMs}
		{noteHref}
		onSubmit={submitPress}
	/>
	<QueueColumn
		title="Speakers’ list"
		{list}
		{entries}
		seats={frame.seats}
		{attendance}
		canSpeakNow={floor.isLive}
		isFooterShown
		{isTimeFieldOpen}
		timeFieldHref={speakingTimeFieldUrl(frame.conference.slug, frame.committee.slug, page)}
		onSubmit={submitPress}
	/>
</div>

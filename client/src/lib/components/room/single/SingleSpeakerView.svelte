<script lang="ts">
	import {
		NEW_ROW_ID_FIELD,
		newRowId,
		roomFrameAfterPresses,
		sharedChairForm,
		type ChairSubmitInput
	} from '$lib/chair-form';
	import { modeAddsAnEntry, modeViewPress, shownList } from '$lib/caucus-presses';
	import { createClockOffsetGuess, PRESSED_AT_FIELD, serverNow } from '$lib/clock-offset';
	import { VIEW_COLUMNS_CLASSES } from '$lib/floor-classes';
	import {
		shownAttendance,
		singleSpeakerView,
		speechNoteHref,
		type ModeViewFrame
	} from '$lib/list-floor';
	import { isSuspendedIn } from '$lib/mode-start';
	import { startedPurpose } from '$lib/mode-start-presses';
	import { SINGLE_SPEAKER_ADD_BOX } from '$lib/queue-add-box';
	import { sharedRollCallForm } from '$lib/roll-call-preview';
	import type { SingleSpeakerViewData } from '$lib/single-speaker';
	import { chairRoomUrl } from '$lib/urls';
	import QueueColumn from '../queue/QueueColumn.svelte';
	import SingleFloor from './SingleFloor.svelte';

	type Props = {
		/** The single speaker's list and purpose, as `readSingleSpeakerView` read them. */
		single: SingleSpeakerViewData;
		/** The chair layout's data: the room, the seats, the attendance and the clock offset. */
		frame: ModeViewFrame;
	};

	let { single, frame }: Props = $props();

	// The chair layout's instant forms (`$lib/chair-form.ts`, `$lib/roll-call-preview.ts`):
	// the view is drawn with the presses still on their way laid on top.
	const chairForm = sharedChairForm();
	const rollCallForm = sharedRollCallForm();

	const committeeState = $derived(roomFrameAfterPresses(frame, chairForm.presses).committeeState);
	// The single speaker's list, or the one "Give the floor" has only just drawn.
	const listId = $derived(committeeState.activeSpeakersListId ?? '');
	const defaultSeconds = $derived(frame.committee.defaultSpeakingTimeSeconds);
	const list = $derived(shownList(single.list, listId, chairForm.presses, defaultSeconds));
	// The server's purpose once it has read this list, until then the press's own.
	const isListRead = $derived(single.list?.speakersList.id === listId);
	const purpose = $derived(isListRead ? single.purpose : startedPurpose(listId, chairForm.presses));
	// Before the session's first roll call nobody is absent.
	const attendance = $derived(shownAttendance(frame, rollCallForm.presses));

	// The best guess of the clock offset; the clock and the presses share it.
	const clockOffsetGuess = createClockOffsetGuess();
	const clockOffsetMs = $derived(clockOffsetGuess.learn(frame.clockOffsetSampleMs));

	// The floor and what a press works on (`$lib/list-floor.ts`).
	const view = $derived(
		singleSpeakerView({
			committeeState,
			list: list.speakersList,
			entries: list.speakers,
			seats: frame.seats,
			attendance,
			isSuspended: isSuspendedIn(committeeState, 'single_speaker'),
			generalListId: frame.generalSpeakersListId
		})
	);

	/**
	 * Every press of the view, stamped with its moment on the server's clock
	 * (T139), and, when it adds an entry, with the id this browser chose for
	 * it (T141). Answers what the press will change.
	 */
	function handlePress(input: ChairSubmitInput) {
		const action = input.action.search;
		const pressed = serverNow(clockOffsetMs);
		input.formData.set(PRESSED_AT_FIELD, pressed.toISOString());

		if (modeAddsAnEntry(action)) input.formData.set(NEW_ROW_ID_FIELD, newRowId());

		return modeViewPress(action, input.formData, view.pressRoom, pressed);
	}

	const submitPress = chairForm.submitExpecting(handlePress);
</script>

<!--
	The Single speaker view while a single speaker has the floor: the GSL's
	floor on the left, and "Also speaking" on the right, the single speaker's
	own short list for a run of speakers such as three sponsors. It has no
	list footer. `chair/single` and `chair` both draw it.
-->
<div class={VIEW_COLUMNS_CLASSES}>
	<SingleFloor
		floor={view.floor}
		{purpose}
		timer={committeeState.timer}
		speakingTimeSeconds={list.speakersList.speakingTimeSeconds}
		{clockOffsetMs}
		noteHref={speechNoteHref(frame, view.floor.speaking)}
		onSubmit={submitPress}
	/>
	<!-- With no footer the speaking time field is never drawn; its link goes to the live room. -->
	<QueueColumn
		title="Also speaking"
		list={list.speakersList}
		entries={list.speakers}
		seats={frame.seats}
		{attendance}
		canSpeakNow={view.floor.isLive}
		isFooterShown={false}
		isTimeFieldOpen={false}
		timeFieldHref={chairRoomUrl(frame.conference.slug, frame.committee.slug)}
		onSubmit={submitPress}
		addBox={SINGLE_SPEAKER_ADD_BOX}
		emptyText="One speaker at a time, or several in a row."
	/>
</div>

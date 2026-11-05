<script lang="ts">
	import {
		NEW_ROW_ID_FIELD,
		newRowId,
		roomFrameAfterPresses,
		sharedChairForm,
		type ChairSubmitInput
	} from '$lib/chair-form';
	import { CLEARED_CAUCUS_CLOCK, caucusClock, isCaucusTimeUp } from '$lib/caucus-clock';
	import { modeAddsAnEntry, modeViewPress, shownList } from '$lib/caucus-presses';
	import { shownCaucusMotion, type ModViewData } from '$lib/caucus-view';
	import { createClockOffsetGuess, PRESSED_AT_FIELD, serverNow } from '$lib/clock-offset';
	import { VIEW_COLUMNS_CLASSES } from '$lib/floor-classes';
	import { modView, shownAttendance, speechNoteHref, type ModeViewFrame } from '$lib/list-floor';
	import { isSuspendedIn } from '$lib/mode-start';
	import { GSL_ADD_BOX, recogniseAddBox } from '$lib/queue-add-box';
	import { createRoomNow } from '$lib/room-now.svelte';
	import { sharedRollCallForm } from '$lib/roll-call-preview';
	import { chairRoomUrl } from '$lib/urls';
	import QueueColumn from '../queue/QueueColumn.svelte';
	import ModFloor from './ModFloor.svelte';

	type Props = {
		/** The running caucus, as `readModView` in `$lib/server/caucus-view.ts` read it. */
		caucus: ModViewData;
		/** The chair layout's data: the room, the seats, the attendance and the clock offset. */
		frame: ModeViewFrame;
	};

	let { caucus, frame }: Props = $props();

	/** How often the caucus clock line is redrawn while it runs, so a second turns over on time. */
	const TICK_MS = 100;

	// The chair layout's instant forms (`$lib/chair-form.ts`, `$lib/roll-call-preview.ts`):
	// the view is drawn with the presses still on their way laid on top.
	const chairForm = sharedChairForm();
	const rollCallForm = sharedRollCallForm();

	const shownRoom = $derived(roomFrameAfterPresses(frame, chairForm.presses));
	const committeeState = $derived(shownRoom.committeeState);
	const motion = $derived(shownCaucusMotion(caucus.motion, shownRoom.currentMotion));
	// The caucus's list, or the empty one "Start caucus" has only just drawn.
	const listId = $derived(committeeState.activeSpeakersListId);
	const speakingTime = $derived(
		motion?.speakingTimeSeconds ?? frame.committee.defaultSpeakingTimeSeconds
	);
	const list = $derived(shownList(caucus.list, listId, chairForm.presses, speakingTime));
	// Before the session's first roll call nobody is absent.
	const attendance = $derived(shownAttendance(frame, rollCallForm.presses));
	const clock = $derived(caucusClock(committeeState.caucusClock ?? CLEARED_CAUCUS_CLOCK));
	const isSuspended = $derived(isSuspendedIn(committeeState, 'moderated_caucus'));

	// The best guess of the clock offset; the clocks and the presses share it.
	const clockOffsetGuess = createClockOffsetGuess();
	const clockOffsetMs = $derived(clockOffsetGuess.learn(frame.clockOffsetSampleMs));
	// The moment the caucus line is drawn at, moved on while the caucus clock runs.
	const roomNow = createRoomNow(
		() => (clock?.endsAt ? TICK_MS : null),
		() => clockOffsetMs
	);
	const isTimeUp = $derived(clock !== null && isCaucusTimeUp(clock, roomNow.now));

	// The floor and what a press works on (`$lib/list-floor.ts`).
	const view = $derived(
		modView(
			{
				committeeState,
				list: list.speakersList,
				entries: list.speakers,
				seats: frame.seats,
				attendance,
				isSuspended,
				generalListId: frame.generalSpeakersListId
			},
			isTimeUp
		)
	);
	// While suspended the box only adds; otherwise it recognises (`$lib/queue-add-box.ts`).
	const addBox = $derived(
		isSuspended ? GSL_ADD_BOX : recogniseAddBox(view.floor.speaking === null)
	);

	/**
	 * Every press of the view: stamped with its moment on the server's clock,
	 * so the stored clocks are the ones on screen (T139), and, when it adds an
	 * entry, with the id this browser chose for it (T141). Answers what the
	 * press will change, both clocks included.
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
	The Mod view while a moderated caucus runs: the floor with the caucus
	clock line on the left, and the caucus's own list, "Caucus speakers", on
	the right. It has no list footer: the speaking time is the motion's, and a
	caucus list is never closed. `chair/mod` and `chair` both draw it.
-->
<div class={VIEW_COLUMNS_CLASSES}>
	<ModFloor
		floor={view.floor}
		{motion}
		{clock}
		now={roomNow.now}
		timer={committeeState.timer}
		speakingTimeSeconds={list.speakersList.speakingTimeSeconds}
		{clockOffsetMs}
		noteHref={speechNoteHref(frame, view.floor.speaking)}
		onSubmit={submitPress}
	/>
	<!-- With no footer the speaking time field is never drawn; its link goes to the live room. -->
	<QueueColumn
		title="Caucus speakers"
		list={list.speakersList}
		entries={list.speakers}
		seats={frame.seats}
		{attendance}
		canSpeakNow={view.floor.isLive}
		isFooterShown={false}
		isTimeFieldOpen={false}
		timeFieldHref={chairRoomUrl(frame.conference.slug, frame.committee.slug)}
		onSubmit={submitPress}
		{addBox}
		emptyText="Nobody is waiting."
	/>
</div>

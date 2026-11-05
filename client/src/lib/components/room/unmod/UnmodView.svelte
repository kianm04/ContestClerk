<script lang="ts">
	import {
		NEW_ROW_ID_FIELD,
		newRowId,
		roomFrameAfterPresses,
		sharedChairForm,
		type ChairSubmitInput
	} from '$lib/chair-form';
	import { shownList, unmodPressRoom, unmodViewPress } from '$lib/caucus-presses';
	import { shownCaucusMotion, type UnmodViewData } from '$lib/caucus-view';
	import { createClockOffsetGuess, PRESSED_AT_FIELD, serverNow } from '$lib/clock-offset';
	import { VIEW_COLUMNS_CLASSES } from '$lib/floor-classes';
	import { shownAttendance, type ModeViewFrame } from '$lib/list-floor';
	import { isSuspendedIn } from '$lib/mode-start';
	import { addsAnEntry } from '$lib/room-presses';
	import { sharedRollCallForm } from '$lib/roll-call-preview';
	import { unmodTimeFieldUrl, type UnmodPage } from '$lib/unmod-links';
	import QueueColumn from '../queue/QueueColumn.svelte';
	import UnmodFloor from './UnmodFloor.svelte';

	type Props = {
		/** The General Speakers' List and the caucus, as `readUnmodView` read them. */
		unmod: UnmodViewData;
		/** The chair layout's data: the room, the seats, the attendance and the clock offset. */
		frame: ModeViewFrame;
		/** Whether the address asked for the speaking time field (`?time=change`). */
		isTimeFieldOpen: boolean;
		/** The page drawing the view, `chair` or `chair/unmod`. */
		page: UnmodPage;
	};

	let { unmod, frame, isTimeFieldOpen, page }: Props = $props();

	// The chair layout's instant forms (`$lib/chair-form.ts`, `$lib/roll-call-preview.ts`):
	// the view is drawn with the presses still on their way laid on top.
	const chairForm = sharedChairForm();
	const rollCallForm = sharedRollCallForm();

	const shownRoom = $derived(roomFrameAfterPresses(frame, chairForm.presses));
	const committeeState = $derived(shownRoom.committeeState);
	const motion = $derived(shownCaucusMotion(unmod.motion, shownRoom.currentMotion));
	const gslId = $derived(unmod.gsl?.speakersList.id ?? frame.generalSpeakersListId ?? '');
	const defaultSeconds = $derived(frame.committee.defaultSpeakingTimeSeconds);
	const gsl = $derived(shownList(unmod.gsl, gslId, chairForm.presses, defaultSeconds));
	// Before the session's first roll call nobody is absent.
	const attendance = $derived(shownAttendance(frame, rollCallForm.presses));

	// The best guess of the clock offset; the clock and the presses share it.
	const clockOffsetGuess = createClockOffsetGuess();
	const clockOffsetMs = $derived(clockOffsetGuess.learn(frame.clockOffsetSampleMs));

	// What a press works on: the one clock, and "After the caucus".
	const pressRoom = $derived(
		unmodPressRoom({
			state: committeeState,
			gsl,
			seats: frame.seats,
			attendance,
			generalListId: frame.generalSpeakersListId
		})
	);

	/**
	 * Every press of the view, stamped with its moment on the server's clock,
	 * so the stored clock is the one on screen (T139), and, when it adds a
	 * delegation, with the id this browser chose for it (T141).
	 */
	function handlePress(input: ChairSubmitInput) {
		const action = input.action.search;
		const pressed = serverNow(clockOffsetMs);
		input.formData.set(PRESSED_AT_FIELD, pressed.toISOString());

		if (addsAnEntry(action)) input.formData.set(NEW_ROW_ID_FIELD, newRowId());

		return unmodViewPress(action, input.formData, pressRoom, pressed);
	}

	const submitPress = chairForm.submitExpecting(handlePress);
</script>

<!--
	The Unmod view while an unmoderated caucus runs: its one clock on the
	left, and "After the caucus" on the right, the General Speakers' List's
	own queue column with its footer, since delegates come up to be added
	during the caucus and the list is needed the moment it ends. `chair/unmod`
	and `chair` both draw it.
-->
<div class={VIEW_COLUMNS_CLASSES}>
	<UnmodFloor
		{motion}
		timer={committeeState.timer}
		timeZone={frame.conference.timezone}
		{clockOffsetMs}
		isSuspended={isSuspendedIn(committeeState, 'unmoderated_caucus')}
		onSubmit={submitPress}
	/>
	<QueueColumn
		title="After the caucus"
		list={gsl.speakersList}
		entries={gsl.speakers}
		seats={frame.seats}
		{attendance}
		canSpeakNow={false}
		isFooterShown
		{isTimeFieldOpen}
		timeFieldHref={unmodTimeFieldUrl(frame.conference.slug, frame.committee.slug, page)}
		onSubmit={submitPress}
		emptyText="Nobody is waiting."
	/>
</div>

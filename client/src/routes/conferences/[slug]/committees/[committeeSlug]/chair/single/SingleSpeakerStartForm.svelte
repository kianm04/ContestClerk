<script lang="ts">
	import SegmentedChoice from '$lib/components/room/SegmentedChoice.svelte';
	import StartField from '$lib/components/room/start/StartField.svelte';
	import StartForm from '$lib/components/room/start/StartForm.svelte';
	import TimeInput from '$lib/components/room/start/TimeInput.svelte';
	import type { ModeViewFrame } from '$lib/list-floor';
	import { singleStartPressOf } from '$lib/mode-start-presses';
	import {
		SINGLE_SPEAKER_TIME_PRESETS,
		type SingleSpeakerErrors,
		type SingleSpeakerValues
	} from '$lib/single-speaker';
	import { createStartSubmit } from '$lib/start-submit';
	import PurposeField from './PurposeField.svelte';
	import WhoField from './WhoField.svelte';

	type Props = {
		/** What was chosen and typed, kept after a refusal. */
		values: SingleSpeakerValues;
		/** A message for who, the purpose or the time, where it needs fixing. */
		errors: SingleSpeakerErrors;
		/** The chair layout's data: the room, the seats, the attendance and the clock offset. */
		frame: ModeViewFrame;
		/** What giving the floor will end ("the moderated caucus"), or null. */
		endedName: string | null;
		/** Why "Give the floor" is disabled, or null. */
		blockedReason: string | null;
	};

	let { values, errors, frame, endedName, blockedReason }: Props = $props();

	/* The time presets as radio buttons: their values are their words. */
	const TIME_OPTIONS = SINGLE_SPEAKER_TIME_PRESETS.map((time) => ({ value: time, label: time }));

	// The chosen time and the typed one. A `$derived` can be assigned to: the
	// chair's choices change them, and a refusal's values put them back.
	let chosenTime = $derived(values.time);
	let typedTime = $derived(values.timeTyped);

	// The press through the chair's instant form: the speaker is on the floor at once.
	const submit = createStartSubmit(() => frame, singleStartPressOf);

	/** Choosing a preset empties "other". */
	function handleTimeChoose(value: string) {
		chosenTime = value;
		typedTime = '';
	}

	/** Typing a time in "other" takes the place of the chosen preset. */
	function handleTimeType(text: string) {
		typedTime = text;
		if (text !== '') chosenTime = '';
	}
</script>

<!--
	"Give one speaker the floor": who (a seat, or any typed name such as
	"Secretary-General"), why, and for how long. No motion is recorded: a
	single speaker is the chair's call.
-->
<StartForm
	title="Give one speaker the floor"
	action="?/startSingle"
	buttonLabel="Give the floor"
	motionsHref={null}
	note="The purpose shows on delegates’ phones and on the projector."
	{endedName}
	{blockedReason}
	onSubmit={submit}
>
	<StartField
		label="Who"
		forId="single-who"
		hint="“Secretary-General” works too"
		error={errors.who}
	>
		<WhoField
			seats={frame.seats}
			attendance={frame.attendance}
			value={{ seatId: values.seatId, speakerName: values.speakerName }}
		/>
	</StartField>
	<StartField label="Purpose" forId="single-purpose" isGroup error={errors.purpose}>
		<PurposeField purpose={values.purpose} purposeOther={values.purposeOther} />
	</StartField>
	<StartField label="Time" forId="single-time" isGroup error={errors.time}>
		<SegmentedChoice
			name="time"
			options={TIME_OPTIONS}
			value={chosenTime}
			onChange={handleTimeChoose}
		/>
		<TimeInput
			id="single-time-typed"
			name="timeTyped"
			value={typedTime}
			placeholder="other"
			label="Other time"
			onType={handleTimeType}
		/>
	</StartField>
</StartForm>

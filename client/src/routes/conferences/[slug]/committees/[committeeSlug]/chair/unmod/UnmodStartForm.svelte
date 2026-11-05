<script lang="ts">
	import RaisedByField from '$lib/components/room/start/RaisedByField.svelte';
	import SegmentedChoice from '$lib/components/room/SegmentedChoice.svelte';
	import StartField from '$lib/components/room/start/StartField.svelte';
	import StartForm from '$lib/components/room/start/StartForm.svelte';
	import TimeInput from '$lib/components/room/start/TimeInput.svelte';
	import {
		CAUCUS_TOPIC_MAX_LENGTH,
		UNMOD_LENGTH_PRESETS,
		type UnmodStartErrors,
		type UnmodStartValues
	} from '$lib/caucus-start';
	import type { ModeViewFrame } from '$lib/list-floor';
	import { unmodStartPressOf } from '$lib/mode-start-presses';
	import { createStartSubmit } from '$lib/start-submit';
	import { chairMotionsUrl } from '$lib/urls';

	type Props = {
		/** What was chosen and typed, kept after a refusal. */
		values: UnmodStartValues;
		/** A message for each field that needs fixing. */
		errors: UnmodStartErrors;
		/** The chair layout's data: the room, the seats, the attendance and the clock offset. */
		frame: ModeViewFrame;
		/** What starting will end ("the moderated caucus"), or null. */
		endedName: string | null;
		/** Why "Start caucus" is disabled, or null. */
		blockedReason: string | null;
	};

	let { values, errors, frame, endedName, blockedReason }: Props = $props();

	// The chosen preset and the typed length. A `$derived` can be assigned to:
	// the chair's choices change them, and a refusal's values put them back.
	let chosenLength = $derived(values.length);
	let typedLength = $derived(values.lengthTyped);

	// The press through the chair's instant form: the running caucus is drawn at once.
	const submit = createStartSubmit(() => frame, unmodStartPressOf);

	/** Choosing a preset empties "other". */
	function handleLengthChoose(value: string) {
		chosenLength = value;
		typedLength = '';
	}

	/** Typing a length in "other" takes the place of the chosen preset. */
	function handleLengthType(text: string) {
		typedLength = text;
		if (text !== '') chosenLength = '';
	}
</script>

<!--
	"Start an unmoderated caucus": its length (a preset, or any length typed
	in "other", which wins over the preset without JavaScript too), an
	optional topic, and who raised it. Its clock starts the moment it starts.
-->
<StartForm
	title="Start an unmoderated caucus"
	action="?/startUnmoderated"
	buttonLabel="Start caucus"
	motionsHref={chairMotionsUrl(frame.conference.slug, frame.committee.slug)}
	note={null}
	{endedName}
	{blockedReason}
	onSubmit={submit}
>
	<StartField label="Length" forId="unmod-length" isGroup error={errors.length}>
		<SegmentedChoice
			name="length"
			options={UNMOD_LENGTH_PRESETS}
			value={chosenLength}
			onChange={handleLengthChoose}
		/>
		<TimeInput
			id="unmod-length-typed"
			name="lengthTyped"
			value={typedLength}
			placeholder="other"
			label="Other length"
			onType={handleLengthType}
		/>
	</StartField>
	<StartField label="Topic" forId="unmod-topic" hint="optional" error={errors.topic}>
		<input
			id="unmod-topic"
			name="topic"
			value={values.topic}
			maxlength={CAUCUS_TOPIC_MAX_LENGTH}
			class="h-11 w-full max-w-120 rounded-control border border-line bg-surface px-3 focus:border-transparent focus:ring-2 focus:ring-brand-500"
		/>
	</StartField>
	<StartField
		label="Raised by"
		forId="unmod-raised-by"
		hint="optional"
		error={errors.proposedBySeatId}
	>
		<RaisedByField
			id="unmod-raised-by"
			seats={frame.seats}
			attendance={frame.attendance}
			value={values.proposedBySeatId}
		/>
	</StartField>
</StartForm>

<script lang="ts">
	import RaisedByField from '$lib/components/room/start/RaisedByField.svelte';
	import StartField from '$lib/components/room/start/StartField.svelte';
	import StartForm from '$lib/components/room/start/StartForm.svelte';
	import TimeInput from '$lib/components/room/start/TimeInput.svelte';
	import {
		CAUCUS_TOPIC_MAX_LENGTH,
		type ModStartErrors,
		type ModStartValues
	} from '$lib/caucus-start';
	import { DEFAULT_CAUCUS_SECONDS } from '$lib/motion-input';
	import { formatDuration } from '$lib/committee-room';
	import type { ModeViewFrame } from '$lib/list-floor';
	import { modStartPressOf } from '$lib/mode-start-presses';
	import { chairMotionsUrl } from '$lib/urls';
	import { createStartSubmit } from '$lib/start-submit';

	type Props = {
		/** What was typed, kept after a refusal. */
		values: ModStartValues;
		/** A message for each field that needs fixing. */
		errors: ModStartErrors;
		/** The chair layout's data: the room, the seats, the attendance and the clock offset. */
		frame: ModeViewFrame;
		/** What starting will end ("the unmoderated caucus"), or null. */
		endedName: string | null;
		/** Why "Start caucus" is disabled, or null. */
		blockedReason: string | null;
	};

	let { values, errors, frame, endedName, blockedReason }: Props = $props();

	// The press through the chair's instant form: the running caucus is drawn at once.
	const submit = createStartSubmit(() => frame, modStartPressOf);
</script>

<!--
	"Start a moderated caucus": the topic, the total and each speaker's time
	(their defaults written in the empty fields), and who raised it, which may
	be left as the chair. The caucus is recorded as started without a vote.
-->
<StartForm
	title="Start a moderated caucus"
	action="?/startModerated"
	buttonLabel="Start caucus"
	motionsHref={chairMotionsUrl(frame.conference.slug, frame.committee.slug)}
	note={null}
	{endedName}
	{blockedReason}
	onSubmit={submit}
>
	<StartField label="Topic" forId="mod-topic" error={errors.topic}>
		<input
			id="mod-topic"
			name="topic"
			value={values.topic}
			maxlength={CAUCUS_TOPIC_MAX_LENGTH}
			aria-describedby={errors.topic ? 'mod-topic-error' : undefined}
			class="h-11 w-full max-w-120 rounded-control border border-line bg-surface px-3 focus:border-transparent focus:ring-2 focus:ring-brand-500"
		/>
	</StartField>
	<StartField label="Total" forId="mod-total" error={errors.totalTime ?? errors.speakingTime}>
		<TimeInput
			id="mod-total"
			name="totalTime"
			value={values.totalTime}
			placeholder={formatDuration(DEFAULT_CAUCUS_SECONDS)}
		/>
		<label for="mod-each" class="ml-4 text-ink-600 max-md:ml-2">Each speaker</label>
		<TimeInput
			id="mod-each"
			name="speakingTime"
			value={values.speakingTime}
			placeholder={formatDuration(frame.committee.defaultSpeakingTimeSeconds)}
		/>
	</StartField>
	<StartField
		label="Raised by"
		forId="mod-raised-by"
		hint="optional"
		error={errors.proposedBySeatId}
	>
		<RaisedByField
			id="mod-raised-by"
			seats={frame.seats}
			attendance={frame.attendance}
			value={values.proposedBySeatId}
		/>
	</StartField>
</StartForm>

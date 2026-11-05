<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import { onMount, tick } from 'svelte';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import { NEW_ROW_ID_FIELD, newRowId } from '$lib/chair-form';
	import { presentSeats } from '$lib/chair-room';
	import type { AttendanceStatus, MotionKind, RoomSeat } from '$lib/committee-room';
	import { OUTLINED_BUTTON_CLASSES } from '$lib/console-buttons';
	import {
		emptyMotionForm,
		isMotionKind,
		readMotionForm,
		type MotionFormErrors,
		type MotionFormValues
	} from '$lib/motions';
	import type { FloorPaper } from '$lib/papers-on-floor';
	import MotionFields from './MotionFields.svelte';
	import MotionKindPicker from './MotionKindPicker.svelte';

	type Props = {
		/** What a refused motion held, sent back by the server so nothing typed is lost; null otherwise. */
		refusedValues: MotionFormValues | null;
		/** The messages under the fields of a refused motion; null otherwise. */
		refusedErrors: MotionFormErrors | null;
		/** Every seat of the committee, which "Raised by" offers. */
		seats: RoomSeat[];
		/** The latest roll call, keyed by seat id; empty before the first. */
		attendance: Record<string, AttendanceStatus>;
		/** The committee's speaking time, which an empty "Each" means. */
		defaultSpeakingSeconds: number;
		/** The approved papers a motion to introduce a document picks from. */
		papers: FloorPaper[];
		/** Sends the motion through the chair's instant form, which puts it on the floor at once. */
		onSubmit: SubmitFunction;
	};

	let {
		refusedValues,
		refusedErrors,
		seats,
		attendance,
		defaultSpeakingSeconds,
		papers,
		onSubmit
	}: Props = $props();

	/*
		What the fields hold and the messages under them. A `$derived` can be
		assigned to: the chair's typing changes them, and a refusal from the
		server (a new `refusedValues`) puts back what was sent.
	*/
	let values: MotionFormValues = $derived(refusedValues ?? emptyMotionForm());
	let errors: MotionFormErrors = $derived(refusedErrors ?? {});
	const kind: MotionKind = $derived(isMotionKind(values.kind) ? values.kind : 'moderated_caucus');
	const presentSeatIds = $derived(presentSeats(seats, attendance).map((seat) => seat.id));

	// Whether the page's script runs; `onMount` only ever runs in the browser.
	let isScriptRunning = $state(false);
	onMount(() => {
		isScriptRunning = true;
	});

	function handleValueChange(name: keyof MotionFormValues, value: string) {
		values = { ...values, [name]: value };
	}

	/**
	 * "Add to floor", or Enter. A motion the server would refuse is not sent:
	 * its messages show under the fields at once. Otherwise it gets the id the
	 * browser chose, the fields empty but for the kind, and the cursor goes back
	 * to "Raised by", so a burst of motions takes one Enter each.
	 */
	const submitProposal: SubmitFunction = async (input) => {
		const reading = readMotionForm(input.formData, presentSeatIds, defaultSpeakingSeconds, papers);

		if (reading.input === null) {
			errors = reading.errors;
			input.cancel();
			return;
		}

		input.formData.set(NEW_ROW_ID_FIELD, newRowId());
		values = emptyMotionForm(values.kind);
		errors = {};

		// `tick` waits until the emptied fields are on screen before the cursor moves.
		await tick();
		document.getElementById('raised-by')?.focus();

		return onSubmit(input);
	};
</script>

<!--
	"Record a motion", always open across the foot of the left column, never a
	dialog. One form posting to `?/propose`: the kinds, "Raised by", the fields
	the kind asks for and "Add to floor", which is never the filled button. Not
	drawn while no session runs.
-->
<form
	method="post"
	action="?/propose"
	use:enhance={submitProposal}
	autocomplete="off"
	aria-labelledby="record-motion-heading"
	class="mt-4 flex flex-none flex-col gap-2.5 border-t border-line pt-4"
>
	<div class="flex items-baseline justify-between gap-3">
		<h2 id="record-motion-heading" class="text-h3">Record a motion</h2>
		<p class="text-right text-small text-ink-600">
			Enter adds it, and focus goes back to Raised by
		</p>
	</div>

	<MotionKindPicker value={kind} onChange={(chosen) => handleValueChange('kind', chosen)} />

	<!-- Without JavaScript every field shows with its help line, so the row may wrap. -->
	<div
		class="flex gap-3 max-md:flex-col max-md:items-stretch {isScriptRunning
			? 'items-end'
			: 'flex-wrap items-start'}"
	>
		<MotionFields
			{kind}
			{values}
			{errors}
			{seats}
			{attendance}
			{defaultSpeakingSeconds}
			{papers}
			{isScriptRunning}
			onValueChange={handleValueChange}
		/>
		<button
			type="submit"
			class="{OUTLINED_BUTTON_CLASSES} ml-auto h-10 self-end max-md:ml-0 max-md:h-11"
		>
			Add to floor
		</button>
	</div>
</form>

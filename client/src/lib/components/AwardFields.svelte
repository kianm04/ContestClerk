<script lang="ts">
	import { onMount } from 'svelte';
	import type { AwardFormErrors, AwardFormValues } from '$lib/award-form';
	import {
		AWARD_KIND_OPTIONS,
		AWARD_TITLE_MAX_LENGTH,
		awardSeatLabel,
		type AwardSeat
	} from '$lib/awards';
	import { fieldId } from '$lib/form-fields';
	import SelectField from './SelectField.svelte';
	import TextField from './TextField.svelte';

	type Props = {
		/** The seats that have a delegate. Only these can be given an award. */
		seats: AwardSeat[];
		/** What the fields hold: empty, an award being edited, or what a refusal sent back. */
		values: AwardFormValues;
		/** A message under each field the last refusal was about. */
		errors: AwardFormErrors;
		/**
		 * Added to every field's id. The organiser's awards page draws one form
		 * per committee, so each gives its own and every label finds its own box.
		 */
		idSuffix: string;
		/** Draws the smaller fields of the management pages, as the organiser's awards page does. */
		isDense?: boolean;
	};

	let { seats, values, errors, idSuffix, isDense = false }: Props = $props();

	// The kind picked in the dropdown. `$derived` follows `values` whenever the
	// server sends the form back, and `handleKindChange` may overwrite it in between.
	let selectedKind = $derived(values.kind);

	/*
		Whether this component is running in the browser. The page arrives as
		finished HTML with the title field shown, which is what a reader without
		JavaScript keeps; the server ignores the title for every kind but Custom.
		`onMount` only ever runs in the browser, once Svelte has taken over that
		HTML, so from then on the title can be hidden until Custom is picked.

		A reader on a slow connection may have picked Custom and typed a title
		before that, which `handleKindChange` never heard. The dropdown still
		shows their pick, so it is read from there, or the title they typed
		would vanish the moment the script started.
	*/
	let isScriptRunning = $state(false);
	onMount(() => {
		const kindField = document.getElementById(fieldId(`kind-${idSuffix}`));
		if (kindField instanceof HTMLSelectElement) selectedKind = kindField.value;
		isScriptRunning = true;
	});

	const isTitleShown = $derived(!isScriptRunning || selectedKind === 'custom');
	const seatOptions = $derived(
		seats.map((seat) => ({ value: seat.id, label: awardSeatLabel(seat) }))
	);

	function handleKindChange(event: Event & { currentTarget: HTMLSelectElement }) {
		selectedKind = event.currentTarget.value;
	}
</script>

<div class="grid gap-4 md:grid-cols-3">
	<SelectField
		label="Seat"
		name="seatId"
		idKey="seatId-{idSuffix}"
		value={values.seatId}
		options={seatOptions}
		placeholder="Pick a seat"
		error={errors.seatId}
		isRequired
		{isDense}
	/>
	<SelectField
		label="Award"
		name="kind"
		idKey="kind-{idSuffix}"
		value={selectedKind}
		options={AWARD_KIND_OPTIONS}
		error={errors.kind}
		isRequired
		onchange={handleKindChange}
		{isDense}
	/>
	{#if isTitleShown}
		<TextField
			label="Title"
			name="title"
			idKey="title-{idSuffix}"
			value={values.title}
			help="Only for a custom award."
			maxLength={AWARD_TITLE_MAX_LENGTH}
			error={errors.title}
			{isDense}
		/>
	{/if}
</div>

<script lang="ts">
	import { onMount } from 'svelte';
	import { presentSeats } from '$lib/chair-room';
	import type { AttendanceStatus, RoomSeat } from '$lib/committee-room';
	import { CHAIR_PROPOSER } from '$lib/motions';
	import { raisedByOptions, searchSeats, type SeatOption } from '$lib/seat-search';
	import SeatCombobox from '../queue/SeatCombobox.svelte';

	type Props = {
		/** The input's `id`, which the field's label points at. */
		id: string;
		/** Every seat of the committee. */
		seats: RoomSeat[];
		/** The latest roll call, keyed by seat id; empty before the first. */
		attendance: Record<string, AttendanceStatus>;
		/** What was chosen before a refusal: a seat's id, `chair`, or empty. */
		value: string;
	};

	let { id, seats, attendance, value }: Props = $props();

	/*
		Whether this component is running in the browser. Without JavaScript the
		field is a `<select>`; `onMount` only ever runs in the browser, once
		Svelte has taken over the page, and swaps in the combobox.
	*/
	let isScriptRunning = $state(false);
	onMount(() => {
		isScriptRunning = true;
	});

	// What the hidden field sends: the chosen seat's id, `chair`, or empty for
	// the chair. A `$derived` can be assigned to: a choice or typing changes it.
	let chosen = $derived(value);

	const presentInOrder = $derived(searchSeats(presentSeats(seats, attendance), ''));

	/** The options for what is typed: "The chair" first, then the seats, an absent one not choosable. */
	function optionsFor(query: string): SeatOption[] {
		return raisedByOptions(seats, attendance, query);
	}

	function handleChoose(option: SeatOption) {
		chosen = option.value;
	}

	/** Typing again lets go of the choice, until a new one is made. */
	function handleType() {
		chosen = '';
	}
</script>

<!--
	"Raised by", optional: with JavaScript, the seat combobox with "The chair"
	first, which keeps the choice in the box and sends it in a hidden field.
	The `oninput` on the wrapper hears the typing inside the box, since an
	input event rises through the elements around it. Without JavaScript, a
	`<select>` of "The chair" and the present seats.
-->
{#if isScriptRunning}
	<div class="w-80 max-w-full" oninput={handleType}>
		<SeatCombobox
			{id}
			label="Raised by"
			placeholder="Search delegations"
			{optionsFor}
			onChoose={handleChoose}
			isPicker
		/>
		<input type="hidden" name="proposedBySeatId" value={chosen} />
	</div>
{:else}
	<select
		{id}
		name="proposedBySeatId"
		class="h-11 w-80 max-w-full rounded-control border border-line bg-surface text-body"
	>
		<option value={CHAIR_PROPOSER} selected={value === '' || value === CHAIR_PROPOSER}>
			The chair
		</option>
		<!-- The `(seat.id)` key lets Svelte reuse each option instead of rebuilding it. -->
		{#each presentInOrder as seat (seat.id)}
			<option value={seat.id} selected={seat.id === value}>{seat.name}</option>
		{/each}
	</select>
{/if}

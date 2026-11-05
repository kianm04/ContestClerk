<script lang="ts">
	import { onMount } from 'svelte';
	import SeatCombobox from '$lib/components/room/queue/SeatCombobox.svelte';
	import { presentSeats } from '$lib/chair-room';
	import type { AttendanceStatus, RoomSeat } from '$lib/committee-room';
	import { NOBODY_CHOSEN, whoChoice, type WhoChoice } from '$lib/seat-picker';
	import { searchSeats, whoOptions, type SeatOption } from '$lib/seat-search';

	type Props = {
		/** Every seat of the committee. */
		seats: RoomSeat[];
		/** The latest roll call, keyed by seat id; empty before the first. */
		attendance: Record<string, AttendanceStatus>;
		/** What was chosen before a refusal: a seat's id or a typed name. */
		value: WhoChoice;
	};

	let { seats, attendance, value }: Props = $props();

	/*
		Whether this component is running in the browser. Without JavaScript
		"Who" is a `<select>` and a name field; `onMount` only ever runs in the
		browser, once Svelte has taken over the page, and swaps in the combobox.
	*/
	let isScriptRunning = $state(false);
	onMount(() => {
		isScriptRunning = true;
	});

	// What the hidden fields send. A `$derived` can be assigned to: a choice or typing changes it.
	let chosen = $derived(value);

	const presentInOrder = $derived(searchSeats(presentSeats(seats, attendance), ''));

	/** The seats that match what is typed, then what was typed as a name of its own. */
	function optionsFor(query: string): SeatOption[] {
		return whoOptions(seats, attendance, query);
	}

	function handleChoose(option: SeatOption) {
		chosen = whoChoice(option);
	}

	/** Typing again lets go of the choice, until a new one is made. */
	function handleType() {
		chosen = NOBODY_CHOSEN;
	}
</script>

<!--
	"Who": with JavaScript, the seat combobox, which offers what was typed as
	its last line ("Use “Secretary-General”") for somebody who holds no seat,
	and keeps the choice in the box. The chosen seat goes in the hidden
	`seatId`, a typed name in `speakerName`. The `oninput` on the wrapper hears
	the typing inside the box, since an input event rises through the elements
	around it. Without JavaScript, a `<select>` of the present seats beside a
	field for a name.
-->
{#if isScriptRunning}
	<div class="w-90 max-w-full" oninput={handleType}>
		<SeatCombobox
			id="single-who"
			label="Who"
			placeholder="Search delegations, or type a name"
			{optionsFor}
			onChoose={handleChoose}
			isPicker
		/>
		<input type="hidden" name="seatId" value={chosen.seatId} />
		<input type="hidden" name="speakerName" value={chosen.speakerName} />
	</div>
{:else}
	<select
		id="single-who"
		name="seatId"
		class="h-11 w-60 max-w-full rounded-control border border-line bg-surface text-body"
	>
		<option value="" selected={value.seatId === ''}></option>
		<!-- The `(seat.id)` key lets Svelte reuse each option instead of rebuilding it. -->
		{#each presentInOrder as seat (seat.id)}
			<option value={seat.id} selected={seat.id === value.seatId}>{seat.name}</option>
		{/each}
	</select>
	<label for="single-speaker-name" class="text-ink-600">or a name</label>
	<input
		id="single-speaker-name"
		name="speakerName"
		value={value.speakerName}
		class="h-11 w-60 max-w-full rounded-control border border-line bg-surface px-3"
	/>
{/if}

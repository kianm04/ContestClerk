<script lang="ts">
	import { presentSeats } from '$lib/chair-room';
	import type { AttendanceStatus, RoomSeat } from '$lib/committee-room';
	import type { GslEntry } from '$lib/gsl-floor';
	import type { QueueAddBoxSettings } from '$lib/queue-add-box';
	import { searchSeats } from '$lib/seat-search';
	import { listedSeatIds } from '$lib/speakers-lists';

	type Props = {
		/** Every entry of the list, so the seats already waiting or speaking are left out. */
		entries: GslEntry[];
		/** Every seat of the committee. */
		seats: RoomSeat[];
		/** The latest roll call, keyed by seat id; empty before the first. */
		attendance: Record<string, AttendanceStatus>;
		/** The box's words: "Add a delegation" and "Add", or Mod's "Recognise". */
		settings: QueueAddBoxSettings;
	};

	let { entries, seats, attendance, settings }: Props = $props();

	// The present seats in alphabetical order (an empty search matches every
	// seat), less those already waiting or speaking.
	const listedIds = $derived(listedSeatIds(entries));
	const presentInOrder = $derived(searchSeats(presentSeats(seats, attendance), ''));
	const addableSeats = $derived(presentInOrder.filter((seat) => !listedIds.includes(seat.id)));
</script>

<!--
	The add box without JavaScript: a `<select>` and "Add", inside the add
	form, which sends the chosen `seatId`. A late delegate marked absent is
	marked present in the roll call view first.
-->
<div class="flex gap-2">
	<label for="queue-add-select" class="sr-only">{settings.label}</label>
	<select
		id="queue-add-select"
		name="seatId"
		class="h-11 min-w-0 flex-1 rounded-control border border-line bg-surface text-body"
	>
		<!-- The `(seat.id)` key lets Svelte reuse each option instead of rebuilding it. -->
		{#each addableSeats as seat (seat.id)}
			<option value={seat.id}>{seat.name}</option>
		{/each}
	</select>
	<button
		type="submit"
		disabled={addableSeats.length === 0}
		class="h-11 rounded-control border border-line bg-surface px-4 font-medium hover:bg-neutral-100 disabled:text-ink-400"
	>
		{settings.buttonLabel}
	</button>
</div>

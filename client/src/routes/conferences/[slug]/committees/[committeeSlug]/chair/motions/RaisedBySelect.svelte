<script lang="ts">
	import { presentSeats } from '$lib/chair-room';
	import type { AttendanceStatus, RoomSeat } from '$lib/committee-room';
	import { CHAIR_PROPOSER } from '$lib/motions';
	import { searchSeats } from '$lib/seat-search';

	type Props = {
		/** The select's `id`, which the "Raised by" label points at. */
		id: string;
		/** Every seat of the committee. */
		seats: RoomSeat[];
		/** The latest roll call, keyed by seat id; empty before the first. */
		attendance: Record<string, AttendanceStatus>;
		/** The choice a refused form sent, kept so the chair need not pick again. */
		value: string;
		/** The `id` of the message under the field, while there is one. */
		errorId: string | null;
	};

	let { id, seats, attendance, value, errorId }: Props = $props();

	// The present seats in alphabetical order (an empty search matches every seat).
	const choosableSeats = $derived(searchSeats(presentSeats(seats, attendance), ''));
</script>

<!--
	"Raised by" without JavaScript: a `<select>` of "The chair" and the present
	seats. Its first line chooses nothing, so a motion is never put down to the
	chair by mistake; sending it is refused with "Pick the seat that raised the
	motion."
-->
<select
	{id}
	name="proposedBySeatId"
	aria-invalid={errorId !== null}
	aria-describedby={errorId ?? undefined}
	class="h-10 w-full rounded-control border border-line bg-surface px-3 max-md:h-11"
>
	<option value="" selected={value === ''}>Pick the seat</option>
	<option value={CHAIR_PROPOSER} selected={value === CHAIR_PROPOSER}>The chair</option>
	<!-- The `(seat.id)` key lets Svelte reuse each option instead of rebuilding it. -->
	{#each choosableSeats as seat (seat.id)}
		<option value={seat.id} selected={value === seat.id}>{seat.name}</option>
	{/each}
</select>

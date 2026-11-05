<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import type { AttendanceStatus, RoomSeat } from '$lib/committee-room';
	import SeatRow from './SeatRow.svelte';

	type Props = {
		/** The seats, in the order they are drawn. */
		seats: RoomSeat[];
		/** The latest roll call, keyed by seat id. Without it the rows have no dot. */
		attendance?: Record<string, AttendanceStatus>;
		/**
		 * When given, every row is a link to the address this builds, such as the
		 * page itself with `?seat=<id>`. Choosing a seat is then an ordinary link,
		 * so it works without JavaScript. `ResolvedPathname` means the address
		 * has to come from a helper in `$lib/urls.ts`.
		 */
		hrefForSeat?: (seat: RoomSeat) => ResolvedPathname;
		/** The seat that is chosen now, drawn highlighted. */
		selectedSeatId?: string | null;
		/**
		 * A number to show at the end of each row, keyed by seat id, such as how
		 * many notes the chair has on the seat. A seat missing from it shows 0.
		 * Without it the rows show no number.
		 */
		counts?: Record<string, number>;
		/** What the number counts, read out after it by a screen reader, such as "notes". */
		countNoun?: string;
	};

	let {
		seats,
		attendance,
		hrefForSeat,
		selectedSeatId = null,
		counts,
		countNoun = ''
	}: Props = $props();

	/** The roll call's answer for one seat: `undefined` without attendance, `null` when not recorded. */
	function statusOf(seat: RoomSeat): AttendanceStatus | null | undefined {
		if (!attendance) return undefined;

		return attendance[seat.id] ?? null;
	}

	/** The seat's number from `counts`, or `undefined` when the list shows none. */
	function countOf(seat: RoomSeat): number | undefined {
		if (!counts) return undefined;

		return counts[seat.id] ?? 0;
	}
</script>

<ul class="divide-y divide-line rounded-2xl border border-line bg-surface">
	<!-- The `(seat.id)` key lets Svelte reuse list items instead of rebuilding them. -->
	{#each seats as seat (seat.id)}
		<li>
			{#if hrefForSeat}
				<!-- `aria-current` tells a screen reader which seat is chosen, as the highlight tells the eye. -->
				<a
					href={hrefForSeat(seat)}
					aria-current={seat.id === selectedSeatId ? 'true' : undefined}
					class="block px-4 py-2 hover:bg-brand-50 aria-[current]:bg-brand-100"
				>
					<SeatRow {seat} status={statusOf(seat)} count={countOf(seat)} {countNoun} />
				</a>
			{:else}
				<div class="px-4 py-2">
					<SeatRow {seat} status={statusOf(seat)} count={countOf(seat)} {countNoun} />
				</div>
			{/if}
		</li>
	{/each}
</ul>

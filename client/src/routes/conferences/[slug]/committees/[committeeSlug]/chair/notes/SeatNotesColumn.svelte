<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import SearchInput from '$lib/components/SearchInput.svelte';
	import SelectField from '$lib/components/SelectField.svelte';
	import SeatList from '$lib/components/room/SeatList.svelte';
	import { filterSeatsByName, noteSeatOptions } from '$lib/chair-notes';
	import type { AttendanceStatus, RoomSeat } from '$lib/committee-room';
	import { chairNotesUrl } from '$lib/urls';

	type Props = {
		/** Every available seat of the committee, in display order. */
		seats: RoomSeat[];
		/** How many notes each seat has, keyed by seat id. */
		noteCounts: Record<string, number>;
		/** The seat whose notes are shown, or null. */
		selectedSeatId: string | null;
		/** The latest roll call, keyed by seat id. */
		attendance: Record<string, AttendanceStatus>;
		conferenceSlug: string;
		committeeSlug: string;
	};

	let { seats, noteCounts, selectedSeatId, attendance, conferenceSlug, committeeSlug }: Props =
		$props();

	// `$state` makes Svelte redraw the list when the search text changes.
	let searchText = $state('');

	// Worked out again on every keystroke, because it reads `searchText`.
	const visibleSeats = $derived(filterSeatsByName(seats, searchText));
	const seatOptions = $derived(noteSeatOptions(seats, noteCounts));

	/** Each row links to the page with `?seat=<id>`, so choosing a seat works without JavaScript. */
	function seatHref(seat: RoomSeat) {
		return chairNotesUrl(conferenceSlug, committeeSlug, seat.id);
	}

	/** Filters the list as the chair types. Without JavaScript the full list stays. */
	function handleSearchInput(event: Event & { currentTarget: HTMLInputElement }) {
		searchText = event.currentTarget.value;
	}

	/**
	 * With JavaScript, choosing a seat on a phone is enough: the form is sent at
	 * once. Without JavaScript the "Show" button next to the list does the same.
	 */
	function handleSeatChange(event: Event & { currentTarget: HTMLSelectElement }) {
		event.currentTarget.form?.requestSubmit();
	}
</script>

<!-- Below `md` the column would squeeze the notes, so a dropdown takes its place. -->
<form method="get" class="flex items-end gap-2 md:hidden">
	<div class="min-w-0 flex-1">
		<SelectField
			label="Seat"
			name="seat"
			value={selectedSeatId ?? ''}
			options={seatOptions}
			onchange={handleSeatChange}
		/>
	</div>
	<Button label="Show" variant="secondary" />
</form>

<div class="hidden flex-col gap-3 md:flex">
	<SearchInput
		name="seatSearch"
		value=""
		placeholder="Filter seats"
		label="Filter seats"
		oninput={handleSearchInput}
	/>
	<SeatList
		seats={visibleSeats}
		{attendance}
		hrefForSeat={seatHref}
		{selectedSeatId}
		counts={noteCounts}
		countNoun="notes"
	/>
</div>

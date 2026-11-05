<script lang="ts">
	import type { PaperDeadline } from '$lib/documents';
	import type { PaperSeatRow } from '$lib/documents-page';
	import { chairPaperReadingUrl } from '$lib/urls';
	import PaperRow from './PaperRow.svelte';

	/** A refused review, and which paper's form it belongs to. */
	type ReviewRefusal = { documentId: string; comment: string; error: string };

	type Props = {
		/** The seated delegates the filter kept, each with their paper if they sent one. */
		paperSeats: PaperSeatRow[];
		/** The deadline and timezone the dates are shown against. */
		conference: PaperDeadline;
		/** What the last review form was refused with, or null. */
		refusal: ReviewRefusal | null;
		approveAction: string;
		requestChangesAction: string;
		conferenceSlug: string;
		committeeSlug: string;
	};

	let {
		paperSeats,
		conference,
		refusal,
		approveAction,
		requestChangesAction,
		conferenceSlug,
		committeeSlug
	}: Props = $props();

	/** The refusal to show under this paper's form: only the paper that was refused gets it. */
	function refusalOf(seat: PaperSeatRow) {
		if (refusal === null || seat.paper?.id !== refusal.documentId) return null;

		return { comment: refusal.comment, error: refusal.error };
	}

	/** Where a paper written on MUNMeet is read (T146). An uploaded PDF has no reading page. */
	function readHrefOf(seat: PaperSeatRow) {
		if (!seat.paper?.isWritten) return null;

		return chairPaperReadingUrl(conferenceSlug, committeeSlug, seat.seatId);
	}
</script>

{#if paperSeats.length === 0}
	<p class="text-body text-ink-600">No seats have a paper at this status.</p>
{:else}
	<ul class="flex flex-col gap-3">
		<!-- The `(seat.seatId)` key lets Svelte reuse rows instead of rebuilding them. -->
		{#each paperSeats as seat (seat.seatId)}
			<PaperRow
				{seat}
				{conference}
				refusal={refusalOf(seat)}
				{approveAction}
				{requestChangesAction}
				readHref={readHrefOf(seat)}
			/>
		{/each}
	</ul>
{/if}

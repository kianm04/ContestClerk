<script lang="ts">
	import type { DocumentsPageView, PaperSeatRow } from '$lib/documents-page';
	import { approvePaperActionUrl, chairPaperReadingUrl, manageDocumentsUrl } from '$lib/urls';
	import PaperSeatItem from './PaperSeatItem.svelte';

	type Props = {
		/** The seats to list, with any review still on its way already laid on top. */
		seats: PaperSeatRow[];
		/** The papers whose tick box is ticked. */
		selectedIds: string[];
		/** Called when a tick box changes, with the paper and whether it is ticked. */
		onSelect: (documentId: string, isSelected: boolean) => void;
		view: DocumentsPageView;
		conferenceSlug: string;
		/** The committee's slug, for the reading page of a written paper. */
		committeeSlug: string;
	};

	let { seats, selectedIds, onSelect, view, conferenceSlug, committeeSlug }: Props = $props();

	/** Where a paper's "Request changes" link leads: this view with its form open. */
	function reviewHref(documentId: string) {
		return manageDocumentsUrl(conferenceSlug, { ...view, reviewDocumentId: documentId });
	}

	/**
	 * Where a paper written on MUNMeet is read (T146). The reading page sits
	 * under the committee's chair pages, which let the conference's organisers
	 * in too. An uploaded PDF has no reading page, so its row gets `null`.
	 */
	function readHref(seat: PaperSeatRow) {
		if (!seat.paper?.isWritten) return null;

		return chairPaperReadingUrl(conferenceSlug, committeeSlug, seat.seatId);
	}
</script>

<!-- Flat lines on the white page, each with its own thin line under it. -->
<ul>
	<!-- The `(seat.seatId)` key lets Svelte reuse rows instead of rebuilding them. -->
	{#each seats as seat (seat.seatId)}
		<li class="border-b border-border">
			<PaperSeatItem
				{seat}
				isSelected={seat.paper !== null && selectedIds.includes(seat.paper.id)}
				{onSelect}
				approveAction={seat.paper
					? approvePaperActionUrl(conferenceSlug, view, seat.paper.id)
					: null}
				reviewHref={seat.paper ? reviewHref(seat.paper.id) : null}
				readHref={readHref(seat)}
			/>
		</li>
	{/each}
</ul>

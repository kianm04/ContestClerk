<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import BulkActionBar from '$lib/components/BulkActionBar.svelte';
	import Button from '$lib/components/Button.svelte';
	import ManageSection from '$lib/components/manage/ManageSection.svelte';
	import type { DocumentsPageView, PaperCommitteeRow, PaperSeatRow } from '$lib/documents-page';
	import { createInstantForm, type InstantSubmitInput } from '$lib/instant-form.svelte';
	import {
		describePaperReviewFailure,
		expectPaperReviewChange,
		withSeatId,
		type PaperReviewRow
	} from '$lib/paper-review-presses';
	import { pressedAction, rowsAfterPresses, type RowChange } from '$lib/row-changes';
	import { manageDocumentsActionUrl } from '$lib/urls';
	import PaperFilterLinks from './PaperFilterLinks.svelte';
	import PaperSeatRows from './PaperSeatRows.svelte';
	import RequestChangesForm from './RequestChangesForm.svelte';

	type Props = {
		committee: PaperCommitteeRow;
		/** Its filled seats, already filtered by `?paper=`. */
		seats: PaperSeatRow[];
		view: DocumentsPageView;
		conferenceSlug: string;
		/** What was typed into "Request changes" before a refusal. */
		reviewComment: string;
		reviewError: string | null;
	};

	let { committee, seats, view, conferenceSlug, reviewComment, reviewError }: Props = $props();

	/*
		Which papers are ticked, so `BulkActionBar` can say how many. `$state`
		makes Svelte redraw the bar whenever a box changes.
	*/
	let selectedIds: string[] = $state([]);

	/*
		Approving a paper, approving several at once and requesting changes are
		all worked out in the browser (`$lib/paper-review-presses.ts`), so a row
		shows its new status the moment its button is pressed instead of waiting
		for the server (T142). One instant form serves the whole list, including
		"Request changes" below, which is a separate `<form>` because forms
		cannot nest.
	*/
	const paperReviewForm = createInstantForm<RowChange<PaperReviewRow>[]>({
		describeFailure: describePaperReviewFailure
	});

	// The seats this page loaded, given the `id` a `RowChange` needs to find one.
	const paperRows = $derived(seats.map(withSeatId));

	function expectPress(input: InstantSubmitInput): RowChange<PaperReviewRow>[] | null {
		return expectPaperReviewChange(input, paperRows);
	}

	/*
		Wraps `submitExpecting` so the tick boxes empty the moment "Approve
		selected" is pressed, the way `formElement.reset()` used to once the
		server answered. The tick boxes are plain HTML, not driven by
		`selectedIds`, so nothing else clears them.
	*/
	const submitPaperReviewPress: SubmitFunction = (input) => {
		if (pressedAction(input.action) === '?/bulkApprovePapers') selectedIds = [];

		return paperReviewForm.submitExpecting(expectPress)(input);
	};

	// The seats shown, with any presses still on their way laid on top.
	const previewedSeats = $derived(rowsAfterPresses(paperRows, paperReviewForm.presses));

	// `$derived` finds these again whenever the address or the seats change.
	const bulkAction = $derived(manageDocumentsActionUrl(conferenceSlug, view, 'bulkApprovePapers'));
	const seatUnderReview = $derived(
		previewedSeats.find((seat) => seat.paper !== null && seat.paper.id === view.reviewDocumentId) ??
			null
	);

	/** Remember whether one paper is ticked, as its tick box reports it. */
	function handleSelect(documentId: string, isSelected: boolean) {
		const others = selectedIds.filter((id) => id !== documentId);
		selectedIds = isSelected ? [...others, documentId] : others;
	}
</script>

<ManageSection title="Papers for {committee.committeeHeading}">
	<div class="flex flex-col gap-4 pt-4">
		<PaperFilterLinks {view} {conferenceSlug} />

		<!-- A form of its own, outside the list's form, because forms cannot nest. -->
		{#if seatUnderReview?.paper}
			<RequestChangesForm
				seat={seatUnderReview}
				documentId={seatUnderReview.paper.id}
				{view}
				{conferenceSlug}
				comment={reviewComment}
				error={reviewError}
				onSubmit={submitPaperReviewPress}
			/>
		{/if}

		{#if previewedSeats.length === 0}
			<p class="text-body text-muted-foreground">No seats match this filter.</p>
		{:else}
			<!--
				One form for the whole list: the tick boxes are its fields for "Approve
				selected", and each row's own Approve button sends the same form to
				another address through `formaction`, carrying its paper in that address.
			-->
			<form
				method="post"
				action={bulkAction}
				class="flex flex-col gap-3"
				use:enhance={submitPaperReviewPress}
			>
				<PaperSeatRows
					seats={previewedSeats}
					{selectedIds}
					onSelect={handleSelect}
					{view}
					{conferenceSlug}
					committeeSlug={committee.committeeSlug}
				/>

				<BulkActionBar selectedCount={selectedIds.length}>
					<Button label="Approve selected" variant="primary" size="dense-sm" />
				</BulkActionBar>
			</form>
		{/if}
	</div>
</ManageSection>

<script lang="ts">
	import MarkdownContent from '$lib/components/markdown-editor/MarkdownContent.svelte';
	import PaperSheetHeading from '$lib/components/paper-writing/PaperSheetHeading.svelte';
	import { lastCommentLine } from '$lib/chair-papers';
	import { sharedChairForm } from '$lib/chair-form';
	import { paperSeatsAfterPresses } from '$lib/paper-presses';
	import { chairPaperReadingActionUrl, chairPapersUrl } from '$lib/urls';
	import ReviewForm from '../ReviewForm.svelte';
	import PaperNeighbourLinks from './PaperNeighbourLinks.svelte';
	import PaperReadingHeader from './PaperReadingHeader.svelte';
	import PrintPaperButton from './PrintPaperButton.svelte';
	import type { PageProps } from './$types';

	// `data` holds what the chair layout's `load` returned and what this page's
	// `load` added in `+page.server.ts`; both run again after every form sent and
	// when "Previous paper" or "Next paper" changes the address. `form` is what
	// a refused review sent back.
	let { data, form }: PageProps = $props();

	const conferenceSlug = $derived(data.conference.slug);
	const committeeSlug = $derived(data.committee.slug);

	// The chair layout's shared instant form (T141): a review shows on the
	// badge at once, the way it does on the papers page.
	const chairForm = sharedChairForm();
	const shownSeat = $derived(paperSeatsAfterPresses([data.paperSeat], chairForm.presses)[0]);
	const paper = $derived(shownSeat.paper);
	const canReview = $derived(paper !== null && paper.reviewStatus !== 'approved');
	const lastComment = $derived(
		paper === null ? null : lastCommentLine(paper, data.conference.timezone)
	);

	/** The address of one review action, which comes back to this paper. */
	function actionUrl(actionName: string): string {
		return chairPaperReadingActionUrl(
			conferenceSlug,
			committeeSlug,
			data.paperSeat.seatId,
			actionName
		);
	}
</script>

<!-- The title also names the file a browser suggests for "Save as PDF". -->
<svelte:head>
	<title>{data.paperSeat.seatName} position paper · {data.committee.name} · MUNMeet</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-[75ch] flex-col gap-6 print:max-w-none">
	<div class="flex flex-wrap items-center justify-between gap-3 print:hidden">
		<a
			href={chairPapersUrl(conferenceSlug, committeeSlug, null)}
			class="text-small font-medium text-link hover:underline"
		>
			← All papers
		</a>
		<PrintPaperButton />
	</div>

	<!--
		The chair's header, then the paper as the delegate saw it: its heading lines
		and its text in the paper's own typeface (Trello S6HLyL5Y). On paper the
		frame, padding, the chair's header and every control go, leaving the paper
		on its own, the way the delegate would have printed it.
	-->
	<article
		class="flex flex-col gap-6 rounded-2xl border border-border bg-background p-5 md:p-10 print:border-0 print:p-0"
	>
		<div class="print:hidden">
			<PaperReadingHeader
				seat={shownSeat}
				committeeName={data.committee.name}
				conference={data.conference}
				wordCount={data.wordCount}
			/>
		</div>
		<PaperSheetHeading heading={data.sheetHeading} />
		<MarkdownContent html={data.bodyHtml} isSheet />
	</article>

	<section aria-label="Review" class="print:hidden">
		{#if paper && canReview}
			<ReviewForm
				documentId={paper.id}
				typedComment={form?.reviewComment ?? ''}
				{lastComment}
				error={form?.reviewError ?? null}
				approveAction={actionUrl('approve')}
				requestChangesAction={actionUrl('requestChanges')}
			/>
		{:else if paper?.reviewComment}
			<p class="text-small text-muted-foreground">Comment: {paper.reviewComment}</p>
		{/if}
	</section>

	<div class="print:hidden">
		<PaperNeighbourLinks
			{conferenceSlug}
			{committeeSlug}
			previousSeatId={data.previousSeatId}
			nextSeatId={data.nextSeatId}
		/>
	</div>
</div>

<!--
	A `<style>` block, which this codebase avoids, because Tailwind has no class
	for `@page`: it sets the paper size and margins when this page is printed or
	saved as a PDF. It only applies while this page is on screen.
-->
<style>
	@page {
		size: A4;
		margin: 20mm;
	}
</style>

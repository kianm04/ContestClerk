<script lang="ts">
	import Notice from '$lib/components/Notice.svelte';
	import PaperWritingAside from '$lib/components/paper-writing/PaperWritingAside.svelte';
	import type { DelegationPaper } from '$lib/delegation-papers';
	import type { PaperDeadline } from '$lib/documents';
	import type { MarginComments } from '$lib/paper-comments';
	import type { LivePaperConnection } from '$lib/paper-live.svelte';
	import type { MarginWriter } from '$lib/paper-margin';
	import type { PaperHeading } from '$lib/paper-sheet';
	import type { PaperDraft, PaperWriteView, WriterStart } from '$lib/paper-writing';
	import { firstName } from '$lib/profiles';
	import SharedPaperWriter from './SharedPaperWriter.svelte';

	type Props = {
		paper: DelegationPaper;
		draft: PaperDraft | null;
		/** Where the editor starts, worked out by `writerStart` in `$lib/paper-writing.ts`. */
		start: WriterStart;
		deadline: PaperDeadline;
		topics: string[];
		/** What the page shows, from `sharedPaperView` in `$lib/delegation-papers.ts`. */
		view: PaperWriteView;
		/** Why the paper cannot be changed now, or `null`. */
		closedReason: string | null;
		/** The signed-in member of the delegation. */
		readerId: string;
		/** "Shared with …" the delegation, from `sharedWithText`. */
		sharedWith: string | null;
		/** Set when the paper is shared, so it is written live (T148); `null` otherwise. */
		live: LivePaperConnection | null;
		/** The lines the paper opens with, drawn above the text (Trello S6HLyL5Y). */
		sheetHeading: PaperHeading;
		/** The delegation, who name a suggestion's writer in the margin of a shared paper. */
		writers: MarginWriter[];
		/** The shared paper's comment threads, for its margin. */
		comments: MarginComments;
	};

	let {
		paper,
		draft,
		start,
		deadline,
		topics,
		view,
		closedReason,
		readerId,
		sharedWith,
		live,
		sheetHeading,
		writers,
		comments
	}: Props = $props();

	const holderFirstName = $derived(firstName(paper.holderName));
</script>

<!-- On a wider screen the notes sit beside the paper; on a phone they come first. -->
<div class="grid gap-6 md:grid-cols-[minmax(0,1fr)_14rem] md:items-start">
	<div class="md:order-last">
		<PaperWritingAside {deadline} {topics} reviewComment={paper.reviewComment} />
	</div>

	<div class="flex min-w-0 flex-col gap-4">
		{#if view === 'submitted'}
			<Notice tone="info">
				{holderFirstName} handed this paper in. Once they start changing it again, you can edit their
				new draft here.
			</Notice>
		{:else if view === 'closed'}
			<Notice tone="warning">{closedReason}</Notice>
		{:else}
			{#if paper.paperKind === 'uploaded'}
				<Notice tone="info">
					{holderFirstName} uploaded a PDF. A written paper they submit would replace it.
				</Notice>
			{/if}
			<SharedPaperWriter
				holderName={paper.holderName}
				{sheetHeading}
				startMarkdown={start.markdown}
				{draft}
				revision={start.revision}
				{readerId}
				{sharedWith}
				{live}
				{writers}
				{comments}
			/>
		{/if}
	</div>
</div>

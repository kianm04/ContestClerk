<script lang="ts">
	import Notice from '$lib/components/Notice.svelte';
	import type { PaperDeadline, PositionPaperFile } from '$lib/documents';
	import type { MarginComments } from '$lib/paper-comments';
	import type { LivePaperConnection } from '$lib/paper-live.svelte';
	import type { MarginWriter } from '$lib/paper-margin';
	import type { PaperHeading } from '$lib/paper-sheet';
	import { paperWriteView, type PaperDraft, type WriterStart } from '$lib/paper-writing';
	import { positionPaperWayUrl } from '$lib/urls';
	import PaperWritingAside from '$lib/components/paper-writing/PaperWritingAside.svelte';
	import PaperWriter from './PaperWriter.svelte';
	import WrittenPaperCard from './WrittenPaperCard.svelte';

	type Props = {
		conferenceSlug: string;
		committeeSlug: string;
		/** The seat's paper as handed in, written or uploaded, or `null` for none yet. */
		document: PositionPaperFile | null;
		draft: PaperDraft | null;
		/** Where the editor starts, worked out by `writerStart` in `$lib/paper-writing.ts`. */
		start: WriterStart;
		deadline: PaperDeadline;
		topics: string[];
		/** Why the paper cannot be changed now, from `canUploadPositionPaper`, or `null`. */
		closedReason: string | null;
		/** True on "Edit and resubmit" (`?edit=1`). */
		isEditing: boolean;
		/** The signed-in delegate. */
		readerId: string;
		/** "Shared with …" their delegation (T147), or `null` when they write alone. */
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
		conferenceSlug,
		committeeSlug,
		document,
		draft,
		start,
		deadline,
		topics,
		closedReason,
		isEditing,
		readerId,
		sharedWith,
		live,
		sheetHeading,
		writers,
		comments
	}: Props = $props();

	const isWritten = $derived(document?.bodyMarkdown != null);
	const view = $derived(paperWriteView({ isWritten, isEditing, closedReason }));

	const reviewComment = $derived(document?.reviewComment ?? null);
	// Without a deadline, a comment or topics the notes would be an empty box leaving a gap.
	const hasNotes = $derived(
		deadline.positionPaperDeadline !== null || reviewComment !== null || topics.length > 0
	);

	// The PDF that submitting a written paper would replace, if the seat uploaded one.
	const replacedFileName = $derived(document?.fileName ?? null);
	const editHref = $derived(
		closedReason === null ? positionPaperWayUrl(conferenceSlug, committeeSlug, 'write', true) : null
	);
</script>

<!-- On a wider screen the notes sit beside the paper; on a phone they come first. -->
<div class="grid gap-6 md:grid-cols-[minmax(0,1fr)_14rem] md:items-start">
	{#if hasNotes}
		<div class="md:order-last">
			<PaperWritingAside {deadline} {topics} {reviewComment} />
		</div>
	{/if}

	<div class="flex min-w-0 flex-col gap-4">
		{#if view === 'submitted' && document}
			<WrittenPaperCard {document} {sheetHeading} timezone={deadline.timezone} {editHref} />
		{:else if view === 'closed'}
			<Notice tone="warning">{closedReason}</Notice>
		{:else}
			{#if replacedFileName}
				<Notice tone="info">
					Submitting a written paper replaces the PDF you uploaded, {replacedFileName}.
				</Notice>
			{/if}
			<PaperWriter
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

<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import FileText from '@lucide/svelte/icons/file-text';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import Section from '$lib/components/Section.svelte';
	import MarkdownContent from '$lib/components/markdown-editor/MarkdownContent.svelte';
	import PaperSheetHeading from '$lib/components/paper-writing/PaperSheetHeading.svelte';
	import { formatDayAndMonth } from '$lib/dates';
	import type { PositionPaperFile } from '$lib/documents';
	import { paperLengthText, type PaperHeading } from '$lib/paper-sheet';
	import { countWords } from '$lib/paper-writing';
	import { statusBadgeTone, statusLabel } from '$lib/status';

	type Props = {
		/** The seat's written paper, as it was submitted. */
		document: PositionPaperFile;
		/** The lines the paper opens with, drawn above the text (Trello S6HLyL5Y). */
		sheetHeading: PaperHeading;
		/** The conference's timezone, for the date it was submitted. */
		timezone: string;
		/** Where "Edit and resubmit" goes, or `null` once the paper can no longer change. */
		editHref: ResolvedPathname | null;
	};

	let { document, sheetHeading, timezone, editHref }: Props = $props();

	// A missing review status is read as "submitted", as in `PaperStatusCard`.
	const reviewStatus = $derived(document.reviewStatus ?? 'submitted');
	const wordCount = $derived(countWords(document.bodyMarkdown ?? ''));
</script>

<!-- The submitted version is read only: changing it starts a new version in the editor. -->
<Section title="Your paper" icon={FileText}>
	<div class="flex flex-wrap items-center gap-3">
		<Badge
			tone={statusBadgeTone('review_status', reviewStatus)}
			label={statusLabel('review_status', reviewStatus)}
		/>
		<p class="text-small text-muted-foreground">
			Submitted {formatDayAndMonth(document.uploadedAt, timezone)} · {paperLengthText(wordCount)}
		</p>
	</div>

	<!-- The same sheet as the editor drew, so the paper reads as it will to the chair. -->
	<div class="mt-4 flex flex-col gap-4 rounded-2xl border border-border bg-background p-5 md:p-8">
		<PaperSheetHeading heading={sheetHeading} />
		<MarkdownContent html={document.bodyHtml ?? ''} isSheet />
	</div>

	{#if editHref}
		<div class="mt-4">
			<Button label="Edit and resubmit" variant="primary" href={editHref} />
		</div>
	{/if}
</Section>

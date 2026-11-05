<script lang="ts">
	import FileText from '@lucide/svelte/icons/file-text';
	import Badge from '$lib/components/Badge.svelte';
	import Section from '$lib/components/Section.svelte';
	import { formatDayAndMonth, formatDayAndTime } from '$lib/dates';
	import {
		formatFileSize,
		isPastPaperDeadline,
		type PaperDeadline,
		type PositionPaperFile
	} from '$lib/documents';
	import { statusBadgeTone, statusLabel } from '$lib/status';

	type Props = {
		/** The seat's own position paper, or `null` before anything has been uploaded. */
		document: PositionPaperFile | null;
		/** The conference's position paper deadline and the timezone it falls in. */
		deadline: PaperDeadline;
	};

	let { document, deadline }: Props = $props();

	/*
		Only used to say whether the deadline has already gone by. The server
		checks again before it lets an upload or a removal through, so a reader
		whose clock is wrong can be told the wrong thing here at worst, never let
		through by it.
	*/
	const now = new Date();

	// A paper always carries a review status once it exists; a missing one is
	// read as "submitted", the same safe fallback `toSeatPaper` in
	// `$lib/server/paper-reviews.ts` uses for the organiser's own list.
	const reviewStatus = $derived(document?.reviewStatus ?? 'submitted');
	const badgeTone = $derived(document ? statusBadgeTone('review_status', reviewStatus) : 'neutral');
	const badgeLabel = $derived(
		document ? statusLabel('review_status', reviewStatus) : 'Not uploaded'
	);

	const isOverdue = $derived(!document && isPastPaperDeadline(deadline, now));
	const dueText = $derived(
		deadline.positionPaperDeadline
			? `Due ${formatDayAndTime(deadline.positionPaperDeadline, deadline.timezone)}`
			: null
	);
</script>

<Section title="Status" icon={FileText}>
	<div>
		<Badge tone={badgeTone} label={badgeLabel} />
	</div>

	{#if document && document.fileName === null}
		<!-- A paper written on MUNMeet (T145) has no file; "Write it here" shows its text. -->
		<p class="mt-3 text-body text-ink-900">Written on MUNMeet</p>
		<p class="mt-1 text-small text-ink-600">
			Submitted {formatDayAndMonth(document.uploadedAt, deadline.timezone)}
		</p>
	{:else if document}
		<p class="mt-3 text-body text-ink-900">
			{document.fileName} · {formatFileSize(document.fileSizeBytes ?? 0)}
		</p>

		<p class="mt-1 text-small text-ink-600">
			Uploaded {formatDayAndMonth(document.uploadedAt, deadline.timezone)}
			{#if document.downloadUrl}
				·
				<!--
					A signed address made in `load`, good for one minute, points at
					Supabase Storage rather than at a page of ours, so `resolve()` has
					nothing to check it against. `rel="external"` says that on purpose,
					the way `ResourceRow.svelte` already does for a downloadable file.
				-->
				<a
					href={document.downloadUrl}
					target="_blank"
					rel="external"
					class="text-brand-700 hover:underline"
				>
					Download
				</a>
			{:else}
				· Download is temporarily unavailable.
			{/if}
		</p>
	{:else if dueText}
		<p class="mt-3 text-small {isOverdue ? 'text-danger-700' : 'text-ink-600'}">
			{isOverdue ? 'Overdue' : dueText}
		</p>
	{/if}

	{#if document?.reviewComment}
		<div class="mt-3 rounded-control bg-neutral-100 p-3">
			<p class="text-small text-ink-600">Comment from your chair</p>
			<p class="mt-1 text-body text-ink-900">“{document.reviewComment}”</p>
		</div>
	{/if}
</Section>

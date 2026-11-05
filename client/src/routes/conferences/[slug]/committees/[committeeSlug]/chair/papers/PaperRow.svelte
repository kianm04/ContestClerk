<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import Badge from '$lib/components/Badge.svelte';
	import Flag from '$lib/components/Flag.svelte';
	import { lastCommentLine, paperDateLine } from '$lib/chair-papers';
	import { paperStatusLabel, type PaperDeadline } from '$lib/documents';
	import { paperStatusTone, type PaperSeatRow } from '$lib/documents-page';
	import ReviewForm from './ReviewForm.svelte';

	type Props = {
		/** One seated delegate and their paper, if they sent one. */
		seat: PaperSeatRow;
		/** The deadline and timezone the dates are shown against. */
		conference: PaperDeadline;
		/** What the review form of this paper was refused with, or null. */
		refusal: { comment: string; error: string } | null;
		approveAction: string;
		requestChangesAction: string;
		/** The reading page of a paper written on MUNMeet (T146), or `null` for an upload. */
		readHref: ResolvedPathname | null;
	};

	let { seat, conference, refusal, approveAction, requestChangesAction, readHref }: Props =
		$props();

	// `$derived` works these out again whenever the page's data changes.
	const paper = $derived(seat.paper);
	const dateLine = $derived(paper === null ? null : paperDateLine(paper, conference));
	const canReview = $derived(paper !== null && paper.reviewStatus !== 'approved');
	const lastComment = $derived(paper === null ? null : lastCommentLine(paper, conference.timezone));
</script>

<li class="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
	<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
		{#if seat.countryCode}
			<Flag countryCode={seat.countryCode} />
		{/if}
		<p class="font-semibold">{seat.seatName} · {seat.delegateName ?? '—'}</p>
		<Badge tone={paperStatusTone(seat.status)} label={paperStatusLabel(seat.status)} />
		{#if dateLine}
			<span class="text-small text-ink-600">{dateLine}</span>
		{/if}
	</div>

	{#if paper?.downloadUrl}
		<p class="text-small text-ink-600">
			<!--
				A signed Storage address rather than a page of this app, so `resolve()`
				does not apply and the lint rule asking for it is switched off here.
				`rel="noopener"` stops the new tab from reaching back into this one.
			-->
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<a
				href={paper.downloadUrl}
				target="_blank"
				rel="noopener"
				class="font-medium text-brand-700 hover:underline"
			>
				Open PDF<span class="sr-only"> of {seat.seatName} (opens in a new tab)</span>
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
			· The link works for one minute; reload the page if it has expired.
		</p>
	{:else if readHref}
		<p class="text-small">
			<a href={readHref} class="font-medium text-brand-700 hover:underline">
				Read the paper<span class="sr-only"> of {seat.seatName}</span>
			</a>
		</p>
	{/if}

	{#if paper && canReview}
		<ReviewForm
			documentId={paper.id}
			typedComment={refusal?.comment ?? ''}
			{lastComment}
			error={refusal?.error ?? null}
			{approveAction}
			{requestChangesAction}
		/>
	{:else if paper?.reviewComment}
		<p class="text-small text-ink-600">Comment: {paper.reviewComment}</p>
	{/if}
</li>

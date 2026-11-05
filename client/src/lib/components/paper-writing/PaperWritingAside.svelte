<script lang="ts">
	import { formatDayAndTime } from '$lib/dates';
	import type { PaperDeadline } from '$lib/documents';
	import PaperTopics from './PaperTopics.svelte';

	type Props = {
		/** The conference's position paper deadline and the timezone it falls in. */
		deadline: PaperDeadline;
		topics: string[];
		/** What the chair wrote when reviewing the paper, or `null` when nothing. */
		reviewComment: string | null;
	};

	let { deadline, topics, reviewComment }: Props = $props();

	const dueText = $derived(
		deadline.positionPaperDeadline
			? `Due ${formatDayAndTime(deadline.positionPaperDeadline, deadline.timezone)}`
			: null
	);
</script>

<!-- What to keep in mind while writing, beside the editor on a wider screen and above it on a phone. -->
<aside class="flex flex-col gap-4" aria-label="About this paper">
	{#if dueText}
		<p class="text-small text-ink-600">{dueText}</p>
	{/if}

	{#if reviewComment}
		<div class="rounded-control bg-neutral-100 p-3">
			<p class="text-small text-ink-600">Comment from your chair</p>
			<p class="mt-1 text-body text-ink-900">“{reviewComment}”</p>
		</div>
	{/if}

	{#if topics.length > 0}
		<PaperTopics {topics} />
	{/if}
</aside>

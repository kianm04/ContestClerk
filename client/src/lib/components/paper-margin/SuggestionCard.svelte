<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import { Button } from '$lib/components/ui/button';
	import { suggestionSummarySentence, type MarginCard, type Suggester } from '$lib/paper-margin';
	import { quoteForCard, type SuggestionDecision } from '$lib/paper-suggestions';
	import { cn } from '$lib/utils';
	import ReplyForm from './ReplyForm.svelte';
	import ThreadComment from './ThreadComment.svelte';

	type Props = {
		card: Extract<MarginCard, { kind: 'suggestion' }>;
		/** Who suggested it, as the paper's people name them. */
		suggester: Suggester;
		/** "17:18", or "Thu 8 Oct, 17:18" on another day. */
		timeText: string;
		/** The reader's own suggestion is withdrawn, not accepted or rejected. */
		isMine: boolean;
		isActive: boolean;
		paperUrl: ResolvedPathname;
		onDecide: (decision: SuggestionDecision) => void;
		/** Whether the field to reply shows: on the chosen card, or always without JavaScript. */
		isReplyShown: boolean;
		/** For the first reply, the fields that start the suggestion's thread. */
		startThread: () => Record<string, string>;
		/** "Clause 1", for a phone, where the card sits under the paper. */
		locationText: string | null;
		/** The comment `?editComment=` opens, which shows as a form in its place. */
		editingCommentId: string | null;
	};

	let {
		card,
		suggester,
		timeText,
		isMine,
		isActive,
		paperUrl,
		onDecide,
		isReplyShown,
		startThread,
		locationText,
		editingCommentId
	}: Props = $props();

	const summary = $derived(card.suggestion.summary);
	const metaText = $derived(
		suggester.seatName === null ? timeText : `${suggester.seatName} · ${timeText}`
	);
	const BUTTON_CLASSES = 'h-8 border-input px-3 text-small font-medium max-lg:h-11';
</script>

<!--
	One suggestion, said as a chair would: "Replace old with new". The struck
	and the added words are drawn as they are in the text, so the card and the
	page read alike. The authors' argument about it sits between what it does
	and the buttons that decide it.
-->
<article
	id={card.key}
	aria-label="Suggestion by {suggester.name}"
	class={cn(
		'rounded-xl border bg-card px-4 pt-3.5 pb-4 transition-colors max-lg:rounded-none max-lg:border-x-0 max-lg:border-t-0 max-lg:px-0',
		isActive ? 'border-ring' : 'border-border'
	)}
>
	{#if locationText !== null}
		<p class="mb-2 text-small text-muted-foreground">{locationText}</p>
	{/if}
	<div class="flex flex-wrap items-baseline gap-x-2">
		<span class="text-dense font-semibold text-foreground">{suggester.name}</span>
		<span class="text-caption text-muted-foreground tabular-nums">{metaText}</span>
	</div>

	<p class="mt-1 text-dense break-words text-foreground">
		{#if summary.verb === 'replace'}
			Replace <del class="text-muted-foreground decoration-foreground decoration-[1.5px]"
				>{quoteForCard(summary.deleted)}</del
			>
			with
			<ins class="text-primary underline decoration-ring decoration-2 underline-offset-[3px]"
				>{quoteForCard(summary.inserted)}</ins
			>
		{:else if summary.verb === 'add'}
			Add <ins class="text-primary underline decoration-ring decoration-2 underline-offset-[3px]"
				>{quoteForCard(summary.inserted)}</ins
			>
		{:else if summary.verb === 'delete'}
			Delete <del class="text-muted-foreground decoration-foreground decoration-[1.5px]"
				>{quoteForCard(summary.deleted)}</del
			>
		{:else}
			{suggestionSummarySentence(summary)}
		{/if}
	</p>

	{#if card.thread !== null}
		<ol class="mt-3.5 flex flex-col gap-3">
			{#each card.thread.comments as comment (comment.id)}
				<ThreadComment
					{comment}
					threadId={card.thread.id}
					{paperUrl}
					isEditing={comment.id === editingCommentId}
				/>
			{/each}
		</ol>
	{/if}
	{#if isReplyShown}
		<ReplyForm
			replyingTo={suggester.name}
			to={card.thread === null ? { startThread } : { threadId: card.thread.id }}
		/>
	{/if}

	<div class="mt-3 flex gap-2">
		{#if isMine}
			<Button variant="outline" class={BUTTON_CLASSES} onclick={() => onDecide('reject')}>
				Withdraw
			</Button>
		{:else}
			<Button variant="outline" class={BUTTON_CLASSES} onclick={() => onDecide('accept')}>
				Accept
			</Button>
			<Button variant="outline" class={BUTTON_CLASSES} onclick={() => onDecide('reject')}>
				Reject
			</Button>
		{/if}
	</div>
</article>

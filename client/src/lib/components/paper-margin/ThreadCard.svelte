<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import type { MarginCard } from '$lib/paper-margin';
	import { quotedText } from '$lib/paper-comments';
	import { cn } from '$lib/utils';
	import ReplyForm from './ReplyForm.svelte';
	import ThreadActionForm from './ThreadActionForm.svelte';
	import ThreadComment from './ThreadComment.svelte';

	type Props = {
		card: Extract<MarginCard, { kind: 'thread' }>;
		paperUrl: ResolvedPathname;
		/** The card chosen in the text, drawn with the signal-blue border. */
		isActive: boolean;
		/** Whether the field to reply shows: on the chosen card, or always without JavaScript. */
		isReplyShown: boolean;
		/** "On ‘no later than 2028’, paragraph 2", for a phone, where the card sits under the paper. */
		locationText: string | null;
		/** The comment `?editComment=` opens, which shows as a form in its place. */
		editingCommentId: string | null;
	};

	let { card, paperUrl, isActive, isReplyShown, locationText, editingCommentId }: Props = $props();

	const thread = $derived(card.thread);
	const firstComment = $derived(thread.comments.at(0) ?? null);
</script>

<!--
	One thread: its comments in order, then a field to reply while it is the
	card being read. A resolved
	thread folds to one line, with "Reopen". The card's `id` is its key, which
	the `#thread-…` address after a post scrolls to.
-->
<article
	id={card.key}
	aria-label="Comment thread"
	class={cn(
		'rounded-xl border bg-card px-4 pt-3.5 pb-4 transition-colors max-lg:rounded-none max-lg:border-x-0 max-lg:border-t-0 max-lg:px-0',
		isActive ? 'border-ring' : 'border-border'
	)}
>
	{#if locationText !== null}
		<p class="mb-2 text-small text-muted-foreground">{locationText}</p>
	{/if}
	{#if card.isGone || thread.suggestionId !== null}
		<p class="mb-2 text-caption text-muted-foreground">
			{card.isGone
				? 'The text this was about was removed'
				: 'The suggestion this was about was decided'}
		</p>
		{#if card.isGone && thread.quotedText !== null}
			<p class="mb-2 text-dense text-muted-foreground">{quotedText(thread.quotedText)}</p>
		{/if}
	{/if}

	{#if thread.isResolved}
		<div class="flex items-baseline gap-2">
			<span class="text-caption text-muted-foreground">Resolved by {thread.resolvedByName}</span>
			<ThreadActionForm threadId={thread.id} kind="reopen" />
		</div>
		{#if firstComment !== null && !firstComment.isDeleted}
			<p class="mt-1 truncate text-dense text-foreground">{firstComment.body}</p>
		{/if}
	{:else}
		<!-- `(comment.id)` keys each row, so a new reply is added without redrawing the rest. -->
		<ol class="flex flex-col gap-3">
			{#each thread.comments as comment, index (comment.id)}
				<ThreadComment
					{comment}
					threadId={thread.id}
					{paperUrl}
					threadAction={index === 0 ? 'resolve' : null}
					isEditing={comment.id === editingCommentId}
				/>
			{/each}
		</ol>
		{#if isReplyShown}
			<ReplyForm
				replyingTo={firstComment?.writerName ?? 'the thread'}
				to={{ threadId: thread.id }}
			/>
		{/if}
	{/if}
</article>

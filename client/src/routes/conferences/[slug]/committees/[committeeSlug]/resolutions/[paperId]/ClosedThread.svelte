<script lang="ts">
	import CommentBody from '$lib/components/paper-margin/CommentBody.svelte';
	import { quotedText, type PaperThread } from '$lib/paper-comments';

	type Props = {
		thread: PaperThread;
	};

	let { thread }: Props = $props();
</script>

<!--
	One thread on an introduced paper, as it stood when comments closed: the
	words it was on, then its comments, with nothing to answer, edit or delete.
	`{#each … (comment.id)}` keys each comment by its id, so Svelte matches the
	same comment to the same row whenever the list is drawn again.
-->
<li class="flex flex-col gap-3 border-b border-border py-4">
	{#if thread.quotedText !== null}
		<p class="text-small text-muted-foreground">{quotedText(thread.quotedText)}</p>
	{/if}
	<ol class="flex flex-col gap-3">
		{#each thread.comments as comment (comment.id)}
			<li>
				<p class="flex flex-wrap items-baseline gap-x-2">
					<span class="text-dense font-semibold text-foreground">{comment.writerName}</span>
					<span class="text-caption text-muted-foreground tabular-nums">
						{comment.seatName === null
							? comment.writtenAt
							: `${comment.seatName} · ${comment.writtenAt}`}
					</span>
				</p>
				{#if comment.isDeleted}
					<p class="mt-1 text-dense text-muted-foreground italic">Comment deleted</p>
				{:else}
					<CommentBody body={comment.body} />
				{/if}
			</li>
		{/each}
	</ol>
</li>

<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import type { PaperComment } from '$lib/paper-comments';
	import { deleteCommentUrl, editCommentUrl } from '$lib/urls';
	import CommentBody from './CommentBody.svelte';
	import EditCommentForm from './EditCommentForm.svelte';
	import ThreadActionForm from './ThreadActionForm.svelte';

	type Props = {
		comment: PaperComment;
		threadId: string;
		/** The paper's own address, which the Edit and Delete links add to. */
		paperUrl: ResolvedPathname;
		/** "Resolve" or "Reopen", on the thread's first comment only. */
		threadAction?: 'resolve' | 'reopen' | null;
		/** True when the page's address asks to edit this comment, `?editComment=<id>`. */
		isEditing?: boolean;
	};

	let { comment, threadId, paperUrl, threadAction = null, isEditing = false }: Props = $props();

	// "Mexico · 10:31": the seat the writer sits in, when they have one.
	const metaText = $derived(
		comment.seatName === null ? comment.writtenAt : `${comment.seatName} · ${comment.writtenAt}`
	);
</script>

<li class="flex flex-col">
	<div class="flex flex-wrap items-baseline gap-x-2">
		<span class="text-dense font-semibold text-foreground">{comment.writerName}</span>
		<span class="text-caption text-muted-foreground tabular-nums">{metaText}</span>
		{#if threadAction !== null}
			<ThreadActionForm {threadId} kind={threadAction} />
		{/if}
	</div>

	{#if comment.isDeleted}
		<p class="mt-1 text-dense text-muted-foreground italic">Comment deleted</p>
	{:else if isEditing && comment.isMine}
		<EditCommentForm {comment} {threadId} {paperUrl} />
	{:else}
		<CommentBody body={comment.body} />
		{#if comment.isMine}
			<!-- Both open on this page's own address, so the page needs no script for them. -->
			<div class="mt-1 flex gap-4 text-caption">
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- this page with `?editComment=` (`editCommentUrl`), built from its own address, so there is no route for `resolve()` to build -->
				<a href={editCommentUrl(paperUrl, comment.id, threadId)} class="text-link hover:underline">
					Edit
				</a>
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- this page with `?deleteComment=` (`deleteCommentUrl`), built from its own address, so there is no route for `resolve()` to build -->
				<a href={deleteCommentUrl(paperUrl, comment.id)} class="text-link hover:underline">
					Delete
				</a>
			</div>
		{/if}
	{/if}
</li>

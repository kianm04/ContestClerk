<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import MarkdownContent from '$lib/components/markdown-editor/MarkdownContent.svelte';
	import { isAboutEarlierDelegate, noteAuthorLabel, type ChairNote } from '$lib/chair-notes';
	import { formatDayAndTime } from '$lib/dates';

	type Props = {
		note: ChairNote;
		/** Whether the reader may delete it: they wrote it, or they organise the conference. */
		canDelete: boolean;
		/** The reader's account id, so their own notes say "You". */
		readerId: string;
		/** The conference's timezone, which the time is shown in. */
		timeZone: string;
		/** When the seat's current delegate was seated, or null for an empty seat. */
		seatAllocatedAt: string | null;
		/** Where the Delete button posts, the `delete` action with the seat in the address. */
		deleteAction: string;
		/**
		 * Sends "Delete" through the chair's instant form, which takes the note
		 * off the list at once (`$lib/chair-form.ts`). Every note shares the one
		 * function; it reads which note to delete from this row's own hidden
		 * `noteId` field.
		 */
		onSubmit: SubmitFunction;
	};

	let { note, canDelete, readerId, timeZone, seatAllocatedAt, deleteAction, onSubmit }: Props =
		$props();

	const writtenAt = $derived(formatDayAndTime(note.createdAt, timeZone));
	const author = $derived(noteAuthorLabel(note, readerId));
	const isDelegateChanged = $derived(isAboutEarlierDelegate(note.createdAt, seatAllocatedAt));
</script>

<li class="flex items-start justify-between gap-3 py-3">
	<div class="min-w-0 flex-1">
		<p class="text-small text-ink-600">
			<time datetime={note.createdAt}>{writtenAt}</time> · {author}
			{#if isDelegateChanged}
				<span class="font-medium">(delegate changed)</span>
			{/if}
		</p>
		<!--
			The note formatted from its Markdown (T144). A note just added in the
			browser has no HTML yet, so it shows as typed until the server answers;
			`whitespace-pre-line` keeps its line breaks.
		-->
		<div class="mt-1 break-words">
			{#if note.bodyHtml !== null}
				<MarkdownContent html={note.bodyHtml} />
			{:else}
				<p class="text-body whitespace-pre-line">{note.body}</p>
			{/if}
		</div>
	</div>
	{#if canDelete}
		<ConfirmButton
			label="Delete"
			variant="ghost"
			size="sm"
			confirmTitle="Delete this note?"
			confirmText="This cannot be undone."
			formaction={deleteAction}
			{onSubmit}
		>
			<input type="hidden" name="noteId" value={note.id} />
		</ConfirmButton>
	{/if}
</li>

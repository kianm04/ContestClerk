<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { ChairNote } from '$lib/chair-notes';
	import NoteItem from './NoteItem.svelte';

	type Props = {
		/** The selected seat's notes, newest first. */
		notes: ChairNote[];
		/** The seat's name, for the sentence shown when it has no notes. */
		seatName: string;
		/** Whether the reader organises the conference, and so may delete anybody's note. */
		canManage: boolean;
		/** The reader's account id: their own notes say "You" and may be deleted. */
		readerId: string;
		/** The conference's timezone, which the times are shown in. */
		timeZone: string;
		/** When the seat's current delegate was seated, or null for an empty seat. */
		seatAllocatedAt: string | null;
		/** Where each Delete button posts. */
		deleteAction: string;
		/** Sends a "Delete" through the chair's instant form; see `NoteItem.svelte`. */
		onSubmit: SubmitFunction;
	};

	let {
		notes,
		seatName,
		canManage,
		readerId,
		timeZone,
		seatAllocatedAt,
		deleteAction,
		onSubmit
	}: Props = $props();
</script>

{#if notes.length === 0}
	<p class="text-body text-ink-600">No notes on {seatName} yet.</p>
{:else}
	<ul class="divide-y divide-line">
		<!-- The `(note.id)` key lets Svelte reuse list items instead of rebuilding them. -->
		{#each notes as note (note.id)}
			<NoteItem
				{note}
				canDelete={canManage || note.authorId === readerId}
				{readerId}
				{timeZone}
				{seatAllocatedAt}
				{deleteAction}
				{onSubmit}
			/>
		{/each}
	</ul>
{/if}

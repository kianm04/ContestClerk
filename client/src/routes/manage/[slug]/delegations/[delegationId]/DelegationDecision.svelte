<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import ReadOnlyNote from '$lib/components/manage/ReadOnlyNote.svelte';
	import ParagraphText from '$lib/components/ParagraphText.svelte';
	import TextArea from '$lib/components/TextArea.svelte';
	import { formatConferenceDay } from '$lib/conferences';
	import {
		DECISION_NOTE_MAX_LENGTH,
		INTERNAL_NOTE_MAX_LENGTH,
		type OrganiserDelegation
	} from '$lib/delegation-review';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';

	type Props = {
		/** The delegation being decided. */
		delegation: OrganiserDelegation;
		/** The conference's timezone, so the decided day is the day it was there. */
		timezone: string;
		/** False once the delegation has been decided, or while it still holds seats. */
		canReject: boolean;
		/** False for a reader who may not decide applications, who reads the note instead. */
		canEditNote: boolean;
		/** What was in the note box when the last post was refused. */
		internalNote: string;
		/** Why saving the note was refused, or `null`. */
		internalNoteError: string | null;
		/** Sends "Not accepted" through the page's instant form (`$lib/instant-form.svelte.ts`, T142). */
		onSubmit: SubmitFunction;
	};

	let {
		delegation,
		timezone,
		canReject,
		canEditNote,
		internalNote,
		internalNoteError,
		onSubmit
	}: Props = $props();

	/* `$derived` works both of these out again whenever the delegation changes. */
	const decidedDay = $derived(
		delegation.decidedAt === null ? null : formatConferenceDay(delegation.decidedAt, timezone)
	);
	const decisionNote = $derived(delegation.decisionNote ?? '');

	// Sends the note in the background and redraws the page without reloading
	// it (`$lib/in-place-form.svelte.ts`). `use:enhance` in the markup hands the
	// form over; without JavaScript it posts and reloads the page as before.
	// The note is edited in place, so it is never emptied after a save.
	const inPlaceForm = createInPlaceForm();
</script>

<div class="flex flex-col gap-4">
	{#if decidedDay}
		<p class="text-small text-muted-foreground">Decided {decidedDay}</p>
	{/if}

	{#if decisionNote}
		<ParagraphText text={decisionNote} />
	{/if}

	<!--
		`ConfirmButton` renders a form of its own, and a form cannot sit inside
		another form, so the note the head will read is a box of its own here
		rather than the one beside the Accept button.
	-->
	{#if canReject}
		<ConfirmButton
			label="Not accepted"
			confirmTitle="Mark this delegation as not accepted?"
			confirmText="The head is told, and the delegation can no longer be given seats."
			formaction="?/reject"
			size="dense"
			{onSubmit}
		>
			<TextArea
				isDense
				label="Why not? The head reads this."
				name="decisionNote"
				value=""
				rows={3}
				maxLength={DECISION_NOTE_MAX_LENGTH}
			/>
		</ConfirmButton>
	{/if}

	{#if !canEditNote}
		<ReadOnlyNote label="Internal note" text={internalNote} />
	{:else}
		<form
			method="post"
			action="?/saveInternalNote"
			class="flex flex-col gap-3"
			use:enhance={inPlaceForm.submit}
		>
			<TextArea
				isDense
				label="Internal note"
				name="internalNote"
				value={internalNote}
				rows={3}
				maxLength={INTERNAL_NOTE_MAX_LENGTH}
				help="Only your team reads this."
			/>

			{#if internalNoteError}
				<Notice tone="error">{internalNoteError}</Notice>
			{/if}

			<div>
				<Button label="Save note" variant="secondary" isLoading={inPlaceForm.isBusy} size="dense" />
			</div>
		</form>
	{/if}
</div>

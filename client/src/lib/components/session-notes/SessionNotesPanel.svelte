<script lang="ts">
	import { onMount } from 'svelte';
	// `beforeNavigate` runs just before the chair leaves the page or it is reloaded.
	import { beforeNavigate } from '$app/navigation';
	import type { SessionNotes } from '$lib/session-notes';
	import { createNotesAutosave } from '$lib/session-notes-autosave.svelte';
	import MarkdownEditor from '$lib/components/markdown-editor/MarkdownEditor.svelte';
	import NotesConflict from './NotesConflict.svelte';
	import NotesFailure from './NotesFailure.svelte';
	import NotesPanelHeading from './NotesPanelHeading.svelte';
	import NotesSaveStatus from './NotesSaveStatus.svelte';
	import PlainNotesForm from './PlainNotesForm.svelte';

	type Props = {
		/** The session the notes belong to. */
		sessionId: string;
		/** The stored notes, or null when nobody has written any yet. */
		notes: SessionNotes | null;
		/** What a refused plain Save sent, to show in the box again; otherwise null. */
		draftText: string | null;
		/** The signed-in chair, so a clash with their own other window says "You". */
		readerId: string;
	};

	let { sessionId, notes, draftText, readerId }: Props = $props();

	/** The form action on the page that saves the notes (`$lib/server/session-notes-actions.ts`). */
	const SAVE_ACTION = '?/saveSessionNotes';
	const HEADING_ID = 'session-notes-heading';
	const LEAVE_WARNING = 'Your notes have not been saved. Leave this page anyway?';

	/*
		Made once, from the notes as the page first drew them. The room's `load`
		runs again after every press, but must not wipe out what the chair is
		typing, so later `notes` are left alone. A new session draws a new panel.
	*/
	// svelte-ignore state_referenced_locally
	const autosave = createNotesAutosave({ action: SAVE_ACTION, sessionId, notes });

	// True once the page's script runs, in the browser (`onMount` never runs on the server).
	let isScriptRunning = $state(false);
	onMount(() => {
		isScriptRunning = true;
	});

	/*
		Leaving with notes not yet stored. Another press in the room only reloads
		this page, so the notes are simply saved now. Going to another page saves
		them too, but asks first when saving cannot work: the last save failed or
		another chair's notes are waiting. Closing or reloading the tab cannot
		wait for a save, so `cancel()` makes the browser ask the chair to stay.
	*/
	beforeNavigate((navigation) => {
		if (!autosave.hasUnsavedText) return;

		const isLeavingPage = navigation.to?.url.pathname !== navigation.from?.url.pathname;

		if (navigation.type === 'leave') {
			navigation.cancel();
		} else if (isLeavingPage && autosave.isAtRisk && !confirm(LEAVE_WARNING)) {
			navigation.cancel();
			return;
		}

		void autosave.saveNow();
	});
</script>

<section
	aria-labelledby={HEADING_ID}
	class="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4 shadow-card md:p-6"
>
	<NotesPanelHeading headingId={HEADING_ID}>
		{#if isScriptRunning}
			<NotesSaveStatus status={autosave.status} savedAt={autosave.savedAt} />
		{/if}
	</NotesPanelHeading>

	{#if isScriptRunning}
		<!--
			The shared Markdown editor (T143), which saves nothing itself: every
			change goes to `autosave`, which stores it. `{#key}` draws the editor
			afresh whenever `editorVersion` changes, as after "Use theirs".
		-->
		{#key autosave.editorVersion}
			<MarkdownEditor
				name="body"
				initialMarkdown={autosave.editorStartMarkdown}
				labelledBy={HEADING_ID}
				placeholder="Write your notes here…"
				onChange={autosave.edit}
			/>
		{/key}
		{#if autosave.conflict !== null}
			<NotesConflict
				theirNotes={autosave.conflict}
				{readerId}
				onKeepMine={autosave.keepMine}
				onUseTheirs={autosave.useTheirs}
			/>
		{:else if autosave.status === 'failed' && autosave.failureMessage !== null}
			<NotesFailure message={autosave.failureMessage} onRetry={autosave.saveNow} />
		{/if}
	{:else}
		<PlainNotesForm
			action={SAVE_ACTION}
			{sessionId}
			revision={notes?.revision ?? 0}
			text={draftText ?? notes?.body ?? ''}
			labelledBy={HEADING_ID}
			theirNotes={draftText === null ? null : notes}
			onTypedBeforeScript={autosave.startFromTypedText}
		/>
	{/if}
</section>

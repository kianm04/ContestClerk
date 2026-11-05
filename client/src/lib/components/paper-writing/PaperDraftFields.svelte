<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '$lib/components/Button.svelte';
	import { createDraftAutosave } from '$lib/paper-draft-autosave.svelte';
	import { saveOrAskBeforeLeaving } from '$lib/paper-leave-guard';
	import type { PaperHeading } from '$lib/paper-sheet';
	import { PAPER_WRITING_MESSAGES, countWords, type PaperDraft } from '$lib/paper-writing';
	import DraftConflict from './DraftConflict.svelte';
	import DraftProblem from './DraftProblem.svelte';
	import DraftStatusLine from './DraftStatusLine.svelte';
	import PaperEditor from './PaperEditor.svelte';
	import PaperSharingLine from './PaperSharingLine.svelte';

	type Props = {
		/** The `saveDraft` action the draft is posted to, with and without JavaScript. */
		saveAction: string;
		/** The heading above the editor, which also names it for a screen reader. */
		heading: string;
		/** The lines the paper opens with, drawn above the text (Trello S6HLyL5Y). */
		sheetHeading: PaperHeading;
		/** What the editor starts with: the draft, or the submitted text for "Edit and resubmit". */
		startMarkdown: string;
		/** The stored draft when the page loaded, or `null` when there is none. */
		draft: PaperDraft | null;
		/** The draft revision "Save draft" sends without JavaScript, 0 for none yet. */
		revision: number;
		/** The signed-in writer. */
		readerId: string;
		/** "Shared with …" from `sharedWithText`, or `null` for a delegate writing alone. */
		sharedWith: string | null;
	};

	let {
		saveAction,
		heading,
		sheetHeading,
		startMarkdown,
		draft,
		revision,
		readerId,
		sharedWith
	}: Props = $props();

	const HEADING_ID = 'paper-writer-heading';

	/*
		Made once, from what the page first drew. `load` runs again after a
		refused submit, but must not wipe out what the writer is typing.
	*/
	// svelte-ignore state_referenced_locally
	const autosave = createDraftAutosave({ action: saveAction, startMarkdown, draft, readerId });

	// svelte-ignore state_referenced_locally
	let wordCount = $state(countWords(startMarkdown));

	// True once the page's script runs, in the browser (`onMount` never runs on the server).
	let isScriptRunning = $state(false);
	onMount(() => {
		isScriptRunning = true;

		// The function `onMount` returns runs when the editor goes away, as after a submit.
		return () => autosave.stop();
	});

	// Leaving with text not yet stored saves it first, or asks (`$lib/paper-leave-guard.ts`).
	saveOrAskBeforeLeaving(autosave);

	function handleChange(markdown: string) {
		wordCount = countWords(markdown);
		autosave.edit(markdown);
	}

	function handleUseTheirs() {
		autosave.useTheirs();
		wordCount = countWords(autosave.editorStartMarkdown);
	}
</script>

<div class="flex flex-col gap-3">
	<h2 id={HEADING_ID} class="text-h3 text-foreground">{heading}</h2>
	{#if sharedWith}
		<PaperSharingLine
			{sharedWith}
			editor={autosave.lastEditor}
			savedAt={autosave.savedAt}
			{readerId}
		/>
	{/if}
	<input type="hidden" name="revision" value={revision} />
	<!--
		The paper is drawn as a sheet: its heading lines, then the editor. Without
		JavaScript the editor is a plain Markdown box. `{#key}` draws it afresh
		whenever `editorVersion` changes, as after "Use theirs", because the
		editor otherwise keeps the text it was started with.
	-->
	<div>
		{#key autosave.editorVersion}
			<PaperEditor
				name="body"
				initialMarkdown={autosave.editorStartMarkdown}
				labelledBy={HEADING_ID}
				placeholder="Write your position paper here…"
				onChange={handleChange}
				look="position-paper"
				sheetLabel="The position paper's text"
				{sheetHeading}
			/>
		{/key}
	</div>
	<DraftStatusLine
		{wordCount}
		status={autosave.status}
		savedAt={autosave.savedAt}
		isAutosaving={isScriptRunning}
	/>
	{#if autosave.theirDraft}
		<DraftConflict
			theirDraft={autosave.theirDraft}
			{readerId}
			onKeepMine={autosave.keepMine}
			onUseTheirs={handleUseTheirs}
		/>
	{:else if autosave.hasConflict}
		<!-- The draft it met is gone, as after a submit, so there is only this text to keep. -->
		<DraftProblem
			message={PAPER_WRITING_MESSAGES.liveConflict}
			actionLabel="Keep this version"
			onAction={autosave.keepMine}
		/>
	{:else if autosave.status === 'failed' && autosave.failureMessage !== null}
		<DraftProblem
			message={autosave.failureMessage}
			actionLabel="Try again"
			onAction={autosave.saveNow}
		/>
	{/if}
	{#if !isScriptRunning}
		<div>
			<Button label="Save draft" variant="secondary" formaction={saveAction} />
		</div>
	{/if}
</div>

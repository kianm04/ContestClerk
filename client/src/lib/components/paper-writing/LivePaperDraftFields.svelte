<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import { plainFormSuggestionsMessage } from '$lib/paper-comments';
	import type { LivePaper } from '$lib/paper-live.svelte';
	import type { PaperMargin } from '$lib/paper-margin-state.svelte';
	import type { PaperHeading } from '$lib/paper-sheet';
	import { countWords } from '$lib/paper-writing';
	import DraftProblem from './DraftProblem.svelte';
	import DraftStatusLine from './DraftStatusLine.svelte';
	import LivePaperHeadingRow from './LivePaperHeadingRow.svelte';
	import PaperEditor from './PaperEditor.svelte';
	import PaperLivePaused from './PaperLivePaused.svelte';
	import PaperSharingLine from './PaperSharingLine.svelte';

	type Props = {
		/** The `saveDraft` action the draft is posted to, with and without JavaScript. */
		saveAction: string;
		/** The heading above the editor, which also names it for a screen reader. */
		heading: string;
		/** The lines the paper opens with, drawn above the text (Trello S6HLyL5Y). */
		sheetHeading: PaperHeading;
		/** What the editor starts with when nothing is stored yet. */
		startMarkdown: string;
		/** The draft revision "Save draft" sends without JavaScript, 0 for none yet. */
		revision: number;
		/** The signed-in writer. */
		readerId: string;
		/** "Shared with …" from `sharedWithText`. */
		sharedWith: string;
		/** The live paper from `LivePositionPaper`, or `null` while the server draws the page. */
		paper: LivePaper | null;
		/** The comments and suggestions beside the paper, which the editor reports to. */
		margin: PaperMargin;
		isScriptRunning: boolean;
		/** How many suggestions the stored draft holds, for the page without JavaScript. */
		openSuggestions: number;
	};

	let {
		saveAction,
		heading,
		sheetHeading,
		startMarkdown,
		revision,
		readerId,
		sharedWith,
		paper,
		margin,
		isScriptRunning,
		openSuggestions
	}: Props = $props();

	const HEADING_ID = 'paper-writer-heading';

	// svelte-ignore state_referenced_locally
	let wordCount = $state(countWords(startMarkdown));

	function handleTryAgain() {
		void paper?.save.saveNow();
	}

	function handleReload() {
		location.reload();
	}
</script>

<div class="flex flex-col gap-3">
	<LivePaperHeadingRow {heading} headingId={HEADING_ID} {paper} {margin} />
	<PaperSharingLine
		{sharedWith}
		editor={paper?.save.lastEditor ?? null}
		savedAt={paper?.save.savedAt ?? null}
		{readerId}
	/>
	{#if paper}
		<PaperLivePaused status={paper.channelStatus} othersWriting="your delegation's" />
	{/if}
	<input type="hidden" name="revision" value={revision} />
	<!-- `onChange` hears the others' typing too, so the word count covers the whole paper. -->
	<div>
		<PaperEditor
			name="body"
			initialMarkdown={startMarkdown}
			labelledBy={HEADING_ID}
			placeholder="Write your position paper here…"
			onChange={(markdown) => (wordCount = countWords(markdown))}
			live={paper?.editorDocument}
			look="position-paper"
			sheetLabel="The position paper's text"
			{sheetHeading}
			margin={paper ? margin : undefined}
		/>
	</div>
	<DraftStatusLine
		{wordCount}
		status={paper?.save.status ?? 'saved'}
		savedAt={paper?.save.savedAt ?? null}
		isAutosaving={isScriptRunning}
	/>
	{#if paper?.save.isReplaced && paper.save.failureMessage !== null}
		<DraftProblem
			message={paper.save.failureMessage}
			actionLabel="Reload"
			onAction={handleReload}
		/>
	{:else if paper?.save.status === 'failed' && paper.save.failureMessage !== null}
		<DraftProblem
			message={paper.save.failureMessage}
			actionLabel="Try again"
			onAction={handleTryAgain}
		/>
	{/if}
	<!-- The plain box cannot hold suggestions, so it cannot be saved over them either. -->
	{#if !isScriptRunning && openSuggestions > 0}
		<p class="max-w-prose text-small text-muted-foreground">
			{plainFormSuggestionsMessage(openSuggestions)}
		</p>
	{:else if !isScriptRunning}
		<div>
			<Button label="Save draft" variant="secondary" formaction={saveAction} />
		</div>
	{/if}
</div>

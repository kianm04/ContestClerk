<script lang="ts">
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import LivePositionPaper from '$lib/components/paper-writing/LivePositionPaper.svelte';
	import PaperDraftFields from '$lib/components/paper-writing/PaperDraftFields.svelte';
	import type { MarginComments } from '$lib/paper-comments';
	import type { LivePaperConnection } from '$lib/paper-live.svelte';
	import type { MarginWriter } from '$lib/paper-margin';
	import type { PaperHeading } from '$lib/paper-sheet';
	import { paperWayAction, type PaperDraft, type PaperSubmit } from '$lib/paper-writing';

	type Props = {
		/** The lines the paper opens with, drawn above the text (Trello S6HLyL5Y). */
		sheetHeading: PaperHeading;
		/** What the editor starts with: the draft, or the submitted text for "Edit and resubmit". */
		startMarkdown: string;
		/** The stored draft when the page loaded, or `null` when there is none. */
		draft: PaperDraft | null;
		/** The draft revision "Save draft" sends without JavaScript, 0 for none yet. */
		revision: number;
		/** The signed-in delegate. */
		readerId: string;
		/** "Shared with …" their delegation (T147), or `null` when they write alone. */
		sharedWith: string | null;
		/** Set when the paper is shared, so it is written live (T148); `null` otherwise. */
		live: LivePaperConnection | null;
		/** The delegation, who name a suggestion's writer in the margin of a shared paper. */
		writers: MarginWriter[];
		/** The shared paper's comment threads, for its margin. */
		comments: MarginComments;
	};

	let {
		sheetHeading,
		startMarkdown,
		draft,
		revision,
		readerId,
		sharedWith,
		live,
		writers,
		comments
	}: Props = $props();

	// Both keep `?way=write&edit=1`, so a refusal without JavaScript comes back to this editor.
	const SAVE_ACTION = paperWayAction('write', 'saveDraft');
	const SUBMIT: PaperSubmit = {
		label: 'Submit for review',
		confirmTitle: 'Submit your position paper?',
		confirmText:
			'Your chair will see this version. You can change it until the deadline, unless your chair approves it.',
		formaction: paperWayAction('write', 'submitWritten')
	};
</script>

<!--
	The whole writer is one form. Its fields sit inside `ConfirmButton`, which
	asks before "Submit for review" sends them. Without JavaScript the editor
	is a plain Markdown box and "Save draft" posts the same form to `saveDraft`.
	Only the delegate in the seat has this button: their delegation edits the
	draft from its own page, which cannot submit it (T147). A shared paper is
	written live, with the delegation's comments and suggestions beside it.
-->
{#if live && sharedWith}
	<LivePositionPaper
		saveAction={SAVE_ACTION}
		submit={SUBMIT}
		footnote={null}
		heading="Your paper"
		{sheetHeading}
		{startMarkdown}
		{draft}
		{revision}
		{readerId}
		{sharedWith}
		{live}
		{writers}
		{comments}
	/>
{:else}
	<ConfirmButton {...SUBMIT} variant="primary">
		<PaperDraftFields
			saveAction={SAVE_ACTION}
			heading="Your paper"
			{sheetHeading}
			{startMarkdown}
			{draft}
			{revision}
			{readerId}
			{sharedWith}
		/>
	</ConfirmButton>
{/if}

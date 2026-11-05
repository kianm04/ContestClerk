<script lang="ts">
	import { onMount } from 'svelte';
	// `browser` is true in the browser and false while the server draws the page.
	import { browser } from '$app/environment';
	import PaperMargin from '$lib/components/paper-margin/PaperMargin.svelte';
	import PaperPhoneBar from '$lib/components/paper-margin/PaperPhoneBar.svelte';
	import type { MarginComments } from '$lib/paper-comments';
	import { saveOrAskBeforeLeaving } from '$lib/paper-leave-guard';
	import { createLivePaper, type LivePaperConnection } from '$lib/paper-live.svelte';
	import type { MarginWriter } from '$lib/paper-margin';
	import { createPaperMargin } from '$lib/paper-margin-state.svelte';
	import type { PaperHeading } from '$lib/paper-sheet';
	import { PAPER_WRITING_MESSAGES, type PaperDraft, type PaperSubmit } from '$lib/paper-writing';
	import LivePaperDraftFields from './LivePaperDraftFields.svelte';
	import PositionPaperForm from './PositionPaperForm.svelte';

	type Props = {
		/** The `saveDraft` action the draft is posted to, with and without JavaScript. */
		saveAction: string;
		/** "Submit for review" for the delegate in the seat, `null` for the rest of the delegation. */
		submit: PaperSubmit | null;
		/** The line under a form that cannot submit, or `null`. */
		footnote: string | null;
		heading: string;
		sheetHeading: PaperHeading;
		startMarkdown: string;
		/** The stored draft when the page loaded, or `null` when there is none. */
		draft: PaperDraft | null;
		revision: number;
		readerId: string;
		/** "Shared with …" from `sharedWithText`. */
		sharedWith: string;
		/** The live setup from `load`, with the browser's Supabase client. */
		live: LivePaperConnection;
		/** The delegation, who name a suggestion's writer. */
		writers: MarginWriter[];
		/** The paper's threads, and what the margin needs to show them. */
		comments: MarginComments;
	};

	let {
		saveAction,
		submit,
		footnote,
		heading,
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

	/*
		The shared document is made once, from what the page first drew, and
		only in the browser: the server draws the plain Markdown box instead,
		which is also all a page without JavaScript has.
	*/
	// svelte-ignore state_referenced_locally
	const paper = browser
		? createLivePaper({
				...live,
				action: saveAction,
				replacedMessage: PAPER_WRITING_MESSAGES.replaced,
				draft,
				startMarkdown,
				// Read again each time, from the latest `load`: the delegation can change while it is open.
				knownWriters: () => live.setup.writers
			})
		: null;

	// The delegation comments and suggests on the paper as a bloc does (docs/committee-papers.md, decision 15).
	// svelte-ignore state_referenced_locally
	const margin = createPaperMargin({
		threads: () => comments.threads,
		userId: live.setup.writer.id
	});

	// True once the page's script runs, in the browser (`onMount` never runs on the server).
	let isScriptRunning = $state(false);
	onMount(() => {
		isScriptRunning = true;

		// Joins the others now. The function it answers leaves again when the editor goes away.
		return paper?.start();
	});

	// Leaving with text not yet stored: the same care as `PaperDraftFields`.
	saveOrAskBeforeLeaving(paper?.save ?? null);
</script>

<!--
	The paper with its comments beside it from `lg` up, and under it below
	that. `overflow-anchor: none` keeps the browser from scrolling the page
	when a card above the reader's finger opens its reply field.
-->
<div
	class="grid grid-cols-1 [overflow-anchor:none] lg:grid-cols-[minmax(0,1fr)_18.5rem] lg:gap-x-8"
>
	<div class="min-w-0">
		<PositionPaperForm {saveAction} {submit} {footnote}>
			<LivePaperDraftFields
				{saveAction}
				{heading}
				{sheetHeading}
				{startMarkdown}
				{revision}
				{readerId}
				{sharedWith}
				{paper}
				{margin}
				{isScriptRunning}
				openSuggestions={live.setup.openSuggestions}
			/>
		</PositionPaperForm>
	</div>
	<div class="min-w-0">
		<PaperMargin
			{margin}
			paperUrl={comments.paperUrl}
			people={writers}
			userId={live.setup.writer.id}
			timeZone={comments.timeZone}
			editingCommentId={comments.editingCommentId}
			{isScriptRunning}
		/>
	</div>
</div>

{#if isScriptRunning}
	<PaperPhoneBar {margin} />
{/if}

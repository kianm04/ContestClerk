<script lang="ts">
	import LivePositionPaper from '$lib/components/paper-writing/LivePositionPaper.svelte';
	import PaperDraftFields from '$lib/components/paper-writing/PaperDraftFields.svelte';
	import PositionPaperForm from '$lib/components/paper-writing/PositionPaperForm.svelte';
	import type { MarginComments } from '$lib/paper-comments';
	import type { LivePaperConnection } from '$lib/paper-live.svelte';
	import type { MarginWriter } from '$lib/paper-margin';
	import type { PaperHeading } from '$lib/paper-sheet';
	import type { PaperDraft } from '$lib/paper-writing';
	import { firstName } from '$lib/profiles';

	type Props = {
		/** The member whose paper this is, who alone may submit it. */
		holderName: string;
		/** The lines the paper opens with, drawn above the text (Trello S6HLyL5Y). */
		sheetHeading: PaperHeading;
		/** What the editor starts with: the draft, or the text a refused save handed back. */
		startMarkdown: string;
		/** The stored draft when the page loaded, or `null` when there is none. */
		draft: PaperDraft | null;
		/** The draft revision "Save draft" sends without JavaScript, 0 for none yet. */
		revision: number;
		/** The signed-in member of the delegation. */
		readerId: string;
		/** "Shared with …" the delegation, from `sharedWithText`. */
		sharedWith: string | null;
		/** Set when the paper is shared, so it is written live (T148); `null` otherwise. */
		live: LivePaperConnection | null;
		/** The delegation, who name a suggestion's writer in the margin. */
		writers: MarginWriter[];
		/** The paper's comment threads, for its margin. */
		comments: MarginComments;
	};

	let {
		holderName,
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

	const SAVE_ACTION = '?/saveDraft';

	const heading = $derived(`${holderName}'s paper`);
	const footnote = $derived(`Only ${firstName(holderName)} can submit this paper.`);
</script>

<!--
	The same editor as the delegate's own page, without "Submit for review":
	only the delegate in the seat hands the paper in (T147). With JavaScript
	the draft saves itself; without it, "Save draft" posts this form. Written
	live, the paper has the delegation's comments and suggestions beside it.
-->
{#if live && sharedWith}
	<LivePositionPaper
		saveAction={SAVE_ACTION}
		submit={null}
		{footnote}
		{heading}
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
	<PositionPaperForm saveAction={SAVE_ACTION} submit={null} {footnote}>
		<PaperDraftFields
			saveAction={SAVE_ACTION}
			{heading}
			{sheetHeading}
			{startMarkdown}
			{draft}
			{revision}
			{readerId}
			{sharedWith}
		/>
	</PositionPaperForm>
{/if}

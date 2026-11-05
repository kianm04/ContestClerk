<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import PaperMargin from '$lib/components/paper-margin/PaperMargin.svelte';
	import PaperPhoneBar from '$lib/components/paper-margin/PaperPhoneBar.svelte';
	import {
		paperTextLabel,
		type AuthorWords,
		type PaperName,
		type PaperPeopleActions,
		type PaperPerson
	} from '$lib/committee-papers';
	import type { LivePaper } from '$lib/paper-live.svelte';
	import type { PaperMargin as Margin } from '$lib/paper-margin-state.svelte';
	import type { WriterStart } from '$lib/paper-writing';
	import CommitteePaperFields from './CommitteePaperFields.svelte';
	import SourcePaperPanel from '$lib/components/committee-papers/SourcePaperPanel.svelte';
	import type { SigningView } from '$lib/paper-signing';
	import { isReturnedPaper } from '$lib/paper-submitting';
	import type { ResolutionChecks } from '$lib/resolution-checks-state.svelte';
	import PaperSideColumn from './PaperSideColumn.svelte';
	import ReturnedNotes from './ReturnedNotes.svelte';
	import type { PaperProgress, PaperResolution } from './paper-resolution';

	type Props = {
		conferenceSlug: string;
		committeeSlug: string;
		paper: PaperName & { id: string };
		people: PaperPerson[];
		words: AuthorWords;
		actions: PaperPeopleActions;
		livePaper: LivePaper | null;
		margin: Margin;
		start: WriterStart;
		isScriptRunning: boolean;
		/** What the margin needs beside the threads, which `margin` already follows. */
		comments: {
			paperUrl: ResolvedPathname;
			timeZone: string;
			editingCommentId: string | null;
		};
		/** The paper's title's id, which names the editor. */
		headingId: string;
		/** The reader, whose own suggestions are withdrawn rather than decided. */
		userId: string;
		/** How many suggestions the stored paper holds, for the page without JavaScript. */
		openSuggestions: number;
		resolution: PaperResolution | null;
		checks: ResolutionChecks | null;
		/** Whether the paper takes signatures, and the line over "Close signatures"; `null` for a working paper. */
		signatures: SigningView | null;
		/** Where the paper stands with the dais, which may have returned it with a comment. */
		progress: PaperProgress;
	};

	let {
		conferenceSlug,
		committeeSlug,
		paper,
		people,
		words,
		actions,
		livePaper,
		margin,
		start,
		isScriptRunning,
		comments,
		headingId,
		userId,
		openSuggestions,
		resolution,
		checks,
		signatures,
		progress
	}: Props = $props();
</script>

<!--
	The paper's people beside the text from `md` up, and under it on a phone,
	where `order-last` moves them after it. From `lg` up the comments have a
	third column beside the text; below it they follow the text.

	`overflow-anchor: none` stops the browser holding the people in place on a
	phone when a card above them opens its reply field: it would scroll the page
	under the reader's finger, and the tap would miss its button.
-->
<div
	class="mt-4 grid grid-cols-1 [overflow-anchor:none] sm:mt-6 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-x-8 lg:grid-cols-[13rem_minmax(0,1fr)_18.5rem]"
>
	<div class="order-last mt-10 md:order-first md:mt-11">
		<PaperSideColumn
			{conferenceSlug}
			{committeeSlug}
			paperId={paper.id}
			{people}
			{words}
			{actions}
			resolution={resolution && {
				...resolution,
				isOpenForSignatures: signatures?.isOpen ?? false,
				closeNote: signatures?.closeNote ?? null,
				isReturned: isReturnedPaper(progress.status, progress.decision),
				openSourceId: resolution.openSource?.id ?? null
			}}
			checks={resolution?.support.rules.checksFormat ? checks : null}
			isAuthor
		/>
	</div>
	<div class="min-w-0">
		<ReturnedNotes {progress} timeZone={comments.timeZone} />
		<CommitteePaperFields
			{livePaper}
			{headingId}
			label={paperTextLabel(paper.kind)}
			startMarkdown={start.markdown}
			revision={start.revision}
			{isScriptRunning}
			{margin}
			{openSuggestions}
			resolution={resolution && checks
				? { checks, heading: resolution.heading, isDraft: resolution.isDraft }
				: undefined}
		/>
	</div>
	<div class="min-w-0 md:col-start-2 lg:col-start-3 lg:row-start-1">
		<!-- A working paper the draft is based on, opened from "Based on", takes the margin's place until it is closed. -->
		{#if resolution?.openSource}
			<div class="mt-10 lg:mt-14">
				<SourcePaperPanel source={resolution.openSource} closeHref={comments.paperUrl} />
			</div>
		{:else}
			<PaperMargin
				{margin}
				paperUrl={comments.paperUrl}
				{people}
				{userId}
				timeZone={comments.timeZone}
				editingCommentId={comments.editingCommentId}
				{isScriptRunning}
			/>
		{/if}
	</div>
</div>

{#if isScriptRunning}
	<PaperPhoneBar {margin} />
{/if}

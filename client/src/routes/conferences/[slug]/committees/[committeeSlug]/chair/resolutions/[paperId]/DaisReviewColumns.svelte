<script lang="ts">
	import { onMount } from 'svelte';
	import type { ResolvedPathname } from '$app/types';
	import PaperMargin from '$lib/components/paper-margin/PaperMargin.svelte';
	import PaperPhoneBar from '$lib/components/paper-margin/PaperPhoneBar.svelte';
	import {
		paperTextLabel,
		type AuthorWords,
		type PaperKind,
		type PaperPerson,
		type PaperWords
	} from '$lib/committee-papers';
	import type { PaperThread } from '$lib/paper-comments';
	import type { NewCommentWriter } from '$lib/paper-margin';
	import { createPaperMargin } from '$lib/paper-margin-state.svelte';
	import type { PaperSupport } from '$lib/paper-support';
	import { createPaperChecks } from '$lib/resolution-checks-state.svelte';
	import type { ResolutionHeading } from '$lib/resolution-heading';
	import type { DaisAmendmentRow } from '$lib/amendment-queue';
	import AmendmentsReview from './AmendmentsReview.svelte';
	import ReviewSheet from './ReviewSheet.svelte';
	import ReviewSideColumn from './ReviewSideColumn.svelte';

	type Props = {
		conferenceSlug: string;
		committeeSlug: string;
		paper: { id: string; kind: PaperKind };
		people: PaperPerson[];
		words: AuthorWords;
		paperWords: PaperWords;
		support: PaperSupport | null;
		heading: ResolutionHeading | null;
		/** The submitted text: its Yjs document in base64 or `null`, its Markdown and its HTML. */
		text: { documentState: string | null; body: string; bodyHtml: string };
		/** The dais's notes, and what the margin needs to show them. */
		notes: {
			threads: PaperThread[];
			writer: NewCommentWriter;
			isOpen: boolean;
			paperUrl: ResolvedPathname;
			timeZone: string;
			editingCommentId: string | null;
			userId: string;
		};
		/** The page's title's id, which names the text for a screen reader. */
		headingId: string;
		/** An introduced draft's amendments, in the order the dais takes them; `null` before then. */
		amendments: DaisAmendmentRow[] | null;
	};

	let {
		conferenceSlug,
		committeeSlug,
		paper,
		people,
		words,
		paperWords,
		support,
		heading,
		text,
		notes,
		headingId,
		amendments
	}: Props = $props();

	/*
		The notes beside the text and its format checks follow the editor the
		sheet starts. Both are made once, as the page opens: the threads are
		read again through the function whenever `load` runs again, and the
		paper's kind and text never change while it is open.
	*/
	// svelte-ignore state_referenced_locally
	const margin = createPaperMargin({ threads: () => notes.threads, userId: notes.userId });
	// svelte-ignore state_referenced_locally
	const checks = createPaperChecks({
		kind: paper.kind,
		isOn: support?.rules.checksFormat ?? false,
		initialMarkdown: text.body
	});

	// True once the page's script runs; without it the margin's own form starts a note.
	let isScriptRunning = $state(false);
	onMount(() => (isScriptRunning = true));

	const openCount = $derived(notes.threads.filter((thread) => !thread.isResolved).length);
</script>

<!--
	The paper's support and people beside the text from `md` up, and under it
	on a phone, where `order-last` moves them after it. From `lg` up the notes
	have a third column beside the text; below it they follow the text.
-->
<div
	class="mt-6 grid grid-cols-1 md:grid-cols-[13.5rem_minmax(0,1fr)] md:gap-x-8 lg:grid-cols-[13.5rem_minmax(0,1fr)_19.25rem]"
>
	<div class="order-last mt-10 md:order-first md:mt-0">
		<ReviewSideColumn
			{conferenceSlug}
			{committeeSlug}
			paperId={paper.id}
			{people}
			{words}
			{paperWords}
			{support}
			checks={support?.rules.checksFormat ? checks : null}
		/>
	</div>
	<div class="min-w-0">
		<ReviewSheet
			documentState={text.documentState}
			body={text.body}
			bodyHtml={text.bodyHtml}
			label={paperTextLabel(paper.kind)}
			labelledBy={headingId}
			{heading}
			{margin}
			{checks}
		/>
	</div>
	<div class="min-w-0 md:col-start-2 lg:col-start-3 lg:row-start-1">
		{#if amendments}
			<AmendmentsReview rows={amendments} paperId={paper.id} {conferenceSlug} {committeeSlug} />
		{/if}
		<PaperMargin
			{margin}
			paperUrl={notes.paperUrl}
			{people}
			userId={notes.userId}
			timeZone={notes.timeZone}
			editingCommentId={notes.editingCommentId}
			{isScriptRunning}
			notes={{
				title: 'Notes for the authors',
				count: openCount,
				writer: notes.writer,
				isOpen: notes.isOpen
			}}
		/>
	</div>
</div>

{#if isScriptRunning && notes.isOpen}
	<PaperPhoneBar {margin} />
{/if}

<script lang="ts">
	import { onMount } from 'svelte';
	import type { ResolvedPathname } from '$app/types';
	import CommitteePaperSheet from '$lib/components/paper-writing/CommitteePaperSheet.svelte';
	import {
		NO_PAPER_ACTIONS,
		paperMetaLine,
		paperTextLabel,
		type AuthorWords,
		type PaperName,
		type PaperPerson
	} from '$lib/committee-papers';
	import { createPaperMargin } from '$lib/paper-margin-state.svelte';
	import { signingView, type SigningState } from '$lib/paper-signing';
	import { paperStandingWord } from '$lib/crisis-papers';
	import { daisPanel } from '$lib/paper-submitting';
	import { introducedWord } from '$lib/papers-on-floor';
	import PaperReaderAside from './PaperReaderAside.svelte';
	import PaperSideColumn from './PaperSideColumn.svelte';
	import PaperTitleRow from './PaperTitleRow.svelte';
	import type {
		PaperComments,
		PaperFloor,
		PaperProgress,
		PaperResolution
	} from './paper-resolution';

	type Props = {
		conferenceSlug: string;
		committeeSlug: string;
		paper: PaperName & { id: string; title: string; topic: string | null };
		people: PaperPerson[];
		words: AuthorWords;
		/** The paper's text as HTML, from `renderMarkdown` on the server. */
		bodyHtml: string;
		/** What a draft resolution or a directive adds, or `null` for a working paper. */
		resolution: PaperResolution | null;
		signing: SigningState;
		/** The conference's time zone, which the times are told in. */
		timeZone: string;
		/** The reader's threads, for a seat that may comment: one deciding whether to sign. */
		comments: (PaperComments & { userId: string }) | null;
		progress: PaperProgress;
		/** Where "Withdraw" opens its dialog, for an author of a paper with the dais; else `null`. */
		withdrawHref: ResolvedPathname | null;
		floor: PaperFloor;
	};

	let {
		conferenceSlug,
		committeeSlug,
		paper,
		people,
		words,
		bodyHtml,
		resolution,
		signing,
		timeZone,
		comments,
		progress,
		withdrawHref,
		floor
	}: Props = $props();

	// The margin without an editor: the reader comments on the whole paper, or answers a thread,
	// but has no text to select. Whether they may comment never changes, so it is read once.
	// svelte-ignore state_referenced_locally
	const margin =
		comments && createPaperMargin({ threads: () => comments.threads, userId: comments.userId });

	// True once the page's script runs; without it the margin's own form starts a comment.
	let isScriptRunning = $state(false);
	onMount(() => (isScriptRunning = true));

	// What the page says about signing, for a draft resolution or a directive alone.
	const signingShown = $derived(resolution && signingView(signing, timeZone));
	const progressWord = $derived(
		paperStandingWord({ ...paper, ...progress }, progress.decision, progress.answer, timeZone)
	);
	// An introduced paper keeps its topic and adds when it was introduced at the end.
	const introduced = $derived(introducedWord(floor.introducedAt, timeZone));
	const metaLine = $derived(
		paperMetaLine(paper, introduced, progressWord ?? signingShown?.stateWord)
	);
	// Beside the text: the crisis staff's answer, or what the dais does next (for its authors alone).
	const panel = $derived(
		withdrawHref &&
			daisPanel({ ...paper, ...progress }, progress.decision, progress.chair, timeZone)
	);
</script>

<!--
	The paper for somebody who may read it but not write it, laid out like its
	writer without the editing: the title, who wrote it, and the text as it
	stands. A seat deciding whether to sign it signs from the title row, and
	asks the authors in the margin.
-->
<PaperTitleRow
	title={paper.title}
	headingId="paper-title"
	{metaLine}
	signing={signingShown?.button}
	{withdrawHref}
	recordHref={progress.recordHref}
	screen={floor.mayShowOnScreen ? { isOnScreen: floor.isOnScreen, step: floor.screenStep } : null}
	onComment={margin && isScriptRunning ? () => margin.startComment() : undefined}
/>

<div
	class="mt-4 grid grid-cols-1 sm:mt-6 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-x-8 lg:grid-cols-[13rem_minmax(0,1fr)_18.5rem]"
>
	<div class="order-last mt-10 md:order-first md:mt-0">
		<PaperSideColumn
			{conferenceSlug}
			{committeeSlug}
			paperId={paper.id}
			{people}
			{words}
			actions={NO_PAPER_ACTIONS}
			resolution={resolution && {
				...resolution,
				isOpenForSignatures: signing.isOpen,
				closeNote: null,
				isReturned: false,
				openSourceId: resolution.openSource?.id ?? null
			}}
			checks={null}
			isAuthor={false}
		/>
	</div>
	<div class="min-w-0">
		<CommitteePaperSheet
			html={bodyHtml}
			label={paperTextLabel(paper.kind)}
			heading={resolution?.heading}
		/>
	</div>
	<PaperReaderAside
		crisisPanel={progress.crisisPanel}
		{panel}
		{margin}
		{comments}
		{people}
		{isScriptRunning}
		closedThreads={floor.closedThreads}
	/>
</div>

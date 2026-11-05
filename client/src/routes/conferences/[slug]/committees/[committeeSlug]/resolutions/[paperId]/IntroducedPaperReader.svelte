<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import type { AmendmentCard } from '$lib/amendment-cards';
	import CommitteePaperSheet from '$lib/components/paper-writing/CommitteePaperSheet.svelte';
	import {
		NO_PAPER_ACTIONS,
		paperKindAndNumber,
		paperTextLabel,
		type AuthorWords,
		type PaperName,
		type PaperPerson
	} from '$lib/committee-papers';
	import type { ClauseContent } from '$lib/paper-clauses';
	import { introducedWord } from '$lib/papers-on-floor';
	import AmendmentsMargin from './AmendmentsMargin.svelte';
	import ClosedThreads from './ClosedThreads.svelte';
	import PaperSideColumn from './PaperSideColumn.svelte';
	import PaperTitleRow from './PaperTitleRow.svelte';
	import type { PaperFloor, PaperResolution } from './paper-resolution';

	type Props = {
		conferenceSlug: string;
		committeeSlug: string;
		paper: PaperName & { id: string; title: string };
		people: PaperPerson[];
		words: AuthorWords;
		resolution: PaperResolution;
		/** The conference's time zone, which the times are told in. */
		timeZone: string;
		floor: PaperFloor;
		/** The text as it stands, from `readIntroducedDraft` on the server. */
		introduced: {
			bodyHtml: string;
			content: ClauseContent;
			cards: AmendmentCard[];
			waitingForMe: number[];
		};
		/** Where "Propose an amendment" goes, or `null` for a reader who may not propose one. */
		proposeHref: ResolvedPathname | null;
	};

	let {
		conferenceSlug,
		committeeSlug,
		paper,
		people,
		words,
		resolution,
		timeZone,
		floor,
		introduced,
		proposeHref
	}: Props = $props();

	// The committee calls it by its number now, so that is the title, and its own title the first fact.
	const metaLine = $derived(
		[paper.title, introducedWord(floor.introducedAt, timeZone)].filter(Boolean).join(' · ')
	);
</script>

<!--
	A draft resolution once it is introduced (step 7): its text as it stands,
	with any amendment written in, and the amendments beside their clauses.
	A delegate proposes one from the title row; the debate is on the floor
	now, so the comments are closed and kept to read under the amendments.
-->
<PaperTitleRow
	title={paperKindAndNumber(paper)}
	headingId="paper-title"
	{metaLine}
	{proposeHref}
	screen={floor.mayShowOnScreen ? { isOnScreen: floor.isOnScreen, step: floor.screenStep } : null}
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
			resolution={{
				...resolution,
				isOpenForSignatures: false,
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
			html={introduced.bodyHtml}
			label={paperTextLabel(paper.kind)}
			heading={resolution.heading}
		/>
	</div>
	<div
		class="mt-10 flex min-w-0 flex-col gap-10 md:col-start-2 lg:col-start-3 lg:row-start-1 lg:mt-0"
	>
		<AmendmentsMargin
			cards={introduced.cards}
			content={introduced.content}
			waitingForMe={introduced.waitingForMe}
			{conferenceSlug}
			{committeeSlug}
			paperId={paper.id}
		/>
		{#if floor.closedThreads}
			<ClosedThreads threads={floor.closedThreads} />
		{/if}
	</div>
</div>

<script lang="ts">
	import TallyBar from '$lib/components/room/vote/TallyBar.svelte';
	import {
		amendmentVoteLine,
		amendmentVoteTitle,
		votedLine,
		type AmendmentOnScreen
	} from '$lib/amendment-on-screen';
	import type { VoteCounts } from '$lib/committee-room';
	import type { OpenVote } from '$lib/votes';
	import DisplayAmendmentClause from './DisplayAmendmentClause.svelte';

	type Props = {
		/** The vote the room is on, tied to the amendment: open, or closed until the chair ends voting. */
		vote: OpenVote;
		/** The amendment it decides, read on the server (`readAmendmentVoteForScreen`). */
		amendment: AmendmentOnScreen;
		/** The counts as the projector shows them (`watchedVoteCounts` in `$lib/watched-vote.ts`). */
		counts: VoteCounts;
		/** Who answered the roll call as present, or null before it was taken. */
		presentCount: number | null;
	};

	let { vote, amendment, counts, presentCount }: Props = $props();

	// `$derived` works these out again whenever realtime reads the page's data again.
	const isClosed = $derived(vote.status === 'closed');
	const line = $derived(amendmentVoteLine(isClosed, amendment));
	const title = $derived(amendmentVoteTitle({ isClosed, passed: vote.passed }, amendment));
	const voted = $derived(isClosed ? null : votedLine(counts, presentCount));
	const countRows = $derived([
		{ word: 'For', count: counts.for },
		{ word: 'Against', count: counts.against },
		{ word: 'Abstaining', count: counts.abstain }
	]);
</script>

<!--
	A vote on an amendment, on the projector, as drawn: a grey line naming the
	amendment and its draft, what it does in large serif ("Strike clause 2",
	then "Amendment 2 passes"), who proposed it, the clause it changes, the
	three counts and the bar with the mark where it passes, and how many of
	those present have voted. The title takes the serif's large-size cut, as
	a paper's does (`DisplayPaper.svelte`).
-->
<p class="mt-[3vw] text-[2.2vw]/[1.2] font-medium text-muted-foreground">{line}</p>

<div class="flex min-h-0 flex-1 flex-col justify-center gap-[1.8vw]">
	<div>
		<h1
			class="font-display text-[5vw]/[1.1] font-semibold text-balance [font-variation-settings:normal]"
		>
			{title}
		</h1>
		<p class="mt-[0.8vw] text-[1.5vw]/[1.3] text-muted-foreground">{amendment.proposedLine}</p>
	</div>
	<DisplayAmendmentClause page={amendment.page} />
	<dl class="mt-[0.6vw] flex gap-[6vw] tabular-nums">
		<!-- The three rows are always the same three, so each is keyed by its word. -->
		{#each countRows as row (row.word)}
			<div class="flex flex-col-reverse text-[1.8vw]/[1.2] text-muted-foreground">
				<dt>{row.word}</dt>
				<dd class="text-[6.5vw]/none font-semibold text-foreground">{row.count}</dd>
			</div>
		{/each}
	</dl>
	<div>
		<TallyBar {counts} majority={vote.majority} showsMark={!isClosed} size="display" />
		{#if voted}
			<p class="mt-[1.2vw] text-[1.5vw]/[1.3] text-muted-foreground tabular-nums">{voted}</p>
		{/if}
	</div>
</div>

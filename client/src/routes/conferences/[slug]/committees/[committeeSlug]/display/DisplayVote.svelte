<script lang="ts">
	import TallyBar from '$lib/components/room/vote/TallyBar.svelte';
	import type { VoteCounts } from '$lib/committee-room';
	import { displayVoteLine, watchedVoteTitle } from '$lib/watched-vote';
	import type { OpenVote } from '$lib/votes';

	type Props = {
		/** The vote the room is on: open, or closed and on show until the chair ends voting. */
		vote: OpenVote;
		/** The counts as the projector shows them (`watchedVoteCounts` in `$lib/watched-vote.ts`). */
		counts: VoteCounts;
	};

	let { vote, counts }: Props = $props();

	// `$derived` works these out again whenever the page's data is read again,
	// which realtime does each time the chair counts or closes the vote.
	const modeLine = $derived(displayVoteLine(vote));
	const title = $derived(watchedVoteTitle(vote));
	// A result is larger than the subject of an open vote.
	const titleSizeClasses = $derived(
		vote.status === 'closed' ? 'text-[7vw]/[1.1]' : 'text-[6vw]/[1.05]'
	);
	const countRows = $derived([
		{ word: 'for', count: counts.for },
		{ word: 'against', count: counts.against },
		{ word: 'abstaining', count: counts.abstain }
	]);
</script>

<!--
	A vote on the projector: how it is counted and the majority, the subject
	(or, once closed, "Draft Resolution 1.1 passes", larger), the three counts
	and the bar filling as the chair counts. Abstentions are counted but take
	no part of the bar. The chair's "passes at" mark is left out.
-->
<h1 class="mt-[3vw] text-[2.2vw]/[1.2] font-medium text-ink-600">{modeLine}</h1>

<div class="flex min-h-0 flex-1 flex-col justify-center gap-[1.6vw]">
	<p class="font-display font-semibold text-balance {titleSizeClasses}">{title}</p>
	<dl class="flex gap-[6vw] tabular-nums">
		<!-- The three rows are always the same three, so each is keyed by its word. -->
		{#each countRows as row (row.word)}
			<div class="flex flex-col-reverse text-[2vw]/[1.2] text-ink-600">
				<dt>{row.word}</dt>
				<dd class="text-[9vw]/none font-semibold text-ink-900">{row.count}</dd>
			</div>
		{/each}
	</dl>
	<TallyBar {counts} majority={vote.majority} showsMark={false} size="display" />
</div>

<script lang="ts">
	import TallyBar from '$lib/components/room/vote/TallyBar.svelte';
	import type { VoteCounts } from '$lib/committee-room';
	import type { OpenVote } from '$lib/votes';
	import { phoneVoteLine, showsWatchedCounts, watchedVoteTitle } from '$lib/watched-vote';
	import LivePanel from './LivePanel.svelte';
	import LiveYouNote from './LiveYouNote.svelte';

	type Props = {
		/** The vote the room is on: open, or closed and on show until the chair ends voting. */
		vote: OpenVote;
		/** The counts as watchers see them (`watchedVoteCounts` in `$lib/watched-vote.ts`). */
		counts: VoteCounts;
		/** "You voted yes" or "Your seat has not been called yet", or null (`readerAnswerText`). */
		answerText: string | null;
	};

	let { vote, counts, answerText }: Props = $props();

	// `$derived` works these out again whenever the page's data is read again,
	// which realtime does each time the chair records an answer or closes the vote.
	const title = $derived(watchedVoteTitle(vote));
	const line = $derived(phoneVoteLine(vote));
	const countRows = $derived([
		{ word: 'for', count: counts.for },
		{ word: 'against', count: counts.against },
		{ word: 'abstaining', count: counts.abstain }
	]);
</script>

<!--
	The vote on a phone: the subject (or the result once closed), how it is
	counted, the reader's own roll call answer, then the counts and the bar.
	A show of hands has no counts until it closes: the chair counts in the room.
-->
<LivePanel {title}>
	{#if line}
		<p class="text-small text-ink-600">{line}</p>
	{/if}
	{#if answerText}
		<LiveYouNote text={answerText} />
	{/if}
	{#if showsWatchedCounts(vote)}
		<dl class="grid grid-cols-3 gap-2 text-center tabular-nums">
			<!-- The three rows are always the same three, so each is keyed by its word. -->
			{#each countRows as row (row.word)}
				<div class="flex flex-col-reverse">
					<dt class="text-small text-ink-600">{row.word}</dt>
					<dd class="text-[28px]/9 font-semibold">{row.count}</dd>
				</div>
			{/each}
		</dl>
		<TallyBar {counts} majority={vote.majority} showsMark={false} />
	{/if}
</LivePanel>

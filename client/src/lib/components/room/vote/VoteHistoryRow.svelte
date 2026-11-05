<script lang="ts">
	import { closedVoteWord, voteHistoryLine } from '$lib/vote-view';
	import type { SessionVote } from '$lib/votes';

	type Props = {
		/** A closed vote, with its counts and result. */
		vote: SessionVote;
		/** The conference's time zone, which the closing time is shown in. */
		timeZone: string;
	};

	let { vote, timeZone }: Props = $props();
</script>

<!--
	One closed vote: "Passed" in green or "Failed" in red, then the subject,
	and under it the tally, the majority and the time it closed.
-->
<li
	class="grid grid-cols-[64px_minmax(0,1fr)] gap-x-3 border-b border-line py-2 text-small tabular-nums last:border-b-0"
>
	<span class="font-medium {vote.passed ? 'text-success-700' : 'text-danger-700'}">
		{closedVoteWord(vote)}
	</span>
	<span class="break-words">{vote.subject}</span>
	<span class="col-start-2 text-ink-600">{voteHistoryLine(vote, timeZone)}</span>
</li>

<script lang="ts">
	import type { SessionVote } from '$lib/votes';
	import VoteHistoryRow from './VoteHistoryRow.svelte';

	type Props = {
		/** The session's closed votes, newest first. */
		votes: SessionVote[];
		/** The conference's time zone, which each closing time is shown in. */
		timeZone: string;
	};

	let { votes, timeZone }: Props = $props();
</script>

<!--
	"Votes this session" under the set-up, drawn like Motions' "Decided this
	session": the result in a word, never a badge. Left out while there is none.
-->
<section aria-labelledby="vote-history-heading" class="border-t border-line pt-5">
	<h2 id="vote-history-heading" class="mb-1 text-h3">Votes this session</h2>
	<ul>
		<!-- The `(vote.id)` key lets Svelte reuse each row instead of rebuilding it. -->
		{#each votes as vote (vote.id)}
			<VoteHistoryRow {vote} {timeZone} />
		{/each}
	</ul>
</section>

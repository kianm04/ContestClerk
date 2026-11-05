<script lang="ts">
	import type { RollCallCounts } from '$lib/roll-calls';

	type Props = {
		/** How many seats gave each answer, with the presses on their way counted in. */
		counts: RollCallCounts;
		/** "Quorum 3 · met · majority 4" or "Quorum 3 · 2 more needed" (`quorumLineText`). */
		quorumLine: string;
	};

	let { counts, quorumLine }: Props = $props();
</script>

<!--
	"4 present and voting · 1 present · 1 absent · Quorum 3 · met · majority 4".
	The numbers are in figures of one width, so the line does not shift as
	they change. Both halves stay in plain grey whether or not quorum is met:
	in the middle of a roll call a missing quorum is progress, not a problem
	(P4). The top bar's chip is where it shows as a warning, once debate starts.
-->
<p class="mt-1 text-ink-600 tabular-nums">
	<strong class="font-medium text-ink-900">{counts.presentAndVotingCount}</strong> present and
	voting · <strong class="font-medium text-ink-900">{counts.presentCount}</strong> present ·
	<strong class="font-medium text-ink-900">{counts.absentCount}</strong> absent ·
	<span>{quorumLine}</span>
</p>

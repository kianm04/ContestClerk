<script lang="ts">
	import type { VoteCounts } from '$lib/committee-room';

	type Props = {
		/** The hands as counted. */
		counts: VoteCounts;
	};

	let { counts }: Props = $props();
</script>

<!-- The counts in words under the tally bar, the numbers in the text's darkest ink. -->
<p class="mt-2.5 flex flex-wrap gap-x-6 text-ink-600 tabular-nums">
	<span><strong class="font-semibold text-ink-900">{counts.for}</strong> for</span>
	<span><strong class="font-semibold text-ink-900">{counts.against}</strong> against</span>
	<span><strong class="font-semibold text-ink-900">{counts.abstain}</strong> abstaining</span>
</p>

<script lang="ts">
	import type { PaperThread } from '$lib/paper-comments';
	import ClosedThread from './ClosedThread.svelte';
	import PaperSideHeading from '$lib/components/paper-side/PaperSideHeading.svelte';

	type Props = {
		/** The threads the reader could read before the paper was introduced. */
		threads: PaperThread[];
	};

	let { threads }: Props = $props();
</script>

<!--
	The comments on an introduced paper, in the margin's place. Introducing a
	paper closes its threads (section 6): the debate is on the floor now, so
	they are kept to read, for the same people who could read them before, and
	nobody can add to them.
-->
<section aria-label="Comments">
	<PaperSideHeading title="Comments" />
	<p class="mt-3 text-small text-muted-foreground">Closed when the paper was introduced.</p>
	<ul>
		{#each threads as thread (thread.id)}
			<ClosedThread {thread} />
		{/each}
	</ul>
</section>

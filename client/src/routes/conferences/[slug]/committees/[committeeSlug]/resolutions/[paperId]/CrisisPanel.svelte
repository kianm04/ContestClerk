<script lang="ts">
	import type { CrisisPanel } from '$lib/crisis-papers';
	import PaperSideHeading from '$lib/components/paper-side/PaperSideHeading.svelte';

	type Props = {
		/** From `crisisPanel` in `$lib/crisis-papers.ts`. */
		panel: CrisisPanel;
	};

	let { panel }: Props = $props();
</script>

<!--
	Beside a paper the crisis staff decide, in the margin's place: who has it
	while it waits, then their answer. The answer keeps the lines it was
	written in (`whitespace-pre-line`), as the crisis staff typed it.
-->
<section aria-label={panel.title}>
	<PaperSideHeading title={panel.title} />
	<p class="mt-3 text-body whitespace-pre-line text-foreground">{panel.sentence}</p>
	{#if panel.byline}
		<p class="mt-1 text-small text-muted-foreground tabular-nums">{panel.byline}</p>
	{/if}
</section>

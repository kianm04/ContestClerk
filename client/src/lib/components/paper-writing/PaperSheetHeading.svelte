<script lang="ts">
	import type { PaperHeading } from '$lib/paper-sheet';

	type Props = {
		/** The running header and the bold lines, from `paperHeading` in `$lib/paper-sheet.ts`. */
		heading: PaperHeading;
	};

	let { heading }: Props = $props();
</script>

<!--
	The top of every position paper, drawn from the seat, the committee and the
	conference rather than typed, so each paper opens the same way
	(Trello S6HLyL5Y). The editor, the submitted paper and the chair's reading
	page all show it above the text.
-->
<div class="flex flex-col gap-4 font-display text-foreground">
	<p
		class="flex justify-between gap-4 border-b border-border pb-2 text-small text-muted-foreground"
	>
		<span>{heading.seatName}</span>
		<span class="text-right">{heading.conferenceName}</span>
	</p>
	<div class="flex flex-col gap-1 text-body">
		<!-- The lines have no id of their own, and no two share a label, so the label is the key. -->
		{#each heading.lines as line (line.label)}
			<p><strong>{line.label}:</strong> {line.value}</p>
		{/each}
	</div>
</div>

<script lang="ts">
	import type { ResolutionHeading } from '$lib/resolution-heading';

	type Props = {
		/** The lines and the opening line, from `resolutionHeading` in `$lib/resolution-heading.ts`. */
		heading: ResolutionHeading;
	};

	let { heading }: Props = $props();
</script>

<!--
	The top of a draft resolution or a directive, drawn from the data rather
	than typed (docs/committee-papers.md, section 4): the committee, the topic,
	the sponsors and the signatories in two columns, a hairline, and the line
	the clauses hang from, "The General Assembly,". A `<dl>` is HTML's list of
	names and what they are, which is what the lines are.
-->
<div class="flex flex-col gap-5 text-foreground">
	<dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-1.5 text-small">
		<!-- No two lines share a label, so the label is the key. -->
		{#each heading.lines as line (line.label)}
			<dt class="text-muted-foreground">{line.label}</dt>
			<dd>{line.value}</dd>
		{/each}
	</dl>
	<hr class="border-border" />
	<p class="font-display text-body">{heading.opening}</p>
</div>

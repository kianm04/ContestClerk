<script lang="ts">
	import type { ScreenPage } from '$lib/paper-on-screen';
	import DisplaySubClauses from './DisplaySubClauses.svelte';

	type Props = {
		/** One operative clause: its number, its words as HTML, and its sub-clauses. */
		clause: Extract<ScreenPage, { shows: 'clause' }>;
	};

	let { clause }: Props = $props();
</script>

<!--
	One operative clause, as drawn: its number large in the serif in a narrow
	column on the left, its words beside it with the opening phrase
	underlined, and its sub-clauses lettered (a), (b) and (i), (ii) under them,
	so a speaker can say "clause 1(b)(ii)" and the room finds it. The number
	takes the serif's large-size cut, as the title does (`DisplayPaper.svelte`).

	`{@html}` draws a string as HTML instead of as text. It is only safe for HTML
	nobody can slip a script into, which is why it only ever draws what
	`renderMarkdown` made on the server.
-->
<div
	class="grid max-w-[76vw] grid-cols-[5vw_minmax(0,1fr)] items-baseline [&_p]:m-0 [&_u]:decoration-1 [&_u]:underline-offset-[0.19vw]"
>
	<span
		class="font-display text-[3.4vw]/none font-semibold tabular-nums [font-variation-settings:normal]"
		>{clause.number}</span
	>
	<div>
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- made safe on the server, as said above -->
		{@html clause.html}
		<DisplaySubClauses subClauses={clause.subClauses} level={2} />
	</div>
</div>

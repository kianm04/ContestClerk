<script lang="ts">
	import type { ScreenPage } from '$lib/paper-on-screen';

	type Props = {
		/** The line the clauses hang from, and each preambulatory clause as HTML. */
		preamble: Extract<ScreenPage, { shows: 'preamble' }>;
	};

	let { preamble }: Props = $props();
</script>

<!--
	A draft resolution's preambulatory clauses, together, before clause 1, as
	the chair reads them out: "The General Assembly," and then each clause on
	its own line with its opening phrase in italics. They sit in the same
	column as an operative clause's words, so the text does not jump when the
	dais moves on to clause 1; the number column stays empty.

	`{@html}` draws a string as HTML instead of as text, which is only safe for
	what `renderMarkdown` made on the server. `{#each … (index)}` keys each
	clause by its place, as two clauses may share their words.
-->
<div class="grid max-w-[76vw] grid-cols-[5vw_minmax(0,1fr)] [&_p]:m-0">
	<div class="col-start-2">
		<p class="mb-[0.8vw]">{preamble.opening}</p>
		{#each preamble.clauses as clause, index (index)}
			<div class="mb-[0.6vw]">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- made safe on the server, as said above -->
				{@html clause}
			</div>
		{/each}
	</div>
</div>

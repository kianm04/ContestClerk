<script lang="ts">
	import type { RecordedAmendment } from '$lib/amendment-record';
	import { COMMITTEE_PAPER_TEXT_CLASSES, type PaperHeadingLine } from '$lib/paper-sheet';
	import AmendmentRecordTable from './AmendmentRecordTable.svelte';

	type Props = {
		/** The paper's title, under its name: "Human control over autonomous weapons". */
		title: string;
		/** "Adopted on 16 March 2027 by 31 votes to 6, with 7 abstentions." (`adoptedSentence`) */
		adopted: string;
		/** Conference, committee, topic, sponsors and signatories (`recordFacts`). */
		facts: PaperHeadingLine[];
		/** The line the clauses hang from: "The General Assembly,". */
		opening: string;
		/** The text as adopted, as HTML made safe on the server, its opening phrases marked. */
		bodyHtml: string;
		/** The amendments the committee decided, by number; none leaves the table off. */
		amendments: RecordedAmendment[];
		/** "Record copy, printed from MUNMeet on 16 March 2027." */
		printed: string;
	};

	let { title, adopted, facts, opening, bodyHtml, amendments, printed }: Props = $props();
</script>

<!--
	Everything on the record copy under its name, as drawn: the title, how it
	was adopted, the facts between a black rule and a grey one, the text, the
	amendments, and the line saying where the copy came from.

	`{@html}` draws a string as HTML instead of as text. It is only safe for
	HTML nobody can slip a script into, which is why it only ever draws what
	the server made from the text with `renderMarkdown`. `resolution-text`, from the global
	stylesheet, letters the sub-clauses (a), (b) and (i).
-->
<p class="mt-1 font-display text-[1.25rem]/7 font-medium">{title}</p>
<p class="mt-3 text-small">{adopted}</p>

<dl
	class="mt-7 grid grid-cols-[7rem_minmax(0,1fr)] gap-x-4 gap-y-1 border-y border-t-foreground border-b-border py-4 text-small"
>
	<!-- The `(fact.label)` key lets Svelte tell the lines apart; no two share a label. -->
	{#each facts as fact (fact.label)}
		<dt class="font-medium text-muted-foreground">{fact.label}</dt>
		<dd>{fact.value}</dd>
	{/each}
</dl>

<div class="resolution-text mt-7 max-w-[36rem]">
	<p class="mb-4">{opening}</p>
	<div class={COMMITTEE_PAPER_TEXT_CLASSES}>
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- made safe on the server, as said above -->
		{@html bodyHtml}
	</div>
</div>

{#if amendments.length > 0}
	<AmendmentRecordTable {amendments} />
{/if}

<p class="mt-8 text-small text-muted-foreground">{printed}</p>

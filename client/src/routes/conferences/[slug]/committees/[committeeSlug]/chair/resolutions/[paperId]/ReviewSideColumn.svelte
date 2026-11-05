<script lang="ts">
	import FormatChecksPanel from '$lib/components/paper-side/FormatChecksPanel.svelte';
	import PaperPeople from '$lib/components/paper-side/PaperPeople.svelte';
	import SignatoriesPanel from '$lib/components/paper-side/SignatoriesPanel.svelte';
	import SupportPanel from '$lib/components/paper-side/SupportPanel.svelte';
	import {
		NO_PAPER_ACTIONS,
		type AuthorWords,
		type PaperPerson,
		type PaperWords
	} from '$lib/committee-papers';
	import type { PaperSupport } from '$lib/paper-support';
	import type { ResolutionChecks } from '$lib/resolution-checks-state.svelte';

	type Props = {
		conferenceSlug: string;
		committeeSlug: string;
		paperId: string;
		people: PaperPerson[];
		words: AuthorWords;
		paperWords: PaperWords;
		/** A draft resolution's or a directive's support, or `null` for a working paper. */
		support: PaperSupport | null;
		/** The format checks, for a committee that checks the format. */
		checks: ResolutionChecks | null;
	};

	let {
		conferenceSlug,
		committeeSlug,
		paperId,
		people,
		words,
		paperWords,
		support,
		checks
	}: Props = $props();

	const authorCount = $derived(people.filter((person) => person.role === 'author').length);
</script>

<!--
	Everything beside the paper's text, in the order the dais needs it: whether
	the paper has the support the rules ask for, whether its clauses are set
	out as they should be, and then who sponsors and who signed it.
-->
<div class="flex flex-col gap-10">
	{#if support}
		<SupportPanel {support} words={paperWords} enoughText="Enough support" />
	{/if}
	{#if checks}
		<FormatChecksPanel
			warnings={checks.warnings}
			onFocus={(clauseName) => checks.focus(clauseName)}
			note={null}
		/>
	{/if}
	<PaperPeople
		{conferenceSlug}
		{committeeSlug}
		{paperId}
		{people}
		{words}
		actions={NO_PAPER_ACTIONS}
		count={String(authorCount)}
	/>
	{#if support}
		<SignatoriesPanel {people} {words} isOpen={false} />
	{/if}
</div>

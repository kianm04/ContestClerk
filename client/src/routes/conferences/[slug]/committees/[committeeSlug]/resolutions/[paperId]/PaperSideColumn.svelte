<script lang="ts">
	import BasedOnList from '$lib/components/committee-papers/BasedOnList.svelte';
	import type {
		AuthorWords,
		PaperPeopleActions,
		PaperPerson,
		PaperSource,
		PaperWords
	} from '$lib/committee-papers';
	import { RETURNED_SIGNATORIES_NOTE } from '$lib/paper-submitting';
	import { sponsorCapSentence, type PaperSupport } from '$lib/paper-support';
	import type { ResolutionChecks } from '$lib/resolution-checks-state.svelte';
	import { committeePaperSourceUrl } from '$lib/urls';
	import FormatChecksPanel from '$lib/components/paper-side/FormatChecksPanel.svelte';
	import PaperPeople from '$lib/components/paper-side/PaperPeople.svelte';
	import SignatoriesPanel from '$lib/components/paper-side/SignatoriesPanel.svelte';
	import SupportPanel from '$lib/components/paper-side/SupportPanel.svelte';

	type Props = {
		conferenceSlug: string;
		committeeSlug: string;
		paperId: string;
		people: PaperPerson[];
		words: AuthorWords;
		actions: PaperPeopleActions;
		/** What a draft resolution or a directive adds, or `null` for a working paper. */
		resolution: {
			support: PaperSupport;
			paperWords: PaperWords;
			isOpenForSignatures: boolean;
			/** "Open for signatures since 17:05.", over "Close signatures", for an author. */
			closeNote: string | null;
			/** True once the dais returned the paper, whose signatories may take theirs off. */
			isReturned: boolean;
			sources: PaperSource[];
			openSourceId: string | null;
		} | null;
		/** The format checks, for the authors of a committee that checks the format. */
		checks: ResolutionChecks | null;
		/** True for the paper's authors, who read the support first; a signatory reads the sponsors first. */
		isAuthor: boolean;
	};

	let {
		conferenceSlug,
		committeeSlug,
		paperId,
		people,
		words,
		actions,
		resolution,
		checks,
		isAuthor
	}: Props = $props();

	const support = $derived(resolution?.support ?? null);
	const sponsorLimit = $derived(support?.rules.sponsorLimit ?? null);
</script>

<!--
	Everything beside the paper's text, in the order its reader needs it: an
	author first sees whether the paper has the support to be submitted, then
	who signed and who writes it; a seat deciding whether to sign first sees
	who wrote it. A working paper has its authors alone.
-->
<div class="flex flex-col gap-10">
	{#if resolution && support && isAuthor}
		<SupportPanel {support} words={resolution.paperWords} />
		<SignatoriesPanel
			{people}
			{words}
			isOpen={resolution.isOpenForSignatures}
			closeNote={resolution.closeNote}
			note={resolution.isReturned ? RETURNED_SIGNATORIES_NOTE : null}
		/>
	{/if}
	<PaperPeople
		{conferenceSlug}
		{committeeSlug}
		{paperId}
		{people}
		{words}
		{actions}
		count={support && sponsorLimit !== null ? `${support.sponsors} of ${sponsorLimit}` : null}
		capSentence={support && isAuthor ? sponsorCapSentence(support) : null}
	/>
	{#if resolution && support && !isAuthor}
		<SignatoriesPanel {people} {words} isOpen={resolution.isOpenForSignatures} />
		<SupportPanel {support} words={resolution.paperWords} />
	{/if}
	{#if checks && isAuthor}
		<FormatChecksPanel
			warnings={checks.warnings}
			onFocus={(clauseName) => checks.focus(clauseName)}
		/>
	{/if}
	{#if resolution && resolution.sources.length > 0}
		<BasedOnList
			sources={resolution.sources}
			selectedId={resolution.openSourceId}
			hrefFor={(sourceId) =>
				committeePaperSourceUrl(conferenceSlug, committeeSlug, paperId, sourceId)}
		/>
	{/if}
</div>

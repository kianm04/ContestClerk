<script lang="ts">
	import DataTable, { type TableColumn } from '$lib/components/DataTable.svelte';
	import type { PaperListItem } from '$lib/committee-papers';
	import { committeePaperUrl } from '$lib/urls';
	import PaperListRow from './PaperListRow.svelte';
	import PaperTableRow from './PaperTableRow.svelte';

	type Props = {
		/** Such as "Yours" or "Introduced". */
		heading: string;
		papers: PaperListItem[];
		/** The one sentence shown while the section is empty, such as "No paper has been introduced." */
		emptySentence: string;
		/**
		 * True for *Yours*, whose papers can each be at a different stage. In the
		 * other sections every paper is where the heading says, so a status
		 * column would only repeat it.
		 */
		showsStatus?: boolean;
		conferenceSlug: string;
		committeeSlug: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let {
		heading,
		papers,
		emptySentence,
		showsStatus = false,
		conferenceSlug,
		committeeSlug
	}: Props = $props();

	// A committee without topics has papers without them, and no column for them.
	const showsTopic = $derived(papers.some((paper) => paper.topic !== null));

	const columns: TableColumn[] = $derived([
		{ key: 'paper', label: 'Paper' },
		...(showsTopic ? [{ key: 'topic', label: 'Topic', width: 'w-2/5' }] : []),
		...(showsStatus ? [{ key: 'status', label: 'Status', width: 'w-48' }] : [])
	]);
</script>

<!--
	One section of the list: its heading with the black rule under it, then
	its papers, as a table from `md` up and as stacked rows on a phone.
-->
<section aria-label={heading}>
	<h2 class="border-b border-foreground pb-2 font-display text-h2 text-foreground">{heading}</h2>

	{#if papers.length === 0}
		<p class="py-3 text-body text-muted-foreground">{emptySentence}</p>
	{:else}
		<div class="hidden md:block">
			<DataTable {columns} isDense>
				<!-- The `(paper.id)` key lets Svelte move a row instead of rebuilding it. -->
				{#each papers as paper (paper.id)}
					<PaperTableRow
						{paper}
						href={committeePaperUrl(conferenceSlug, committeeSlug, paper.id)}
						{showsTopic}
						{showsStatus}
					/>
				{/each}
			</DataTable>
		</div>

		<ul class="md:hidden">
			{#each papers as paper (paper.id)}
				<li>
					<PaperListRow
						{paper}
						href={committeePaperUrl(conferenceSlug, committeeSlug, paper.id)}
						{showsStatus}
					/>
				</li>
			{/each}
		</ul>
	{/if}
</section>

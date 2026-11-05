<script lang="ts">
	import DataTable, { type TableColumn } from '$lib/components/DataTable.svelte';
	import type { DaisSection } from '$lib/chair-resolutions';
	import { chairResolutionUrl } from '$lib/urls';
	import DaisListRow from './DaisListRow.svelte';
	import DaisTableRow from './DaisTableRow.svelte';

	type Props = {
		section: DaisSection;
		/** The conference's time zone, which says when each paper was submitted. */
		timeZone: string;
		conferenceSlug: string;
		committeeSlug: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { section, timeZone, conferenceSlug, committeeSlug }: Props = $props();

	// A committee without topics has papers without them, and no column for them.
	const showsTopic = $derived(section.papers.some((paper) => paper.topic !== null));
	// Only decided papers differ in where they ended; in the others the heading says it.
	const showsResult = $derived(section.key === 'decided');

	// `$derived` works the columns out again whenever what they read changes.
	const columns: TableColumn[] = $derived([
		{ key: 'paper', label: 'Paper' },
		...(showsTopic ? [{ key: 'topic', label: 'Topic', width: 'w-1/4' }] : []),
		{ key: 'lead', label: 'Lead', width: 'w-40' },
		{ key: 'submitted', label: 'Submitted', width: 'w-40' },
		...(showsResult ? [{ key: 'result', label: 'Result', width: 'w-32' }] : [])
	]);
</script>

<!--
	One section of the list: its heading with the black rule under it, then
	its papers, as a table from `md` up and as stacked rows on a phone.
-->
<section aria-label={section.title}>
	<h2 class="border-b border-foreground pb-2 font-display text-h2 text-foreground">
		{section.title}
	</h2>

	{#if section.papers.length === 0}
		<p class="py-3 text-body text-muted-foreground">{section.emptySentence}</p>
	{:else}
		<div class="hidden md:block">
			<DataTable {columns} isDense>
				<!-- The `(paper.id)` key lets Svelte move a row instead of rebuilding it. -->
				{#each section.papers as paper (paper.id)}
					<DaisTableRow
						{paper}
						href={chairResolutionUrl(conferenceSlug, committeeSlug, paper.id)}
						{timeZone}
						{showsTopic}
						{showsResult}
					/>
				{/each}
			</DataTable>
		</div>

		<ul class="md:hidden">
			{#each section.papers as paper (paper.id)}
				<li>
					<DaisListRow
						{paper}
						href={chairResolutionUrl(conferenceSlug, committeeSlug, paper.id)}
						{timeZone}
					/>
				</li>
			{/each}
		</ul>
	{/if}
</section>

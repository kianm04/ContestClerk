<script lang="ts">
	import DataTable, { type TableColumn } from '$lib/components/DataTable.svelte';
	import type { PaperCommitteeRow } from '$lib/documents-page';
	import { manageDocumentsUrl } from '$lib/urls';

	type Props = {
		/** One row per committee, with its filled seats counted by paper status. */
		committees: PaperCommitteeRow[];
		conferenceSlug: string;
	};

	let { committees, conferenceSlug }: Props = $props();

	/** The table's headings, in the order of the page file's wireframe. */
	const COLUMNS: TableColumn[] = [
		{ key: 'committee', label: 'Committee' },
		{ key: 'seats', label: 'Seats' },
		{ key: 'missing', label: 'Missing' },
		{ key: 'submitted', label: 'Awaiting review' },
		{ key: 'approved', label: 'Approved' },
		{ key: 'changes', label: 'Changes requested' }
	];

	/** Where a committee's row leads: the same tab, with its seats listed below. */
	function committeeHref(committeeId: string) {
		return manageDocumentsUrl(conferenceSlug, { tab: 'papers', committeeId });
	}
</script>

<!--
	`DataTable` draws the headings; the rows are ours. On a phone the table
	scrolls sideways inside its own box, so every count stays in its column.
-->
<DataTable columns={COLUMNS} isDense>
	<!-- The `(committee.committeeId)` key lets Svelte reuse rows instead of rebuilding them. -->
	{#each committees as committee (committee.committeeId)}
		<tr class="border-b border-border">
			<td class="p-3 text-dense font-medium whitespace-nowrap">
				<a href={committeeHref(committee.committeeId)} class="text-link hover:underline">
					{committee.committeeHeading}
				</a>
			</td>
			<td class="p-3 text-dense text-foreground tabular-nums">{committee.filledSeatCount}</td>
			<td class="p-3 text-dense text-foreground tabular-nums">{committee.counts.missing}</td>
			<td class="p-3 text-dense text-foreground tabular-nums">{committee.counts.submitted}</td>
			<td class="p-3 text-dense text-foreground tabular-nums">{committee.counts.approved}</td>
			<td class="p-3 text-dense text-foreground tabular-nums">
				{committee.counts.changes_requested}
			</td>
		</tr>
	{/each}
</DataTable>

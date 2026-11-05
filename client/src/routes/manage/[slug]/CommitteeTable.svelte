<script lang="ts">
	import DataTable, { type TableColumn } from '$lib/components/DataTable.svelte';
	import type { CommitteeRow } from '$lib/dashboard-committees';
	import { chairRoomUrl } from '$lib/urls';

	type Props = {
		committees: CommitteeRow[];
		/** Whether the conference asks for position papers, which adds the Papers column. */
		hasPapers: boolean;
		conferenceSlug: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { committees, hasPapers, conferenceSlug }: Props = $props();

	/** Every heading the table can have. Papers is left out when nobody writes one. */
	const ALL_COLUMNS: TableColumn[] = [
		{ key: 'committee', label: 'Committee' },
		{ key: 'seats', label: 'Seats' },
		{ key: 'papers', label: 'Papers' },
		{ key: 'chair', label: 'Chair' }
	];

	// `$derived` works the headings out again if `hasPapers` changes.
	const columns = $derived(ALL_COLUMNS.filter((column) => hasPapers || column.key !== 'papers'));
</script>

<!--
	While seats are given: each committee's seats, papers and chair. The way into
	its chair room sits under its name rather than in a column of its own, so the
	four columns still fit beside "Before the first day".
-->
<DataTable {columns} isDense>
	<!-- The `(committee.id)` key lets Svelte reuse rows instead of rebuilding them. -->
	{#each committees as committee (committee.id)}
		<tr class="border-b border-border text-dense text-foreground">
			<td class="p-3">
				<p class="font-medium">{committee.name}</p>
				{#if committee.code}
					<p class="text-small text-muted-foreground">{committee.code}</p>
				{/if}
				<a
					href={chairRoomUrl(conferenceSlug, committee.slug)}
					class="text-small font-medium text-link hover:underline">Open chair room</a
				>
			</td>
			<td class="p-3 whitespace-nowrap tabular-nums">{committee.seats}</td>
			{#if hasPapers}
				<td class="p-3 whitespace-nowrap tabular-nums">{committee.papers}</td>
			{/if}
			<td class="p-3">{committee.chair}</td>
		</tr>
	{/each}
</DataTable>

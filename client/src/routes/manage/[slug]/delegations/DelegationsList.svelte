<script lang="ts">
	import DataTable, { type TableColumn } from '$lib/components/DataTable.svelte';
	import type { OrganiserDelegationRow } from '$lib/delegations';
	import DelegationCard from './DelegationCard.svelte';
	import DelegationRow from './DelegationRow.svelte';

	type Props = {
		/** The page of delegations on screen, in the order the table shows them. */
		rows: OrganiserDelegationRow[];
		/** The conference, so every row can link to its own review page. */
		conferenceSlug: string;
		/**
		 * The conference's timezone, so the submitted day is the day it was there.
		 * Only the cards show it: the table's columns have no room for another,
		 * so `DelegationRow` never asks for a timezone at all.
		 */
		timezone: string;
	};

	let { rows, conferenceSlug, timezone }: Props = $props();

	/**
	 * The table's headings, in the order `05-pages/organiser/delegations.md` draws
	 * them. The last column holds each row's "Open" link and needs no heading.
	 */
	const COLUMNS: TableColumn[] = [
		{ key: 'delegation', label: 'Delegation' },
		{ key: 'head', label: 'Head' },
		{ key: 'members', label: 'Members', width: 'w-24' },
		{ key: 'seats', label: 'Seats' },
		{ key: 'invoice', label: 'Invoice' },
		{ key: 'open', label: '', width: 'w-16' }
	];
</script>

<!-- The table from `md` up. `DataTable` draws the headings; the rows are ours. -->
<div class="hidden md:block">
	<DataTable columns={COLUMNS} isDense>
		<!-- The `(row.id)` key lets Svelte reuse rows instead of rebuilding them. -->
		{#each rows as row (row.id)}
			<DelegationRow delegation={row} {conferenceSlug} />
		{/each}
	</DataTable>
</div>

<!--
	The same delegations as a flat list below `md`, which is what a phone shows. Only
	one of the two lists is ever visible, because CSS hides the other. Nothing
	here is a form control, so drawing both costs nothing but the markup.
-->
<ul class="flex flex-col border-t border-border md:hidden">
	{#each rows as row (row.id)}
		<li class="border-b border-border">
			<DelegationCard delegation={row} {conferenceSlug} {timezone} />
		</li>
	{/each}
</ul>

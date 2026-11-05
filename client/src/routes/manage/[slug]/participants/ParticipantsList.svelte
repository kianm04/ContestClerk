<script lang="ts">
	import DataTable, { type TableColumn } from '$lib/components/DataTable.svelte';
	import type { ParticipantListView } from '$lib/participant-access';
	import type { ParticipantListRow } from '$lib/participants';
	import ParticipantCard from './ParticipantCard.svelte';
	import ParticipantRow from './ParticipantRow.svelte';

	type Props = {
		/** One page of participants. */
		rows: ParticipantListRow[];
		view: ParticipantListView;
	};

	let { rows, view }: Props = $props();

	/**
	 * The table's headings, leaving out the columns this reader does not see.
	 * `actions` holds buttons, and is named for a screen reader. "School" is
	 * the institution the delegate gave in their profile.
	 */
	const columns: TableColumn[] = $derived(
		[
			{ key: 'delegate', label: 'Delegate' },
			{ key: 'seat', label: 'Seat' },
			{ key: 'institution', label: 'School' },
			{ key: 'delegation', label: 'Delegation' },
			{ key: 'email', label: 'Email', isShown: view.columns.contact },
			{ key: 'phone', label: 'Phone', isShown: view.columns.contact },
			{ key: 'dateOfBirth', label: 'Date of birth', isShown: view.columns.welfare },
			{ key: 'dietary', label: 'Dietary', isShown: view.columns.welfare },
			{ key: 'emergencyContact', label: 'Emergency contact', isShown: view.columns.welfare },
			{ key: 'invoice', label: 'Invoice', isShown: view.columns.invoice },
			{ key: 'paper', label: 'Paper', isShown: view.columns.paper },
			{ key: 'actions', label: 'Actions', isShown: view.columns.actions }
		]
			.filter((column) => column.isShown !== false)
			.map(({ key, label }) => ({ key, label }))
	);
</script>

<!--
	The table from `md` up. `DataTable` draws the headings; the rows are ours.
	It is wider than a small tablet, so it scrolls sideways in its own box.
-->
<div class="hidden md:block">
	<DataTable {columns} isDense>
		<!-- The `(participant.seatId)` key lets Svelte reuse rows instead of rebuilding them. -->
		{#each rows as participant (participant.seatId)}
			<ParticipantRow {participant} {view} />
		{/each}
	</DataTable>
</div>

<!--
	The same participants below `md`, which is what a phone shows: a flat list,
	each person on their own lines with a thin line under them.
-->
<ul class="md:hidden">
	{#each rows as participant (participant.seatId)}
		<li class="border-b border-border">
			<ParticipantCard {participant} {view} />
		</li>
	{/each}
</ul>

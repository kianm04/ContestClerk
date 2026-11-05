<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import DataTable, { type TableColumn } from '$lib/components/DataTable.svelte';
	import type { TeamCommittee, TeamFilter, TeamPerson } from '$lib/team';
	import { manageTeamEditRolesUrl } from '$lib/urls';
	import StaffCard from './StaffCard.svelte';
	import StaffRow from './StaffRow.svelte';

	type Props = {
		/** The people the filter shows, with any presses still on their way laid on top. */
		people: TeamPerson[];
		/** Every committee of this conference, for each person's "Assign committee" picker. */
		committees: TeamCommittee[];
		/** The role filter the list has open, which the row's links and forms keep. */
		filter: TeamFilter;
		/** The conference's slug, for each row's "Edit roles" link. */
		conferenceSlug: string;
		/** The organisation running the conference, which its members' Title cell names. */
		organizationName: string;
		/** The signed-in reader's id, so their own row can say "You". */
		viewerUserId: string | null;
		/** The people whose rows have actions: below the reader, by the rank rule. */
		actionableUserIds: string[];
		/** The team list's instant form, which every row's buttons post through (T142). */
		onSubmit: SubmitFunction;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let {
		people,
		committees,
		filter,
		conferenceSlug,
		organizationName,
		viewerUserId,
		actionableUserIds,
		onSubmit
	}: Props = $props();

	/**
	 * The table's headings, at the design's widths. The last column holds each
	 * row's "Edit roles" link and "⋯" menu, and its heading is for a screen
	 * reader only.
	 */
	const COLUMNS: TableColumn[] = [
		{ key: 'name', label: 'Name', width: 'w-60' },
		{ key: 'roles', label: 'Roles' },
		{ key: 'committees', label: 'Committees', width: 'w-[6.5rem]' },
		{ key: 'title', label: 'Title', width: 'w-44' },
		{ key: 'actions', label: '', width: 'w-32' }
	];

	/** The row's "Edit roles" link, or `null` on a row the reader may not change. */
	function editRolesHref(person: TeamPerson) {
		if (!actionableUserIds.includes(person.userId)) {
			return null;
		}

		return manageTeamEditRolesUrl(conferenceSlug, filter, person.userId);
	}
</script>

<!-- The table from `md` up. `DataTable` draws the headings; the rows are ours. -->
<div class="hidden md:block">
	<DataTable columns={COLUMNS} isDense>
		<!-- The `(person.userId)` key lets Svelte reuse rows instead of rebuilding them. -->
		{#each people as person (person.userId)}
			<StaffRow
				{person}
				{committees}
				{filter}
				{organizationName}
				isViewer={person.userId === viewerUserId}
				editRolesHref={editRolesHref(person)}
				{onSubmit}
			/>
		{/each}
	</DataTable>
</div>

<!-- The same people as stacked rows below `md`, which is what a phone shows. -->
<ul class="md:hidden">
	{#each people as person (person.userId)}
		<li>
			<StaffCard
				{person}
				{committees}
				{filter}
				{organizationName}
				isViewer={person.userId === viewerUserId}
				editRolesHref={editRolesHref(person)}
				{onSubmit}
			/>
		</li>
	{/each}
</ul>

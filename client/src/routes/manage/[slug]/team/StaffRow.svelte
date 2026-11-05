<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { ResolvedPathname } from '$app/types';
	import type { TeamCommittee, TeamFilter, TeamPerson } from '$lib/team';
	import {
		teamCellClass,
		teamCommitteeCell,
		teamTableRoleLabel,
		teamTitleCell
	} from '$lib/team-table';
	import StaffName from './StaffName.svelte';
	import StaffRowActions from './StaffRowActions.svelte';

	type Props = {
		/** The person this row is about. */
		person: TeamPerson;
		/** Every committee of this conference, for the "Assign committee" picker. */
		committees: TeamCommittee[];
		/** The role filter the list has open, which the row's forms send back. */
		filter: TeamFilter;
		/** The organisation running the conference, which its members' Title cell names. */
		organizationName: string;
		/** True on the reader's own row, which says "You" under the name. */
		isViewer: boolean;
		/** Where "Edit roles" leads, or `null` on a row the reader may not change. */
		editRolesHref: ResolvedPathname | null;
		/** The team list's instant form, which the "Manage" panel's buttons post through (T142). */
		onSubmit: SubmitFunction;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { person, committees, filter, organizationName, isViewer, editRolesHref, onSubmit }: Props =
		$props();

	/*
		`$derived` works each cell out again whenever the person changes, which is
		after every action on this page. A cell holding a stand-in such as "All"
		or "None" is drawn in grey (`$lib/team-table.ts`).
	*/
	const roleLabel = $derived(teamTableRoleLabel(person));
	const committeeCell = $derived(teamCommitteeCell(person));
	const titleCell = $derived(teamTitleCell(person, organizationName));
</script>

<!--
	One row of the People table, which a page shows from `md` up. `StaffCard` is
	the same person on a phone, where five columns do not fit.
-->
<tr class="border-b border-border text-dense">
	<td class="p-3">
		<StaffName {person} {isViewer} />
	</td>
	<td class="p-3 text-foreground">{roleLabel}</td>
	<td class="p-3 {teamCellClass(committeeCell)}">{committeeCell.text}</td>
	<td class="p-3 {teamCellClass(titleCell)}">{titleCell.text}</td>
	<td class="p-3">
		<!--
			Only on the rows of people below the reader (the rank rule): never the
			reader's own row, a row from the organisation, or anybody at or above
			the reader's role.
		-->
		{#if editRolesHref}
			<div class="flex flex-wrap items-center justify-end gap-1">
				<a href={editRolesHref} class="font-medium text-link">Edit roles</a>
				<StaffRowActions {person} {committees} {filter} {onSubmit} />
			</div>
		{/if}
	</td>
</tr>

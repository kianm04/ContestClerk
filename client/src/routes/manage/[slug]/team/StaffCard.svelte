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
		/** The person this card is about. */
		person: TeamPerson;
		/** Every committee of this conference, for the "Assign committee" picker. */
		committees: TeamCommittee[];
		/** The role filter the list has open, which the row's forms send back. */
		filter: TeamFilter;
		/** The organisation running the conference, which its members' title line names. */
		organizationName: string;
		/** True on the reader's own card, which says "You" under the name. */
		isViewer: boolean;
		/** Where "Edit roles" leads, or `null` on a row the reader may not change. */
		editRolesHref: ResolvedPathname | null;
		/** The team list's instant form, which the "Manage" panel's buttons post through (T142). */
		onSubmit: SubmitFunction;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { person, committees, filter, organizationName, isViewer, editRolesHref, onSubmit }: Props =
		$props();

	// `$derived` works these out again whenever the person changes; see `StaffRow`.
	const roleLabel = $derived(teamTableRoleLabel(person));
	const committeeCell = $derived(teamCommitteeCell(person));
	const titleCell = $derived(teamTitleCell(person, organizationName));
</script>

<!--
	One person of the People table as a card, which is what a phone shows
	instead of five columns. `team.md`: the role sits under the name. The lines
	under the name start where the name does, past the 2rem picture and its
	0.75rem gap (`pl-11`).

	`flex-wrap` and `open:basis-full` give the opened "⋯" panel a line of its
	own under the person, rather than squeezing the name beside it.
-->
<div class="flex flex-wrap items-start gap-x-3 gap-y-2 border-b border-border py-3 text-dense">
	<div class="min-w-0 flex-1 basis-48">
		<StaffName {person} {isViewer} />

		<p class="mt-1 pl-11 text-small text-foreground">
			<span>{roleLabel}</span>
			·
			<span class={teamCellClass(committeeCell)}>{committeeCell.text}</span>
		</p>
		<p class="pl-11 text-small break-words {teamCellClass(titleCell)}">{titleCell.text}</p>
	</div>

	<!-- Only on the rows of people below the reader; see `StaffRow`. -->
	{#if editRolesHref}
		<div class="flex items-center gap-1">
			<a href={editRolesHref} class="flex min-h-11 items-center font-medium text-link">Edit roles</a
			>
			<StaffRowActions {person} {committees} {filter} {onSubmit} />
		</div>
	{/if}
</div>

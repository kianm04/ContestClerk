<script lang="ts">
	import DataTable, { type TableColumn } from '$lib/components/DataTable.svelte';
	import type { RoleTableRow } from '$lib/roles';
	import RoleRow from './RoleRow.svelte';
	import RoleCard from './RoleCard.svelte';

	type Props = {
		/** Every role of the conference in its order, with what the reader may do to each. */
		roles: RoleTableRow[];
		/** The conference's slug, for the links to each role's editor. */
		conferenceSlug: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { roles, conferenceSlug }: Props = $props();

	/** The headings at the design's widths; the last holds the arrows and is for screen readers. */
	const COLUMNS: TableColumn[] = [
		{ key: 'name', label: 'Name' },
		{ key: 'scope', label: 'Scope', width: 'w-44' },
		{ key: 'members', label: 'Members', width: 'w-24' },
		{ key: 'public', label: 'Public', width: 'w-44' },
		{ key: 'order', label: '', width: 'w-28' }
	];
</script>

<!-- The table from `md` up, and the same roles as stacked rows on a phone. -->
<div class="hidden md:block">
	<DataTable columns={COLUMNS} isDense>
		<!-- The `(role.id)` key lets Svelte move a row instead of rebuilding it. -->
		{#each roles as role (role.id)}
			<RoleRow {role} {conferenceSlug} />
		{/each}
	</DataTable>
</div>

<ul class="border-t border-border md:hidden">
	{#each roles as role (role.id)}
		<li><RoleCard {role} {conferenceSlug} /></li>
	{/each}
</ul>

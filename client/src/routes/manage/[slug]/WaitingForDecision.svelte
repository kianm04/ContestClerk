<script lang="ts">
	import Inbox from '@lucide/svelte/icons/inbox';
	import DataTable, { type TableColumn } from '$lib/components/DataTable.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import ManageSection from '$lib/components/manage/ManageSection.svelte';
	import type { WaitingRow } from '$lib/dashboard-waiting';
	import { manageApplicationsUrl } from '$lib/urls';
	import WaitingApplicant from './WaitingApplicant.svelte';

	type Props = {
		/** The newest applications nobody has answered yet, newest first. */
		rows: WaitingRow[];
		conferenceSlug: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { rows, conferenceSlug }: Props = $props();

	/** The table's headings. */
	const COLUMNS: TableColumn[] = [
		{ key: 'applicant', label: 'Applicant' },
		{ key: 'preference', label: 'First preference' },
		{ key: 'applied', label: 'Applied' }
	];
</script>

<!-- While applications are taken: the newest ones nobody has answered yet. -->
<ManageSection
	title="Waiting for a decision"
	link={{ label: 'All applications', href: manageApplicationsUrl(conferenceSlug) }}
>
	{#if rows.length === 0}
		<div class="pt-4">
			<EmptyState
				icon={Inbox}
				title="Nothing is waiting for a decision."
				description="New applications appear here as they come in."
			/>
		</div>
	{:else}
		<!-- The table from `md` up. `DataTable` draws the headings; the rows are ours. -->
		<div class="hidden md:block">
			<DataTable columns={COLUMNS} isDense>
				<!-- The `(row.id)` key lets Svelte reuse rows instead of rebuilding them. -->
				{#each rows as row (row.id)}
					<tr class="border-b border-border text-dense text-foreground">
						<td class="p-3"><WaitingApplicant {row} {conferenceSlug} /></td>
						<td class="p-3">{row.firstPreference}</td>
						<td class="p-3 whitespace-nowrap">{row.applied}</td>
					</tr>
				{/each}
			</DataTable>
		</div>

		<!-- The same applications as a list below `md`, which is what a phone shows. -->
		<ul class="md:hidden">
			{#each rows as row (row.id)}
				<li
					class="flex items-center justify-between gap-4 border-b border-border px-1 py-2.5 text-dense"
				>
					<WaitingApplicant {row} {conferenceSlug} />
					<span class="shrink-0 text-small text-muted-foreground"
						>{row.firstPreference} · {row.applied}</span
					>
				</li>
			{/each}
		</ul>
	{/if}
</ManageSection>

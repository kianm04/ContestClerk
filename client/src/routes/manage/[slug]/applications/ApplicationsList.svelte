<script lang="ts">
	import DataTable, { type TableColumn } from '$lib/components/DataTable.svelte';
	import type { ApplicationRowLinks } from '$lib/application-panel-urls';
	import type { ListedApplicationStatus, OrganiserApplicationRow } from '$lib/applications';
	import ApplicationCard from './ApplicationCard.svelte';
	import ApplicationRow from './ApplicationRow.svelte';
	import ApplicationsBulkBar from './ApplicationsBulkBar.svelte';

	type Props = {
		/** The page of applications on screen, in the order the table shows them. */
		rows: OrganiserApplicationRow[];
		/** The ids ticked so far, which decides both the count and each box. */
		selectedIds: string[];
		/** The conference's timezone, so the submitted day is the day it was there. */
		timezone: string;
		/** The review page of one application and the panel showing it, both keeping the list. */
		linksForApplication: (applicationId: string) => ApplicationRowLinks;
		/** The application in the review panel beside the table, or null with no panel. */
		panelApplicationId: string | null;
		/** The tab on screen, so a row whose status has just changed can say so. */
		tabStatus: ListedApplicationStatus;
		/** Called when a box is ticked or unticked, so the page above can keep count. */
		onSelect: (applicationId: string, isSelected: boolean) => void;
		/**
		 * False for a reader who may read applications but not decide them
		 * (`decide_applications`), who then gets no tick boxes and no bulk bar.
		 */
		canSelect: boolean;
		/** Whether a bulk panel is open above the table; see `ApplicationsBulkBar`. */
		isPanelOpen: boolean;
		/** Where each bulk button posts to; see `ApplicationsBulkBar`. */
		chooseAcceptAction: string;
		waitlistAction: string;
		chooseRejectAction: string;
		/** True while the press posting to a given formaction is on its way. */
		isSending: (formAction: string) => boolean;
	};

	let {
		rows,
		selectedIds,
		timezone,
		linksForApplication,
		panelApplicationId,
		tabStatus,
		onSelect,
		canSelect,
		isPanelOpen,
		chooseAcceptAction,
		waitlistAction,
		chooseRejectAction,
		isSending
	}: Props = $props();

	// `$derived` works these out again whenever the panel comes or goes.
	const hasReviewPanel = $derived(panelApplicationId !== null);

	/**
	 * The table's headings, in the artboard's words. The tick box column has no
	 * heading, as the artboard draws it: each box carries its own label, "Select"
	 * and the applicant's name, for a screen reader. From `xl` up the review panel
	 * takes the place of the status column: the tab already says the status.
	 * A reader who may not decide has no boxes, so no column for them.
	 */
	const columns: TableColumn[] = $derived([
		...(canSelect ? [{ key: 'select', label: '', width: 'w-10' }] : []),
		{ key: 'applicant', label: 'Applicant' },
		{ key: 'preference', label: 'First preference' },
		{ key: 'applied', label: 'Applied', width: 'w-28' },
		{ key: 'status', label: 'Status', visibility: hasReviewPanel ? 'xl:hidden' : '' }
	]);
</script>

<!--
	The table from `md` up. `DataTable` draws the headings; the rows are ours.
	`isDense` is the flat table of the management pages.
-->
<div class="hidden md:block">
	<DataTable {columns} isDense>
		<!-- The `(row.id)` key lets Svelte reuse rows instead of rebuilding them. -->
		{#each rows as row (row.id)}
			<ApplicationRow
				application={row}
				reviewHref={linksForApplication(row.id).reviewHref}
				panelHref={linksForApplication(row.id).panelHref}
				{hasReviewPanel}
				isInReviewPanel={row.id === panelApplicationId}
				{tabStatus}
				isSelected={selectedIds.includes(row.id)}
				{canSelect}
				{timezone}
				{onSelect}
			/>
		{/each}
	</DataTable>
</div>

<!--
	The same rows as cards below `md`, which is what a phone shows. Both lists are
	in the page's one post form and both carry a tick box named `ids`, so a ticked
	application is submitted twice; the action puts the ids through a `Set`.
-->
<ul class="flex flex-col md:hidden">
	{#each rows as row (row.id)}
		<li class="border-b border-border">
			<ApplicationCard
				application={row}
				reviewHref={linksForApplication(row.id).reviewHref}
				isSelected={selectedIds.includes(row.id)}
				{canSelect}
				{timezone}
				{onSelect}
			/>
		</li>
	{/each}
</ul>

{#if canSelect}
	<ApplicationsBulkBar
		selectedCount={selectedIds.length}
		{isPanelOpen}
		{chooseAcceptAction}
		{waitlistAction}
		{chooseRejectAction}
		{isSending}
	/>
{/if}

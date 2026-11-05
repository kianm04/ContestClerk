<script lang="ts">
	import Download from '@lucide/svelte/icons/download';
	import Button from '$lib/components/Button.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import type { Tab } from '$lib/components/Tabs.svelte';
	import ManageHeader from '$lib/components/manage/ManageHeader.svelte';
	import ManageTabs from '$lib/components/manage/ManageTabs.svelte';
	import { APPLICATION_STATUS_TABS, APPLICATION_TAB_LABELS } from '$lib/applications';
	import { applicationsHeaderSummary } from '$lib/manage-list-summaries';
	import { manageApplicationsExportUrl, manageApplicationsUrl } from '$lib/urls';
	import ApplicationFilters from './ApplicationFilters.svelte';
	import ApplicationReviewPanel from './ApplicationReviewPanel.svelte';
	import ApplicationsBoard from './ApplicationsBoard.svelte';
	import ApplicationsEmptyState from './ApplicationsEmptyState.svelte';
	import ApplicationsTableView from './ApplicationsTableView.svelte';
	import ApplicationViewSwitch from './ApplicationViewSwitch.svelte';
	import type { PageProps } from './$types';

	// `data` is what `load` returned plus the conference the layout above it read,
	// and `load` runs again on every new address. `form` is the last action's
	// answer: a panel to draw above the table, or a refusal.
	let { data, form }: PageProps = $props();

	// The application beside the table (`?application=` in the address), or null
	// on the board and on an empty tab.
	const reviewPanel = $derived(data.reviewPanel);
	// Two columns from `xl` up while there is a panel: the list, then the panel.
	const layoutClasses = $derived(reviewPanel ? 'xl:grid xl:grid-cols-2 xl:gap-8' : '');

	/* `$derived` works each of these out again whenever `data` changes. */
	const conferenceSlug = $derived(data.conference.slug);
	const isDraft = $derived(data.conference.status === 'draft');
	const isBoard = $derived(data.query.view === 'board');
	const exportHref = $derived(manageApplicationsExportUrl(conferenceSlug, data.query));

	// "9 applications · closes 25 October", under the title.
	const summary = $derived(
		applicationsHeaderSummary(
			data.counts,
			data.conference.applicationsCloseAt,
			data.conference.timezone,
			new Date()
		)
	);

	// Every tab is a real link to `?status=`, so the address says which one is
	// open and the back button works. A new tab starts at its own first page.
	const tabs: Tab[] = $derived(
		APPLICATION_STATUS_TABS.map((status) => ({
			label: APPLICATION_TAB_LABELS[status],
			href: manageApplicationsUrl(conferenceSlug, { ...data.query, status, page: 1 }),
			isActive: status === data.query.status,
			count: data.counts[status]
		}))
	);
</script>

<svelte:head>
	<title>Applications · {data.conference.name} · MUNMeet</title>
</svelte:head>

<ManageHeader title="Applications" {summary}>
	<ApplicationViewSwitch query={data.query} {conferenceSlug} />
	<Button label="Export CSV" variant="secondary" size="dense" icon={Download} href={exportHref} />
</ManageHeader>

<!-- The board shows every state at once, so it has no tabs. -->
{#if !isBoard}
	<ManageTabs {tabs} />
{/if}

<div class="flex flex-col gap-3">
	<ApplicationFilters query={data.query} committees={data.committees} {conferenceSlug} />

	{#if form?.message}
		<Notice tone="error">{form.message}</Notice>
	{/if}

	<!--
		The filters above belong to the whole list, so they stay across the full
		width, and only the list and the review panel share the row below them.
	-->
	<div class={layoutClasses}>
		<div class="min-w-0">
			{#if isBoard}
				<ApplicationsBoard
					columns={data.boardColumns}
					query={data.query}
					{conferenceSlug}
					{form}
					canDecide={data.canDecide}
				/>
			{:else if data.rows.length === 0}
				<ApplicationsEmptyState status={data.query.status} {isDraft} {conferenceSlug} />
			{:else}
				<ApplicationsTableView
					rows={data.rows}
					query={data.query}
					{conferenceSlug}
					timezone={data.conference.timezone}
					pageCount={data.pageCount}
					{form}
					panelApplicationId={reviewPanel?.applicationId ?? null}
					canDecide={data.canDecide}
				/>
			{/if}
		</div>

		{#if reviewPanel}
			<ApplicationReviewPanel
				panel={reviewPanel}
				refusal={form?.reviewPanel ?? null}
				canDecide={data.canDecide}
			/>
		{/if}
	</div>
</div>

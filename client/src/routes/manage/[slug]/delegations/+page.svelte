<script lang="ts">
	import Notice from '$lib/components/Notice.svelte';
	import Pagination from '$lib/components/Pagination.svelte';
	import type { Tab } from '$lib/components/Tabs.svelte';
	import ManageHeader from '$lib/components/manage/ManageHeader.svelte';
	import ManageTabs from '$lib/components/manage/ManageTabs.svelte';
	import {
		DELEGATION_STATUS_TABS,
		DELEGATION_TAB_LABELS,
		delegationCountsSentence
	} from '$lib/delegations';
	import { manageApplicationFormUrl, manageDelegationsUrl } from '$lib/urls';
	import DelegationFilters from './DelegationFilters.svelte';
	import DelegationsEmptyState from './DelegationsEmptyState.svelte';
	import DelegationsList from './DelegationsList.svelte';
	import type { PageProps } from './$types';

	// `data` is what `load` returned plus the conference the layout above it read,
	// and `load` runs again on every new address. There is no `form` here,
	// because this page has no actions: a delegation is decided on its own review
	// page, so the seat picker is in view while the decision is made.
	let { data }: PageProps = $props();

	/* `$derived` works each of these out again whenever `data` changes. */
	const conferenceSlug = $derived(data.conference.slug);
	const acceptsDelegations = $derived(data.conference.acceptsDelegations);

	// Every tab is a real link to `?status=`, so the address says which one is
	// open and the back button works. A new tab starts at its own first page.
	const tabs: Tab[] = $derived(
		DELEGATION_STATUS_TABS.map((status) => ({
			label: DELEGATION_TAB_LABELS[status],
			href: manageDelegationsUrl(conferenceSlug, { ...data.query, status, page: 1 }),
			isActive: status === data.query.status,
			count: data.summary.counts[status]
		}))
	);

	/** The address of one page of rows. `Pagination` makes it an ordinary link. */
	function hrefForPage(page: number) {
		return manageDelegationsUrl(conferenceSlug, { ...data.query, page });
	}
</script>

<svelte:head>
	<title>Delegations · {data.conference.name} · MUNMeet</title>
</svelte:head>

<ManageHeader title="Delegations" summary={delegationCountsSentence(data.summary)} />

<!--
	Above the tabs, because it explains why every one of them may be empty: a
	conference with delegations switched off can still hold the ones it took
	before, but no new school can register one.
-->
{#if !acceptsDelegations}
	<div class="mb-5">
		<Notice tone="info">
			This conference does not accept delegations. Change that under <a
				href={manageApplicationFormUrl(conferenceSlug)}
				class="text-link hover:underline">Application form</a
			>.
		</Notice>
	</div>
{/if}

<ManageTabs {tabs} />

<div class="flex flex-col gap-3">
	<DelegationFilters query={data.query} {conferenceSlug} />

	{#if data.rows.length === 0}
		<DelegationsEmptyState status={data.query.status} />
	{:else}
		<DelegationsList rows={data.rows} {conferenceSlug} timezone={data.conference.timezone} />
		<Pagination page={data.query.page} pageCount={data.pageCount} {hrefForPage} />
	{/if}
</div>

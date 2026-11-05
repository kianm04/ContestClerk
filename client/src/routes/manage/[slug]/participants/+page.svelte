<script lang="ts">
	import Download from '@lucide/svelte/icons/download';
	import Button from '$lib/components/Button.svelte';
	import Pagination from '$lib/components/Pagination.svelte';
	import ManageHeader from '$lib/components/manage/ManageHeader.svelte';
	import type { ParticipantListView } from '$lib/participant-access';
	import { mayOpenManagePage } from '$lib/manage-pages';
	import { participantsSummary } from '$lib/participants-summary';
	import {
		manageParticipantsActionUrl,
		manageParticipantsExportUrl,
		manageParticipantsUrl
	} from '$lib/urls';
	import ParticipantFilters from './ParticipantFilters.svelte';
	import ParticipantsEmptyState from './ParticipantsEmptyState.svelte';
	import ParticipantsList from './ParticipantsList.svelte';
	import type { PageProps } from './$types';

	// `data` is what `load` in `+page.server.ts` returned plus the conference the
	// layout above it read. `load` runs again on every new address, which is what
	// every filter, the sort and the pager lead to.
	let { data }: PageProps = $props();

	/* `$derived` works each of these out again whenever `data` changes. */
	const conferenceSlug = $derived(data.conference.slug);
	const exportHref = $derived(manageParticipantsExportUrl(conferenceSlug, data.query));
	// Everything a row needs besides its participant, in one bundle.
	const view: ParticipantListView = $derived({
		conferenceSlug,
		removeAction: manageParticipantsActionUrl(conferenceSlug, data.query, 'removeFromSeat'),
		columns: data.columns,
		permissions: data.permissions
	});
	// Counted over every participant, so a filter never changes the sentence.
	const summary = $derived(participantsSummary(data.totals) ?? undefined);

	/** The address of one page of rows. `Pagination` makes it an ordinary link. */
	function hrefForPage(page: number) {
		return manageParticipantsUrl(conferenceSlug, { ...data.query, page });
	}
</script>

<svelte:head>
	<title>Participants · {data.conference.name} · MUNMeet</title>
</svelte:head>

<ManageHeader title="Participants" {summary}>
	<Button label="Export CSV" variant="secondary" size="dense" icon={Download} href={exportHref} />
</ManageHeader>

<div class="flex flex-col gap-3">
	<ParticipantFilters
		query={data.query}
		committees={data.committees}
		countByCommittee={data.totals.countByCommittee}
		delegations={data.delegations}
		columns={data.columns}
		{conferenceSlug}
	/>

	{#if data.rows.length === 0}
		<ParticipantsEmptyState
			hasParticipants={data.totals.participantCount > 0}
			mayOpenApplications={mayOpenManagePage(data.permissions, 'applications')}
			{conferenceSlug}
		/>
	{:else}
		<ParticipantsList rows={data.rows} {view} />
		{#if data.columns.actions}
			<p class="hidden px-1 text-small text-muted-foreground md:block">
				The menu on each row opens the delegate's application, delegation or invoice, or changes
				their seat.
			</p>
		{/if}
		<Pagination page={data.query.page} pageCount={data.pageCount} {hrefForPage} />
	{/if}
</div>

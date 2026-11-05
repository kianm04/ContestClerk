<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Pagination from '$lib/components/Pagination.svelte';
	import type { SeatGroup } from '$lib/allocation';
	import {
		describeApplicationBoardFailure,
		expectApplicationBoardChange,
		isApplicationBoardWriteAction,
		seatGroupsByApplicationId
	} from '$lib/application-board-presses';
	import { applicationRowLinks } from '$lib/application-panel-urls';
	import type { ApplicationListQuery, OrganiserApplicationRow } from '$lib/applications';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { createInstantForm } from '$lib/instant-form.svelte';
	import { rowsAfterPresses } from '$lib/row-changes';
	import { manageApplicationsActionUrl, manageApplicationsUrl } from '$lib/urls';
	import ApplicationsList from './ApplicationsList.svelte';
	import BulkAllocateModal from './BulkAllocateModal.svelte';
	import BulkRejectPanel from './BulkRejectPanel.svelte';
	// `ActionData` is the type SvelteKit writes for whatever this route's actions
	// answer with, so `form` here is exactly the page's own `form`.
	import type { ActionData } from './$types';

	type Props = {
		/** One page of one tab, as `load` read it. */
		rows: OrganiserApplicationRow[];
		/** The tab, the filters, the sort and the page on screen. */
		query: ApplicationListQuery;
		conferenceSlug: string;
		/** The conference's timezone, so the submitted day is the day it was there. */
		timezone: string;
		pageCount: number;
		/** The last action's answer: a panel to draw above the table, or a refusal. */
		form: ActionData;
		/** The application in the review panel beside the table, or null with no panel. */
		panelApplicationId: string | null;
		/** Whether the reader holds `decide_applications`; without it there is nothing to tick. */
		canDecide: boolean;
	};

	let {
		rows,
		query,
		conferenceSlug,
		timezone,
		pageCount,
		form,
		panelApplicationId,
		canDecide
	}: Props = $props();

	// Which rows are ticked, shared by the table, the phone cards and the bulk
	// bar. A `$derived` that is also assigned to, which Svelte allows: it starts
	// from the last panel's own rows, and the action reads every ticked id again.
	let selectedIds = $derived((form?.selected ?? []).map((application) => application.id));

	function handleSelect(applicationId: string, isSelected: boolean) {
		selectedIds = isSelected
			? [...selectedIds, applicationId]
			: selectedIds.filter((id) => id !== applicationId);
	}

	/**
	 * Where one bulk button posts to. A plain `?/bulkAccept` would replace the
	 * whole query string and throw away the tab and the filters, so the helper
	 * adds the action to the address the organiser is already on.
	 */
	function actionUrl(actionName: string) {
		return manageApplicationsActionUrl(conferenceSlug, query, actionName);
	}

	/** One row's review page and the panel showing it, both carrying this tab, search and sort. */
	function linksForApplication(applicationId: string) {
		return applicationRowLinks(conferenceSlug, query, applicationId);
	}

	/** The address of one page of rows. `Pagination` makes it an ordinary link. */
	function hrefForPage(page: number) {
		return manageApplicationsUrl(conferenceSlug, { ...query, page });
	}

	// "Accept…" and "Reject…" only open a panel with seats the server chose, so
	// they stay on the slower `createInPlaceForm` (`$lib/in-place-form.svelte.ts`).
	// "Waitlist", "Accept N applications" and "Mark N as not accepted" change the
	// screen at once instead (`createInstantForm`, `$lib/application-board-presses.ts`).
	const inPlaceForm = createInPlaceForm();
	const boardDecisionForm = createInstantForm({ describeFailure: describeApplicationBoardFailure });

	// Only read for "Accept N applications": the seat chosen for each ticked
	// applicant has to be one of the free seats the panel offered them.
	const seatGroupsById: Map<string, SeatGroup[]> = $derived(
		form?.panel === 'accept'
			? seatGroupsByApplicationId(form.selected, form.suggestions)
			: new Map()
	);
	const submitBoardChange = boardDecisionForm.submitExpecting((input) =>
		expectApplicationBoardChange(input, seatGroupsById)
	);

	/** Sends a press through whichever of the two forms above its action belongs to. */
	const submitAction: SubmitFunction = (input) => {
		if (isApplicationBoardWriteAction(input.action)) return submitBoardChange(input);

		return inPlaceForm.submit(input);
	};

	// `rows` with every press still on its way laid on top, before the server answers.
	const shownRows = $derived(rowsAfterPresses(rows, boardDecisionForm.presses));
</script>

<!-- One post form around everything that decides, so whichever bulk button is
	pressed carries every tick box named `ids`. The filter form above is its
	sibling, because a form may not sit inside another form. -->
<form method="post" class="flex flex-col gap-4" use:enhance={submitAction}>
	{#if form?.panel === 'accept'}
		<BulkAllocateModal
			applicants={form.selected}
			suggestions={form.suggestions}
			seatChoices={form.seatChoices}
			acceptAction={actionUrl('bulkAccept')}
		/>
	{/if}
	{#if form?.panel === 'reject'}
		<BulkRejectPanel
			applicants={form.selected}
			decisionNote={form.decisionNote}
			rejectAction={actionUrl('bulkReject')}
		/>
	{/if}
	<ApplicationsList
		rows={shownRows}
		{selectedIds}
		{timezone}
		{linksForApplication}
		{panelApplicationId}
		tabStatus={query.status}
		onSelect={handleSelect}
		canSelect={canDecide}
		isPanelOpen={form?.panel === 'accept' || form?.panel === 'reject'}
		chooseAcceptAction={actionUrl('chooseAccept')}
		waitlistAction={actionUrl('bulkWaitlist')}
		chooseRejectAction={actionUrl('chooseReject')}
		isSending={inPlaceForm.isSending}
	/>
</form>

<Pagination page={query.page} {pageCount} {hrefForPage} />

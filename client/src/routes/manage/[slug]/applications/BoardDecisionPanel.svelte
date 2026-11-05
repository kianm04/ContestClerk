<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import { APPLICATION_BOARD_PANEL_ID, boardColumnQuery } from '$lib/application-board';
	import {
		describeApplicationBoardFailure,
		expectApplicationBoardChange,
		seatGroupsByApplicationId
	} from '$lib/application-board-presses';
	import type { ApplicationListQuery } from '$lib/applications';
	import { createInstantForm } from '$lib/instant-form.svelte';
	import { manageApplicationsActionUrl, manageApplicationsUrl } from '$lib/urls';
	import BulkAllocateModal from './BulkAllocateModal.svelte';
	import BulkRejectPanel from './BulkRejectPanel.svelte';
	// `ActionData` is the type SvelteKit writes for whatever this route's actions
	// answer with, so `form` here is exactly the page's own `form`.
	import type { ActionData } from './$types';

	type Props = {
		/** The last action's answer, which names the panel to draw and who it is about. */
		form: ActionData;
		/** The filters on screen, which the decision and Cancel keep. */
		query: ApplicationListQuery;
		conferenceSlug: string;
	};

	let { form, query, conferenceSlug }: Props = $props();

	/*
		The panel posts with the tab of the card that was dropped, because that is
		where `bulkAccept` and `bulkReject` look the applications up again. See
		`boardColumnQuery`. `$derived` works it out again for each new panel.
	*/
	const decisionQuery = $derived(
		boardColumnQuery(query, form?.selected[0]?.status ?? query.status)
	);

	// Cancel is a link back to the same board, which closes the panel because a
	// new page load starts with no action's answer.
	const cancelHref = $derived(manageApplicationsUrl(conferenceSlug, query));

	function actionUrl(actionName: string) {
		return manageApplicationsActionUrl(conferenceSlug, decisionQuery, actionName);
	}

	/*
		This panel's own button only ever posts "Accept N applications" or "Mark
		N as not accepted", both of which the browser can predict, so the panel
		changes the screen at once instead of showing a spinner
		(`createInstantForm`, `$lib/application-board-presses.ts`). A refusal
		shows as a toast naming what did not happen. Without JavaScript the form
		still posts and reloads the page as before.
	*/
	const boardDecisionForm = createInstantForm({ describeFailure: describeApplicationBoardFailure });

	// Only read when the panel is "Accept N applications": the seat chosen for
	// each applicant has to be one of the free seats the panel offered them.
	const seatGroupsById = $derived(
		form?.panel === 'accept'
			? seatGroupsByApplicationId(form.selected, form.suggestions)
			: new Map()
	);
	const submitDecision = boardDecisionForm.submitExpecting((input) =>
		expectApplicationBoardChange(input, seatGroupsById)
	);
</script>

<!--
	What a drop on Accepted or Not accepted opens: the bulk bar's own seat panel
	or note panel, so the organiser confirms exactly what the bulk bar would ask
	them to. The board shows the card in its new column until they press the
	panel's button or Cancel.
-->
{#if form?.panel === 'accept' || form?.panel === 'reject'}
	<form
		id={APPLICATION_BOARD_PANEL_ID}
		method="post"
		class="flex flex-col gap-2"
		use:enhance={submitDecision}
	>
		{#if form.panel === 'accept'}
			<BulkAllocateModal
				applicants={form.selected}
				suggestions={form.suggestions}
				seatChoices={form.seatChoices}
				acceptAction={actionUrl('bulkAccept')}
			/>
		{:else}
			<BulkRejectPanel
				applicants={form.selected}
				decisionNote={form.decisionNote}
				rejectAction={actionUrl('bulkReject')}
			/>
		{/if}
		<div>
			<Button label="Cancel" variant="secondary" size="dense" href={cancelHref} />
		</div>
	</form>
{/if}

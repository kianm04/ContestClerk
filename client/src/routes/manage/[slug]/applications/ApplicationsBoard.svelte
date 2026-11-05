<script lang="ts">
	import { tick } from 'svelte';
	import {
		APPLICATION_BOARD_PANEL_ID,
		APPLICATION_DROP_FORM_ID,
		applicationDropAction,
		boardColumnQuery,
		panelMoves,
		showBoardMoves,
		type ApplicationBoardColumn,
		type ApplicationBoardMove,
		type ApplicationDropAction
	} from '$lib/application-board';
	import {
		isListedApplicationStatus,
		type ApplicationListQuery,
		type OrganiserApplicationRow
	} from '$lib/applications';
	import { createDropTargetDrag } from '$lib/drop-target-drag.svelte';
	import { manageApplicationsActionUrl } from '$lib/urls';
	import ApplicationStateColumn from './ApplicationStateColumn.svelte';
	import ApplicationDropForm from './ApplicationDropForm.svelte';
	import BoardDecisionPanel from './BoardDecisionPanel.svelte';
	import type { ActionData } from './$types';

	type Props = {
		/** One column per state, as `load` read them. */
		columns: ApplicationBoardColumn[];
		/** The filters on screen, which every drop and link keeps. */
		query: ApplicationListQuery;
		conferenceSlug: string;
		/** The last action's answer: an open panel, or a refusal the page shows. */
		form: ActionData;
		/**
		 * Whether the reader holds `decide_applications`. Without it the board is
		 * only read: no handles, no drop form and no decision panel.
		 */
		canDecide: boolean;
	};

	let { columns, query, conferenceSlug, form, canDecide }: Props = $props();

	// A drop on its way to the server, drawn at once; null again once it has answered.
	let pendingMove: (ApplicationBoardMove & { action: ApplicationDropAction }) | null = $state(null);

	/*
		`$derived` redraws these whenever a drop starts or ends, or `form` or the
		data from `load` changes. An open panel holds its applications in the
		column it would move them to, until it is confirmed or cancelled.
	*/
	const openPanel = $derived(form?.panel ?? null);
	const moves = $derived([
		...panelMoves(openPanel, form?.selected ?? []),
		...(pendingMove === null ? [] : [pendingMove])
	]);
	const shownColumns = $derived(showBoardMoves(columns, moves));
	const pendingIds = $derived(moves.map((move) => move.application.id));
	const dropAction = $derived.by(() => {
		if (pendingMove === null) return '';

		const cardQuery = boardColumnQuery(query, pendingMove.application.status);

		return manageApplicationsActionUrl(conferenceSlug, cardQuery, pendingMove.action);
	});

	/** Work out what landing on this column means, draw it at once and send it. */
	async function handleDrop(application: OrganiserApplicationRow, targetId: string) {
		if (!isListedApplicationStatus(targetId)) return;

		const action = applicationDropAction(application.status, targetId);

		if (action === null) return;

		pendingMove = { application, to: targetId, action };
		// `tick()` waits until Svelte has written the drop's action into the form.
		await tick();
		const dropForm = document.getElementById(APPLICATION_DROP_FORM_ID);

		if (dropForm instanceof HTMLFormElement) dropForm.requestSubmit();
	}

	/** Put the card back where the server has it, and bring an opened panel into view. */
	async function handleDropSettle() {
		pendingMove = null;
		await tick();
		document.getElementById(APPLICATION_BOARD_PANEL_ID)?.scrollIntoView({ block: 'nearest' });
	}

	// Follows the drag handles and finds the column under the pointer (`$lib/drop-target-drag.svelte.ts`).
	const drag = createDropTargetDrag<OrganiserApplicationRow>({ onDrop: handleDrop });
</script>

{#if canDecide}
	<ApplicationDropForm {pendingMove} action={dropAction} onSettle={handleDropSettle} />
	<BoardDecisionPanel {form} {query} {conferenceSlug} />
{/if}

<!--
	The chip that follows the pointer while a card is dragged. `fixed` places it
	against the window, and `pointer-events-none` lets the pointer see the
	column underneath it.
-->
{#if drag.dragged !== null && drag.hasMoved}
	<div
		aria-hidden="true"
		class="pointer-events-none fixed z-50 rounded-control bg-brand-700 px-3 py-1 text-small text-surface shadow-card"
		style="left: {drag.pointerX + 12}px; top: {drag.pointerY + 12}px;"
	>
		{drag.dragged.applicantName}
	</div>
{/if}

<!-- One column per state: stacked on a phone, side by side from `md` up. -->
<div class="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
	<!-- The `(column.status)` key lets Svelte reuse columns instead of rebuilding them. -->
	{#each shownColumns as column (column.status)}
		<ApplicationStateColumn
			{column}
			{drag}
			{pendingIds}
			{canDecide}
			isBusy={pendingMove !== null || openPanel !== null}
			{query}
			{conferenceSlug}
		/>
	{/each}
</div>

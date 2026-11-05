<script lang="ts">
	import {
		applicationDropAction,
		isDraggableApplication,
		type ApplicationBoardColumn
	} from '$lib/application-board';
	import {
		APPLICATION_EMPTY_TITLES,
		APPLICATION_TAB_LABELS,
		type ApplicationListQuery,
		type OrganiserApplicationRow
	} from '$lib/applications';
	import type { DropTargetDrag } from '$lib/drop-target-drag.svelte';
	import { manageApplicationReviewUrl, manageApplicationsUrl } from '$lib/urls';
	import ApplicationBoardCard from './ApplicationBoardCard.svelte';

	type Props = {
		/** This column's state, its first page of cards and how many there are altogether. */
		column: ApplicationBoardColumn;
		/** The board's dragging helper, which says what is being dragged over what. */
		drag: DropTargetDrag<OrganiserApplicationRow>;
		/** The ids of the cards shown somewhere the server has not confirmed yet. */
		pendingIds: string[];
		/** While a drop is being sent or a panel is open, so nothing new can be picked up. */
		isBusy: boolean;
		/** False for a reader who may not decide applications, whose cards have no handle. */
		canDecide: boolean;
		/** The filters on screen, which the links keep. */
		query: ApplicationListQuery;
		conferenceSlug: string;
	};

	let { column, drag, pendingIds, isBusy, canDecide, query, conferenceSlug }: Props = $props();

	/*
		`$derived` works these out again while a card is dragged. A column that
		would take the card being dragged is outlined, and the one under the
		pointer more strongly, the way the allocation grid outlines its seats.
	*/
	const isDropAllowed = $derived(
		drag.dragged !== null &&
			drag.hasMoved &&
			applicationDropAction(drag.dragged.status, column.status) !== null
	);
	const isHovered = $derived(isDropAllowed && drag.hoveredTargetId === column.status);
	const outlineClasses = $derived.by(() => {
		if (isHovered) return 'outline-2 outline-offset-1 outline-ring shadow-card';
		if (isDropAllowed) return 'outline-2 outline-offset-1 outline-dashed outline-ring';

		return '';
	});

	// The column's own tab, where every one of its applications is listed a page at a time.
	const tabHref = $derived(
		manageApplicationsUrl(conferenceSlug, {
			...query,
			status: column.status,
			page: 1,
			view: 'table'
		})
	);
	const hiddenCount = $derived(column.total - column.rows.length);

	/** The review page of one card, carrying the column's tab so Next walks it. */
	function reviewHref(applicationId: string) {
		return manageApplicationReviewUrl(conferenceSlug, applicationId, {
			...query,
			status: column.status,
			page: 1
		});
	}
</script>

<!-- `data-drop-target` is how the dragging helper finds this column under the pointer. -->
<section
	aria-label={APPLICATION_TAB_LABELS[column.status]}
	data-drop-target={column.status}
	class="flex min-w-0 flex-col gap-3 rounded-control bg-muted p-3 {outlineClasses}"
>
	<!-- The same heading and count the column's tab shows above the table. -->
	<h2 class="flex items-baseline justify-between text-dense font-semibold text-foreground">
		{APPLICATION_TAB_LABELS[column.status]}
		<span class="text-small font-normal text-muted-foreground tabular-nums">{column.total}</span>
	</h2>

	{#if column.rows.length === 0}
		<p class="text-small text-muted-foreground">{APPLICATION_EMPTY_TITLES[column.status]}</p>
	{/if}

	<ul class="flex flex-col gap-2">
		<!-- The `(application.id)` key lets Svelte move a card instead of rebuilding it. -->
		{#each column.rows as application (application.id)}
			<ApplicationBoardCard
				{application}
				reviewHref={reviewHref(application.id)}
				{drag}
				isDraggable={canDecide && isDraggableApplication(application.status)}
				isPending={pendingIds.includes(application.id)}
				{isBusy}
			/>
		{/each}
	</ul>

	<!-- A column is its tab's first page; the tab lists the rest. -->
	{#if hiddenCount > 0}
		<a href={tabHref} class="text-small font-medium text-link hover:underline">
			Show all {column.total}
		</a>
	{/if}
</section>

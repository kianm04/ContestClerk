<script lang="ts">
	import LayoutGrid from '@lucide/svelte/icons/layout-grid';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import ManageHeader from '$lib/components/manage/ManageHeader.svelte';
	import {
		allocationColumnsAfterPresses,
		describeAllocationFailure,
		expectAllocationChange
	} from '$lib/allocation-presses';
	import { createInstantForm, type InstantSubmitInput } from '$lib/instant-form.svelte';
	import { allocationHeaderSummary } from '$lib/manage-list-summaries';
	import { manageAllocationUrl, newCommitteeUrl } from '$lib/urls';
	import AllocationBoard from './AllocationBoard.svelte';
	import AllocationFilters from './AllocationFilters.svelte';
	import AllocationPanel from './AllocationPanel.svelte';
	import type { PageProps } from './$types';

	// `data` is what `load` returned plus the conference the layout above it
	// read, and `load` runs again on every new address. There is no `form` here:
	// all five actions redirect, so what they have to say arrives as a flash.
	let { data }: PageProps = $props();

	// One instant form (`$lib/instant-form.svelte.ts`) for "Free the seat", the
	// visibility line and "Move the delegate": the grid shows the change at
	// once, with no spinner, and a failed press comes back with a toast.
	// Dragging a seat or a delegation onto the grid is a separate, older
	// mechanism (`$lib/seat-drop.ts`) that already shows its own result at once.
	const allocationForm = createInstantForm({ describeFailure: describeAllocationFailure });

	/** What a press will change, using the columns as the grid shows them right now. */
	function expectPress(input: InstantSubmitInput) {
		return expectAllocationChange(input, shownColumns);
	}

	const submitAllocationPress = allocationForm.submitExpecting(expectPress);

	// `$derived` works this out again whenever `data`, or the presses still on
	// their way, change. `shownColumns` is `data.columns` with those presses
	// laid on top.
	const shownColumns = $derived(
		allocationColumnsAfterPresses(data.columns, allocationForm.presses)
	);

	/* `$derived` works each of these out again whenever `data` changes, which is
	   after every navigation. `manageAllocationUrl` builds its address with
	   `resolve()` from `$app/paths`, which checks the route exists and adds the
	   base path the app is deployed under. */
	const gridHref = $derived(
		manageAllocationUrl(data.slug, { ...data.query, seat: '', action: '' })
	);
	const resetHref = $derived(manageAllocationUrl(data.slug));

	// "11 seats · 9 filled · 1 held for a delegation · 1 free", under the title.
	// It counts every seat, so it adds up to the whole conference however the
	// grid below it is filtered.
	const summary = $derived(allocationHeaderSummary(data.summary));
</script>

<svelte:head>
	<title>Allocation · {data.conference.name} · MUNMeet</title>
</svelte:head>

<ManageHeader title="Allocation" {summary} />

<div class="flex flex-col gap-4">
	<AllocationFilters query={data.query} committees={data.committees} {resetHref} />

	{#if data.canDecide}
		<AllocationPanel
			slug={data.slug}
			seat={data.selectedSeat}
			query={data.query}
			moveTargets={data.moveTargets}
			cancelHref={gridHref}
			onSubmit={submitAllocationPress}
		/>
	{/if}

	{#if data.committees.length === 0}
		<EmptyState
			icon={LayoutGrid}
			title="No committees yet."
			description="Seats live inside committees."
			actionLabel="Add a committee"
			actionHref={newCommitteeUrl(data.slug)}
		/>
	{:else if data.matchingSeatCount === 0 && data.summary.total > 0}
		<p class="text-body text-muted-foreground">No seats match these filters.</p>
	{/if}

	<!-- The banner of delegations waiting for seats, the grid, and the dragging
		between them (T131). -->
	<AllocationBoard
		columns={shownColumns}
		delegations={data.unseatedDelegations}
		slug={data.slug}
		query={data.query}
		canDecide={data.canDecide}
	/>

	<!-- Only from `md` up, where the six-dot handles are: a phone cannot drag. -->
	{#if data.canDecide && data.matchingSeatCount > 0}
		<p class="mt-1 hidden text-small text-muted-foreground md:block">
			Drag a delegate onto a free seat to move them, or onto another delegate to swap. The menu on
			each seat does the same without dragging.
		</p>
	{/if}
</div>

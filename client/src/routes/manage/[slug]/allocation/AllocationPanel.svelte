<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { ResolvedPathname } from '$app/types';
	import type { AllocationQuery, GridSeat, SeatGroup } from '$lib/allocation';
	import { manageAllocationActionUrl } from '$lib/urls';
	import MoveSeatModal from './MoveSeatModal.svelte';
	import SeatActionPanel from './SeatActionPanel.svelte';

	type Props = {
		/** The conference the panel belongs to, for building its own action addresses. */
		slug: string;
		/** The seat named by `?seat=`, or null while no panel is open. */
		seat: GridSeat | null;
		/** The current filters, including `action`, kept in every address this panel builds. */
		query: AllocationQuery;
		/** Every seat the selected seat's delegate may move into, grouped by committee. */
		moveTargets: SeatGroup[];
		/** Back to the grid with the panel shut. */
		cancelHref: ResolvedPathname;
		/** The page's instant form (`$lib/instant-form.svelte.ts`), passed straight through. */
		onSubmit: SubmitFunction;
	};

	let { slug, seat, query, moveTargets, cancelHref, onSubmit }: Props = $props();

	/** Where one of the three actions posts to, with the seat and the filters in it. */
	function actionUrl(actionName: string): string {
		const panelQuery = { ...query, seat: seat?.id ?? '', action: '' as const };

		return manageAllocationActionUrl(slug, panelQuery, actionName);
	}
</script>

<!-- One panel at a time, above the grid, opened by `?seat=` and `?action=`
	rather than by a click, so every one of the three works without JavaScript. -->
{#if seat && query.action === 'move'}
	<MoveSeatModal
		{seat}
		freeSeatsByCommittee={moveTargets}
		actionUrl={actionUrl('moveDelegate')}
		{cancelHref}
		{onSubmit}
	/>
{:else if seat && (query.action === 'free' || query.action === 'hide')}
	<SeatActionPanel
		{seat}
		action={query.action}
		freeActionUrl={actionUrl('freeSeat')}
		hideActionUrl={actionUrl('toggleHidden')}
		{cancelHref}
		{onSubmit}
	/>
{/if}

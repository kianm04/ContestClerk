<script lang="ts">
	import Draggable from 'carbon-icons-svelte/lib/Draggable.svelte';
	import { DRAGGED_DELEGATE, SEAT_COMMITTEES } from '$lib/organiser-seats';
	import SeatGridCommittee from './SeatGridCommittee.svelte';
	import SeatGridTray from './SeatGridTray.svelte';
</script>

<!--
	A drawing of the seat grid, for section 6.6 of
	`docs/for-organisers-handoff.md`: the delegations still to seat, then every
	committee's seats side by side, filled, free or reserved for a school, with
	one delegate lifted mid-drag from Jordan in the Human Rights Council over
	the free United States seat in the Security Council. The lifted delegate
	floats with the shadow kept for floating things (`shadow-lift`) and a
	degree of tilt.

	The four columns need about 67rem, so the phone drawing runs up to `lg`:
	the tray on top, the Security Council alone, and a line saying three more
	committees follow. It is hidden from screen readers (`aria-hidden`), which
	hear the sentence beside it instead, and nothing in it can be pressed.
-->
<p class="sr-only">
	An example of the seat grid: every seat in four committees shown free, reserved for a school or
	filled by a delegate, with one delegate being dragged onto a free seat.
</p>
<div aria-hidden="true" class="rounded-xl bg-surface text-small text-ink-900 shadow-card">
	<div class="flex items-baseline justify-between gap-4 border-b border-neutral-100 px-5 py-3.5">
		<span class="font-medium">Allocation</span>
		<span class="text-caption text-ink-600 tabular-nums">164 of 220 seats filled</span>
	</div>

	<div class="flex flex-wrap">
		<SeatGridTray />
		<!-- `relative` so the dragged delegate is placed from the grid's top left,
		     which is the Security Council's column. -->
		<div class="relative grid min-w-0 flex-[999_1_16rem] grid-cols-1 lg:grid-cols-4">
			{#each SEAT_COMMITTEES as committee, index (committee.name)}
				<SeatGridCommittee {committee} isFirst={index === 0} />
			{/each}
			<span
				class="absolute top-[20rem] left-[5.5rem] z-2 flex rotate-1 items-center gap-1.5 rounded-lg border border-line bg-surface py-[0.4375rem] pr-3 pl-1.5 whitespace-nowrap shadow-lift"
			>
				<Draggable size={16} class="flex-none text-ink-400" />
				<span class="font-medium">{DRAGGED_DELEGATE}</span>
			</span>
		</div>
	</div>

	<div class="border-t border-neutral-100 px-5 pt-3 pb-3.5 text-caption text-ink-600 lg:hidden">
		3 more committees
	</div>
</div>

<script lang="ts">
	import Draggable from 'carbon-icons-svelte/lib/Draggable.svelte';
	import { SEAT_DELEGATIONS } from '$lib/organiser-seats';
</script>

<!--
	The drawn tray of school delegations still to seat, on the seat grid's
	left (on top on a phone). Each shows how many of the seats it asked for
	it has, with a thin light blue bar; `style:width` sets the bar's length
	from the numbers, which no fixed class could. `{#each … (key)}` repeats a
	delegation for every item, and the key tells Svelte which is which.
-->
<div
	class="flex min-w-0 flex-[1_1_100%] flex-col gap-2 pt-3.5 pr-4 pb-4 pl-5 lg:flex-[0_0_14rem] lg:border-r lg:border-neutral-100"
>
	<span class="text-caption font-medium text-ink-600">Delegations to seat</span>
	{#each SEAT_DELEGATIONS as delegation (delegation.name)}
		<div class="flex items-start gap-1.5 rounded-lg border border-line pt-2 pr-2.5 pb-2.5 pl-1.5">
			<Draggable size={16} class="mt-0.5 flex-none text-ink-400" />
			<div class="flex min-w-0 flex-1 flex-col">
				<span class="font-medium">{delegation.name}</span>
				<span class="text-caption text-ink-600 tabular-nums">
					{delegation.seatsGiven} of {delegation.seatsAsked} seats
				</span>
				<div class="mt-1.5 h-[0.1875rem] overflow-hidden rounded-full bg-brand-50">
					<div
						class="h-full rounded-full bg-brand-500"
						style:width="{(delegation.seatsGiven / delegation.seatsAsked) * 100}%"
					></div>
				</div>
			</div>
		</div>
	{/each}
</div>

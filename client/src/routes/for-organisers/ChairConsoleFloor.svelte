<script lang="ts">
	import { flagUrl } from '$lib/media';
	import {
		ROOM_CLOCK,
		ROOM_CLOCK_BUTTONS,
		ROOM_CLOCK_PERCENT,
		ROOM_FLOOR_CODE,
		ROOM_FLOOR_NAME,
		ROOM_SPEAKING_TIME
	} from '$lib/organiser-room';
</script>

<!--
	The floor on the drawn chair's console: the flag and name of the country
	speaking, its clock and the time it was given, a bar of the time left, and
	the chair's buttons. "Next speaker" is the one in dark blue, across the
	whole width. The buttons are `span`s, because nothing in a picture can be
	pressed.

	The clock is in the sans and `tabular-nums`; the serif names the country,
	and `opsz` 14 sets it in the sturdier small-size cut. The flex basis
	`17rem` is how narrow this half gets before the list wraps under it.
-->
<div class="flex min-w-0 flex-[1.4_1_17rem] flex-col bg-surface px-5 pt-5 pb-[1.375rem]">
	<div class="flex items-center gap-3.5">
		<img
			src={flagUrl(ROOM_FLOOR_CODE, 'lg')}
			alt=""
			class="h-9 w-12 shrink-0 rounded-[3px] object-cover outline-1 -outline-offset-1 outline-ink-900/10"
		/>
		<div class="flex min-w-0 flex-col">
			<span class="text-caption text-ink-600">Has the floor</span>
			<span
				class="font-display text-[1.75rem]/[2.125rem] font-semibold [font-variation-settings:'opsz'_14]"
			>
				{ROOM_FLOOR_NAME}
			</span>
		</div>
	</div>

	<div class="mt-4 flex items-baseline gap-2.5">
		<span class="text-[3rem]/[3.25rem] font-semibold tabular-nums">{ROOM_CLOCK}</span>
		<span class="text-ink-600 tabular-nums">of {ROOM_SPEAKING_TIME}</span>
	</div>

	<!-- The bar of the time left: light blue on a paler blue. -->
	<div class="mt-2 h-1.5 overflow-hidden rounded-full bg-brand-50">
		<div class="h-full rounded-full bg-brand-500" style:width="{ROOM_CLOCK_PERCENT}%"></div>
	</div>

	<div class="mt-5 grid grid-cols-3 gap-2 text-center font-medium whitespace-nowrap">
		{#each ROOM_CLOCK_BUTTONS as label (label)}
			<span class="rounded-lg border border-line px-1 py-[0.4375rem]">{label}</span>
		{/each}
		<span
			class="col-span-full rounded-lg border border-brand-900 bg-brand-900 px-3.5 py-[0.4375rem] text-surface"
		>
			Next speaker
		</span>
	</div>
</div>

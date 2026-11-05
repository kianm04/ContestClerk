<script lang="ts">
	import { hoursFromTop, type CalendarHours } from '$lib/schedule-calendar';

	type Props = {
		hours: CalendarHours;
		/** Where the line that marks now sits in this column, or `null` on any other day. */
		nowMinute: number | null;
	};

	let { hours, nowMinute }: Props = $props();

	// One line across the column at each hour, level with the labels in the gutter.
	const hourLines = $derived(
		Array.from({ length: hours.lastHour - hours.firstHour + 1 }, (_, index) => index)
	);
</script>

<!-- The `(hour)` key lets Svelte reuse each line instead of rebuilding it. -->
{#each hourLines as hour (hour)}
	<div
		aria-hidden="true"
		class="absolute inset-x-0 border-t border-border"
		style="top: calc(var(--grid-top) + var(--hour-height) * {hour})"
	></div>
{/each}

{#if nowMinute !== null}
	<!-- The line that marks now, with a dot where it meets the column's edge. It changes, never blinks. -->
	<div
		aria-hidden="true"
		class="absolute inset-x-0 z-[3] h-0.5 bg-brand-500"
		style="top: calc(var(--grid-top) + var(--hour-height) * {hoursFromTop(nowMinute, hours)} - 1px)"
	>
		<span class="absolute -top-1 -left-[5px] size-2.5 rounded-full bg-brand-500"></span>
	</div>
{/if}

<script lang="ts">
	import { formatTimeOfDay } from '$lib/dates';
	import { hourLabels, hoursFromTop, type CalendarHours } from '$lib/schedule-calendar';

	type Props = {
		hours: CalendarHours;
		/** Where the line that marks now sits today, or `null` when today is not on the calendar. */
		nowMinute: number | null;
		now: Date;
		timezone: string;
	};

	let { hours, nowMinute, now, timezone }: Props = $props();

	// `$derived` works these out again whenever the props change.
	const labels = $derived(hourLabels(hours));
	const nowLabel = $derived(formatTimeOfDay(now.toISOString(), timezone));
</script>

<!--
	The hours down the left of the calendar, each level with its line. The time
	now sits over them in black where the line that marks now crosses, on a white
	ground so it hides the hour it lands on.
-->
<div aria-hidden="true" class="relative w-14 shrink-0 md:w-18">
	{#each labels as label, index (label)}
		<span
			class="absolute right-3 text-small text-ink-600 tabular-nums"
			style="top: calc(var(--grid-top) + var(--hour-height) * {index} - 10px)"
		>
			{label}
		</span>
	{/each}

	{#if nowMinute !== null}
		<span
			class="absolute right-3 bg-background text-small font-semibold text-ink-900 tabular-nums"
			style="top: calc(var(--grid-top) + var(--hour-height) * {hoursFromTop(
				nowMinute,
				hours
			)} - 10px)"
		>
			{nowLabel}
		</span>
	{/if}
</div>

<script lang="ts">
	import type { CalendarDayLabels } from '$lib/schedule-calendar';

	type Props = {
		labels: CalendarDayLabels;
		/** Today's date is filled dark blue, so the eye finds it at once. */
		isToday: boolean;
	};

	let { labels, isToday }: Props = $props();
</script>

<!-- The date in a circle, then "Friday" over "Today · Day 2": a day's name over the calendar and in the list. -->
<span
	class="grid size-9 shrink-0 place-items-center rounded-full text-[18px] font-semibold tabular-nums {isToday
		? 'bg-primary text-primary-foreground'
		: 'text-ink-900'}"
>
	{labels.dayOfMonth}
</span>
<span class="flex min-w-0 flex-col">
	<span class="truncate text-dense font-semibold text-ink-900">{labels.weekday}</span>
	<span class="truncate text-small text-ink-600">{labels.note}</span>
</span>

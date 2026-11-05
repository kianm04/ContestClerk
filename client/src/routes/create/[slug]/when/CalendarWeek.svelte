<script lang="ts">
	import type { DateValue } from '@internationalized/date';
	import * as RangeCalendar from '$lib/components/ui/range-calendar';
	import CalendarDay from './CalendarDay.svelte';

	type Props = {
		/** The seven days of this row, Monday first. */
		week: DateValue[];
		/** The month on show, so a day from the month before or after is drawn faint. */
		month: DateValue;
	};

	let { week, month }: Props = $props();
</script>

<!-- One row of the calendar. `(date)` is the key Svelte uses to keep each day in its place. -->
<RangeCalendar.GridRow>
	{#each week as date (date)}
		<CalendarDay {date} {month} />
	{/each}
</RangeCalendar.GridRow>

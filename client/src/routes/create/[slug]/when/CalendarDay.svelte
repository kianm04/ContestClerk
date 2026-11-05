<script lang="ts">
	import type { DateValue } from '@internationalized/date';
	import * as RangeCalendar from '$lib/components/ui/range-calendar';

	type Props = {
		/** The day this cell draws. */
		date: DateValue;
		/** The month on show, so a day from the month before or after is drawn faint. */
		month: DateValue;
	};

	let { date, month }: Props = $props();
</script>

<!--
	One day of the calendar, as the design draws the chosen range: the first and
	last day in a filled blue circle, the days between on a pale blue band in
	blue, and the band running from the middle of the first circle to the middle
	of the last. bits-ui marks the days with `data-range-start`,
	`data-range-middle` and `data-range-end`; `[&:has(…)]` styles the cell by
	the day inside it. The cells share the row equally (`flex-1`); the calendar
	sets their height and the circle's size in `--cell-size`.
-->
<RangeCalendar.Cell
	{date}
	{month}
	class={[
		'flex flex-1 items-center justify-center',
		'[&:has([data-selected])]:bg-transparent [&:has([data-selected][data-range-middle])]:bg-creation-hover',
		'[&:has([data-range-start]):not(:has([data-range-end]))]:bg-linear-to-r [&:has([data-range-start]):not(:has([data-range-end]))]:from-transparent [&:has([data-range-start]):not(:has([data-range-end]))]:from-50% [&:has([data-range-start]):not(:has([data-range-end]))]:to-creation-hover [&:has([data-range-start]):not(:has([data-range-end]))]:to-50%',
		'[&:has([data-range-end]):not(:has([data-range-start]))]:bg-linear-to-r [&:has([data-range-end]):not(:has([data-range-start]))]:from-creation-hover [&:has([data-range-end]):not(:has([data-range-start]))]:from-50% [&:has([data-range-end]):not(:has([data-range-start]))]:to-transparent [&:has([data-range-end]):not(:has([data-range-start]))]:to-50%'
	].join(' ')}
>
	<RangeCalendar.Day
		class={[
			'rounded-full fs-15 font-medium text-creation-ink-950',
			'[&[data-outside-month]:not([data-selected])]:text-creation-ink-100',
			'data-[range-middle]:font-semibold data-[range-middle]:text-creation-blue',
			'data-[range-start]:font-semibold data-[range-start]:hover:text-white',
			'data-[range-end]:font-semibold data-[range-end]:hover:text-white'
		].join(' ')}
	/>
</RangeCalendar.Cell>

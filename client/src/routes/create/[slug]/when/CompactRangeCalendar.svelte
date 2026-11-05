<script lang="ts">
	import { untrack } from 'svelte';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { RangeCalendar as RangeCalendarPrimitive, type DateRange } from 'bits-ui';
	import * as RangeCalendar from '$lib/components/ui/range-calendar';
	import { calendarOpeningDay, calendarRange } from '$lib/calendar-range';
	import CalendarWeek from './CalendarWeek.svelte';

	type Props = {
		/** The start and end date fields, as "2027-04-16" or empty. */
		startDate: string;
		endDate: string;
		/** The first suggested day, for the month the calendar opens on. */
		suggestedDate: string | null;
		/** Today, as "2026-10-04". */
		today: string;
		/** Called when a range is picked, which no form event announces. */
		onPick: () => void;
	};

	let {
		startDate = $bindable(),
		endDate = $bindable(),
		suggestedDate,
		today,
		onPick
	}: Props = $props();

	// What the calendar draws comes from the two date fields, which stay the
	// real form fields: the calendar is a quicker way to fill them in.
	const range = $derived(calendarRange(startDate, endDate));
	// The month on show; `bind:placeholder` lets the calendar's arrows move it.
	// `untrack` reads the props once, on purpose: after that the calendar's arrows move it.
	let shownMonth = $state(untrack(() => calendarOpeningDay(startDate, suggestedDate, today)));

	/** A range was picked on the calendar: write it into the fields. */
	function pickRange(picked: DateRange) {
		if (picked.start === undefined || picked.end === undefined) return;
		startDate = picked.start.toString();
		endDate = picked.end.toString();
		onPick();
	}

	const ARROW_CLASSES =
		'size-7 rounded-md text-creation-ink-600 hover:bg-creation-field hover:text-creation-ink-950 max-lg:size-11';
</script>

<!--
	The month calendar of the design: 427 pixels wide in a hairline box, the
	month's name at the top left and its two arrows at the right, three-letter
	weekdays, and 32 pixel rows of days. shadcn's own `RangeCalendar` writes
	the weekdays in two letters, so this one is put together from its parts
	instead, on bits-ui's root. The root hands its parts the weeks to draw
	through `{#snippet children({ months, weekdays })}`: that is how bits-ui
	shares what it worked out with the markup inside it.
	On a phone it takes the full width and its days are 44 pixels tall.
	`--cell-radius` is the round corner shadcn gives the first and last day of
	a range; it is the same "infinitely round" as `rounded-full`, because a
	box whose corners differ that much is drawn with some corners square.
-->
<RangeCalendarPrimitive.Root
	value={range}
	onValueChange={pickRange}
	bind:placeholder={shownMonth}
	weekStartsOn={1}
	weekdayFormat="short"
	locale="en-GB"
	class="w-full shrink-0 self-start rounded-lg border border-creation-panel-border bg-white pt-3.5 pr-4 pb-1 pl-4 [--cell-radius:calc(infinity*1px)] [--cell-size:--spacing(8)] max-lg:[--cell-size:--spacing(11)] lg:w-106.75"
>
	{#snippet children({ months, weekdays })}
		<div class="flex h-7 items-center justify-between max-lg:h-11">
			<RangeCalendar.Heading class="ml-1.5 px-0 fs-18 lh-24 font-semibold text-creation-ink-950" />
			<div class="flex gap-2.5">
				<RangeCalendar.PrevButton class={ARROW_CLASSES}>
					<ChevronLeft aria-hidden="true" class="size-5" />
				</RangeCalendar.PrevButton>
				<RangeCalendar.NextButton class={ARROW_CLASSES}>
					<ChevronRight aria-hidden="true" class="size-5" />
				</RangeCalendar.NextButton>
			</div>
		</div>
		<!-- `(month)` and `(week)` are the keys Svelte uses to keep each block in its place. -->
		{#each months as month (month)}
			<RangeCalendar.Grid class="mt-2 gap-1">
				<RangeCalendar.GridHead>
					<RangeCalendar.GridRow>
						{#each weekdays as weekday (weekday)}
							<RangeCalendar.HeadCell
								class="flex-1 fs-14! lh-20! font-normal text-creation-ink-250"
							>
								{weekday}
							</RangeCalendar.HeadCell>
						{/each}
					</RangeCalendar.GridRow>
				</RangeCalendar.GridHead>
				<RangeCalendar.GridBody>
					{#each month.weeks as week (week)}
						<CalendarWeek {week} month={month.value} />
					{/each}
				</RangeCalendar.GridBody>
			</RangeCalendar.Grid>
		{/each}
	{/snippet}
</RangeCalendarPrimitive.Root>

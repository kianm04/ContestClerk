<script lang="ts">
	import { calendarOpeningDay } from '$lib/calendar-range';
	import type { WhenErrors } from '$lib/creation-when';
	import CompactRangeCalendar from './CompactRangeCalendar.svelte';
	import DatePickerField from './DatePickerField.svelte';
	import TimeFields from './TimeFields.svelte';

	type Props = {
		startDate: string;
		endDate: string;
		isTimesTba: boolean;
		startTime: string;
		endTime: string;
		errors: WhenErrors;
		/** The first suggested day, for the month the calendar opens on. */
		suggestedDate: string | null;
		/** Today, as "2026-10-04". */
		today: string;
		/** Called when the calendar picks a range, which no form event announces. */
		onPick: () => void;
	};

	let {
		startDate = $bindable(),
		endDate = $bindable(),
		isTimesTba = $bindable(),
		startTime = $bindable(),
		endTime = $bindable(),
		errors,
		suggestedDate,
		today,
		onPick
	}: Props = $props();

	// The month a date dropdown opens on while its day is still empty.
	const openingDay = $derived(calendarOpeningDay(startDate, suggestedDate, today));
</script>

<!--
	The calendar on the left and the fields beside it, 28 pixels apart, 16
	under the suggestion. Both write the same two dates; `bind:` keeps the
	calendar and the date dropdowns in step. The fields sit in the design's two
	columns with 22 pixels between them every way. On a phone the fields come
	under the calendar.
-->
<div class="mt-4 flex items-start gap-7 max-lg:flex-col max-lg:gap-4">
	<CompactRangeCalendar bind:startDate bind:endDate {suggestedDate} {today} {onPick} />
	<div class="w-full min-w-0 flex-1 pt-0.5">
		<div class="grid grid-cols-2 gap-5.5 max-lg:grid-cols-1">
			<DatePickerField
				name="startDate"
				label="Start date"
				bind:value={startDate}
				{openingDay}
				error={errors.startDate}
			/>
			<DatePickerField
				name="endDate"
				label="End date"
				bind:value={endDate}
				{openingDay}
				error={errors.endDate}
			/>
			<TimeFields bind:startTime bind:endTime bind:isTimesTba />
		</div>
	</div>
</div>

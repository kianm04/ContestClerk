<script lang="ts">
	import type { DateValue } from '@internationalized/date';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import FieldError from '$lib/components/FieldError.svelte';
	import { Calendar } from '$lib/components/ui/calendar';
	import { Label } from '$lib/components/ui/label';
	import * as Popover from '$lib/components/ui/popover';
	import { calendarDay } from '$lib/calendar-range';
	import { fieldErrorId } from '$lib/form-fields';
	import { announceChange } from './announce-change';
	import { longDate } from './field-display';
	import { DROPDOWN_CLASSES } from './where-fields';

	type Props = {
		/** The hidden field's `name`, and the button's `id`: `startDate` or `endDate`. */
		name: string;
		label: string;
		/** The day picked, as "2027-04-16", or "". */
		value: string;
		/** The day whose month the calendar opens on while none is picked. */
		openingDay: DateValue;
		error?: string;
	};

	let { name, label, value = $bindable(), openingDay, error }: Props = $props();

	// The picked day as the calendar wants it. Worked out once per change, in a
	// `$derived`: written inline in the markup, it would be a new object on
	// every read, and the calendar would take each one as a new pick and jump
	// back to its month.
	const pickedDay = $derived(calendarDay(value));
	let isOpen = $state(false);
	// The month on show. `bind:placeholder` lets the calendar's arrows move it;
	// it starts again from the picked day each time the calendar opens.
	let shownMonth: DateValue | undefined = $state();
	let wrapper: HTMLElement | undefined = $state(); // set by `bind:this`

	function handleOpenChange(isNowOpen: boolean) {
		if (isNowOpen) shownMonth = pickedDay ?? openingDay;
	}

	/** A day was pressed: keep it, close the calendar and tell the autosave. */
	function pickDay(day: DateValue | undefined) {
		if (day === undefined) return;
		value = day.toString();
		isOpen = false;
		announceChange(wrapper);
	}
</script>

<!--
	A date as the design draws it: a 40 pixel dropdown button with a calendar
	icon, the day in words and a chevron. Pressing it opens shadcn's
	`Calendar` in a `Popover`. The form sends the hidden input beside it, as
	"2027-04-16"; without JavaScript that is the day the page was drawn with.
-->
<div class="flex min-w-0 flex-col" bind:this={wrapper}>
	<Label for={name} class="fs-16 lh-22 font-semibold text-creation-ink-900">{label}</Label>
	<input type="hidden" {name} {value} />
	<!-- `bind:open` lets this file close the popover once a day is picked. -->
	<Popover.Root bind:open={isOpen} onOpenChange={handleOpenChange}>
		<Popover.Trigger
			id={name}
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={error ? fieldErrorId(name) : undefined}
			class="{DROPDOWN_CLASSES} mt-1.5 h-10"
		>
			<CalendarIcon class="size-5 shrink-0 text-creation-blue" aria-hidden="true" />
			<span class="min-w-0 flex-1 truncate">{longDate(value) || 'Pick a day'}</span>
			<ChevronDown class="size-4.5 shrink-0" aria-hidden="true" />
		</Popover.Trigger>
		<Popover.Content align="start" class="w-auto p-0">
			<Calendar
				type="single"
				value={pickedDay}
				onValueChange={pickDay}
				bind:placeholder={shownMonth}
				locale="en-GB"
				weekStartsOn={1}
			/>
		</Popover.Content>
	</Popover.Root>
	<FieldError id={fieldErrorId(name)} message={error} />
</div>

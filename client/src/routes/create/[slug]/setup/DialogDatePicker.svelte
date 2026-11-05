<script lang="ts">
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import { parseDate, type DateValue } from '@internationalized/date';
	import { Calendar } from '$lib/components/ui/calendar';
	import * as Popover from '$lib/components/ui/popover';
	import { creationClasses } from '$lib/creation-classes';
	import { formatPickedDay } from './dialog-dates';

	type Props = {
		/** The id the field's `<label for>` points at, carried by the button. */
		id: string;
		/** The name the day is sent under, in a hidden input; left out when the parent sends it. */
		name?: string;
		/** The day as `YYYY-MM-DD`, or `''` before one is picked. */
		value: string;
		describedBy?: string;
		class?: string;
	};

	// `$bindable()` lets the parent write `bind:value` and read the picked day back.
	let { id, name, value = $bindable(), describedBy, class: className }: Props = $props();

	let isOpen = $state(false);

	// The calendar works in `DateValue`s, the day as a date library knows it.
	const pickedDay = $derived(/^\d{4}-\d{2}-\d{2}$/.test(value) ? parseDate(value) : undefined);

	function handlePick(day: DateValue | undefined) {
		value = day === undefined ? '' : day.toString();
		isOpen = false;
	}
</script>

<!--
	A day picker: a button drawn as the dialogs' 40 pixel field, showing the
	day picked, which opens shadcn's `Calendar` in a `Popover` under it. The
	day is sent as `YYYY-MM-DD` in a hidden input, as a date field would send it.
-->
<Popover.Root bind:open={isOpen}>
	<Popover.Trigger
		{id}
		aria-describedby={describedBy}
		class={creationClasses(
			'flex h-10 w-full items-center justify-between gap-3 rounded-md border border-creation-input-border bg-white px-3.5 text-left fs-17 lh-24 text-creation-ink-950 focus-visible:border-2 focus-visible:border-creation-blue-focus focus-visible:px-3.25 focus-visible:outline-none max-lg:min-h-11',
			className
		)}
	>
		{#if value === ''}
			<span class="text-creation-ink-200">Choose a day</span>
		{:else}
			{formatPickedDay(value)}
		{/if}
		<CalendarDays class="size-5 shrink-0" aria-hidden="true" />
	</Popover.Trigger>
	<Popover.Content
		align="start"
		class="creation-root creation-root-dialog w-auto rounded-lg border border-creation-panel-border bg-white p-0 shadow-creation-menu ring-0"
	>
		<Calendar
			type="single"
			value={pickedDay}
			onValueChange={handlePick}
			locale="en-GB"
			weekStartsOn={1}
		/>
	</Popover.Content>
</Popover.Root>
{#if name}
	<input type="hidden" {name} {value} />
{/if}

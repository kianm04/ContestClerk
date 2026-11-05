<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import { dayTabLabel } from '$lib/schedule';
	import type { CalendarColumn } from '$lib/schedule-calendar';

	type Props = {
		/** The calendar's days, one link each. */
		columns: CalendarColumn[];
		/** The address that shows one day, `?day=` in the page's own address. */
		dayHref: (day: string) => ResolvedPathname;
	};

	let { columns, dayHref }: Props = $props();
</script>

<!--
	A phone's way between days: "Thu", "Today", "Sat" over each date, the open
	one underlined in light blue. Each is a link to `?day=`, so it works without
	JavaScript and the address says which day is open. A desktop shows every day
	side by side and so has no need of it. A long conference scrolls sideways
	inside the strip rather than pushing the page wider.
-->
<nav aria-label="Days" class="flex overflow-x-auto border-y border-border md:hidden">
	{#each columns as column (column.day)}
		<a
			href={dayHref(column.day)}
			aria-label={column.isToday ? `Today, ${dayTabLabel(column.day)}` : dayTabLabel(column.day)}
			aria-current={column.isActive ? 'date' : undefined}
			class="flex min-h-17 min-w-16 flex-1 flex-col items-center justify-center gap-1 border-b-2 {column.isActive
				? 'border-brand-500'
				: 'border-transparent'}"
		>
			<span class="text-small font-medium {column.isActive ? 'text-ink-900' : 'text-ink-600'}">
				{column.isToday ? 'Today' : column.labels.shortWeekday}
			</span>
			<span
				class="grid size-8 place-items-center rounded-full text-dense font-semibold tabular-nums {column.isToday
					? 'bg-primary text-primary-foreground'
					: 'text-ink-900'}"
			>
				{column.labels.dayOfMonth}
			</span>
		</a>
	{/each}
</nav>

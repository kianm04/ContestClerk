<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import Dropdown, { type DropdownItem } from '$lib/components/Dropdown.svelte';
	import ScheduleViewToggle from '$lib/components/schedule/ScheduleViewToggle.svelte';
	import { formatDateRange } from '$lib/dates';
	import { conferenceUrl } from '$lib/urls';

	type Props = {
		conference: {
			name: string;
			slug: string;
			timezone: string;
			startDate: string;
			endDate: string;
		};
		/** The reader's other conferences, each opening its own schedule. Left out when empty. */
		switchItems: DropdownItem[];
		calendarHref: ResolvedPathname;
		listHref: ResolvedPathname;
		isList: boolean;
	};

	let { conference, switchItems, calendarHref, listHref, isList }: Props = $props();
</script>

<!--
	The page's title, with one line of facts under it: whose programme, when,
	and the timezone every time is in. The conference's name goes back to its
	page. On the right, another conference's schedule and the choice of view.

	`relative z-15` lifts the row, and the "Switch conference" menu that opens
	out of it, above the calendar's event blocks and their open details (`z-10`)
	further down the page. It stays under the app's sticky top bar (`z-20`): at
	`z-20` as well, this row would come later on the page than the bar and so be
	drawn over it when the page scrolled (Trello card D5RgHWEg).
-->
<header class="relative z-15 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
	<div class="flex min-w-0 flex-col gap-1">
		<h1 class="font-display text-h1-mobile text-brand-900 md:text-h1">Schedule</h1>
		<p class="text-dense text-ink-600">
			<a class="text-brand-700 hover:underline" href={conferenceUrl(conference.slug)}>
				{conference.name}</a
			>
			·
			<span class="tabular-nums">{formatDateRange(conference.startDate, conference.endDate)}</span>
			· All times {conference.timezone}
		</p>
	</div>

	<div class="flex flex-wrap items-center gap-2">
		{#if switchItems.length > 0}
			<Dropdown label="Switch conference" items={switchItems} />
		{/if}
		<ScheduleViewToggle {calendarHref} {listHref} {isList} />
	</div>
</header>

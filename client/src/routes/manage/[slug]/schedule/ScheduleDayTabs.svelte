<script lang="ts">
	import type { Tab } from '$lib/components/Tabs.svelte';
	import ManageTabs from '$lib/components/manage/ManageTabs.svelte';
	import { dayTabLabel, type ScheduleDay } from '$lib/schedule';
	import { manageScheduleUrl } from '$lib/urls';

	type Props = {
		/** Every day of the programme, each with how many events it has. */
		days: ScheduleDay[];
		/** The day that is open, `YYYY-MM-DD`. */
		activeDay: string;
		conferenceSlug: string;
	};

	let { days, activeDay, conferenceSlug }: Props = $props();

	/**
	 * The words on one tab. A day outside the conference's own dates gets a dot,
	 * so an event typed on the wrong day stands out.
	 */
	function tabLabel(day: ScheduleDay): string {
		const label = dayTabLabel(day.day);

		return day.isOutsideDates ? `${label} •` : label;
	}

	// `$derived` builds the tabs again whenever the days or the open day change.
	const tabs: Tab[] = $derived(
		days.map((day) => ({
			label: tabLabel(day),
			href: manageScheduleUrl(conferenceSlug, { day: day.day, isList: true }),
			isActive: day.day === activeDay,
			count: day.count
		}))
	);
</script>

<!--
	The day tabs over the list (`?view=list`); the calendar shows every day at
	once. `sticky` keeps them in view while a long day scrolls underneath them.
-->
<div class="sticky top-0 z-10 bg-background">
	<ManageTabs {tabs} label="Days" />
</div>

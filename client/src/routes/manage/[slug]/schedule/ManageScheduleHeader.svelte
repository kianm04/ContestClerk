<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import Button from '$lib/components/Button.svelte';
	import ManageHeader from '$lib/components/manage/ManageHeader.svelte';
	import ScheduleViewToggle from '$lib/components/schedule/ScheduleViewToggle.svelte';
	import { manageScheduleUrl } from '$lib/urls';

	type Props = {
		conferenceSlug: string;
		timezone: string;
		/** The open day, which every button here keeps in its address. */
		activeDay: string;
		/** True while the list is shown rather than the calendar. */
		isList: boolean;
		/** "Add committee sessions" has nothing to add until there are committees. */
		hasCommittees: boolean;
	};

	let { conferenceSlug, timezone, activeDay, isList, hasCommittees }: Props = $props();
</script>

<!--
	The title row of the organiser's schedule: "Add event" is the page's one
	primary button, and the switch between calendar and list sits beside it.
-->
<ManageHeader title="Schedule" summary="All times {timezone}">
	<!-- A disabled button shows no tooltip of its own, so the wrapper carries it. -->
	<span title={hasCommittees ? undefined : 'Add committees first'}>
		<Button
			label="Add committee sessions"
			variant="secondary"
			size="dense"
			href={manageScheduleUrl(conferenceSlug, { day: activeDay, isAddingSessions: true })}
			isDisabled={!hasCommittees}
		/>
	</span>
	<Button
		label="Add event"
		variant="primary"
		size="dense"
		icon={Plus}
		href={manageScheduleUrl(conferenceSlug, { day: activeDay, isAddingEvent: true })}
	/>
	<ScheduleViewToggle
		calendarHref={manageScheduleUrl(conferenceSlug, { day: activeDay })}
		listHref={manageScheduleUrl(conferenceSlug, { day: activeDay, isList: true })}
		{isList}
	/>
</ManageHeader>

<script lang="ts">
	import ChevronRight from 'carbon-icons-svelte/lib/ChevronRight.svelte';
	import {
		DASHBOARD_ATTENTION,
		DASHBOARD_HEADLINE,
		DASHBOARD_NEXT,
		DASHBOARD_NOW,
		DASHBOARD_PRESENT_LINE
	} from '$lib/organiser-room';
	import DayDashboardRooms from './DayDashboardRooms.svelte';
</script>

<!--
	The secretariat's dashboard on a conference day, drawn: how many
	committees are in session and what comes next, a table of the rooms with
	who is present, the roll call across the conference, and the one delegate
	who needs attention. The three narrow columns fit a phone as they are, so
	there is one layout.

	The picture is hidden from screen readers (`aria-hidden`), and the sentence
	before it says what it shows. The chevron on the last row is drawn, not
	pressed.
-->
<div>
	<p class="sr-only">
		An example of the dashboard on a conference day: 6 of 8 committees in session, the delegates
		present in each room, 187 of 204 present across the conference, and Zoe Adams marked absent in
		the Human Rights Council.
	</p>

	<div
		aria-hidden="true"
		class="overflow-hidden rounded-xl bg-surface text-small text-ink-900 shadow-card"
	>
		<div class="flex flex-col px-5 pt-4 pb-3.5 tabular-nums">
			<span class="flex items-center gap-2 text-dense font-semibold">
				<span class="size-2 shrink-0 rounded-full bg-brand-500"></span>
				{DASHBOARD_HEADLINE}
			</span>
			<span class="mt-1.5">{DASHBOARD_NOW}</span>
			<span class="text-ink-600">{DASHBOARD_NEXT}</span>
		</div>

		<DayDashboardRooms />

		<div
			class="border-t border-neutral-100 bg-mist px-5 pt-2.5 pb-3 text-caption text-ink-600 tabular-nums"
		>
			{DASHBOARD_PRESENT_LINE}
		</div>

		<div class="border-t border-neutral-100 px-5 pt-3.5 pb-1 text-caption font-medium text-ink-600">
			Needs attention
		</div>
		<div class="flex items-center gap-3 px-5 pt-2 pb-3.5">
			<span class="size-2 shrink-0 rounded-full bg-warning-500"></span>
			<div class="flex min-w-0 flex-1 flex-col">
				<span class="text-dense font-medium">{DASHBOARD_ATTENTION.title}</span>
				<span class="text-caption text-ink-600 tabular-nums">{DASHBOARD_ATTENTION.detail}</span>
			</div>
			<ChevronRight size={16} class="shrink-0 text-ink-600" />
		</div>
	</div>
</div>

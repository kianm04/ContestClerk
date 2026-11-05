<script lang="ts">
	import { DASHBOARD_MORE_ROOMS, DASHBOARD_ROOMS } from '$lib/organiser-room';

	/* The table's three columns, shared by the header and every row so they
	   line up: the committee, the session (a little wider), and the count of
	   who is present, 4.5rem and right-aligned. */
	const COLUMNS =
		'grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_4.5rem] items-center gap-x-3 px-5';
</script>

<!--
	The rooms table on the drawn conference-day dashboard: a pale blue header
	row, then each committee with its session and who is present. A committee
	in session has a blue name and a light blue dot; one that is not is grey,
	with an empty space where the dot would be so the words still line up.

	`{#each … (room.committee)}` draws one row per committee, keyed by its
	short name, which no two committees share.
-->
<div class="{COLUMNS} min-h-8 bg-brand-50 text-caption font-medium text-ink-600">
	<span>Committee</span>
	<span>Session</span>
	<span class="text-right">Present</span>
</div>

<div class="divide-y divide-neutral-100">
	{#each DASHBOARD_ROOMS as room (room.committee)}
		<div class="{COLUMNS} min-h-11">
			<span>
				<span
					class={[
						'inline-block rounded-lg px-2 py-0.5 text-caption font-medium',
						room.isInSession ? 'bg-brand-50 text-brand-700' : 'bg-neutral-100 text-ink-600'
					]}
				>
					{room.committee}
				</span>
			</span>
			<span class={['flex items-center gap-2', !room.isInSession && 'text-ink-600']}>
				<span class={['size-1.5 shrink-0 rounded-full', room.isInSession && 'bg-brand-500']}></span>
				{room.session}
			</span>
			<span class={['text-right tabular-nums', !room.isInSession && 'text-ink-600']}>
				{room.present}
			</span>
		</div>
	{/each}
</div>

<div class="border-t border-neutral-100 px-5 py-2.5 text-caption text-ink-600">
	{DASHBOARD_MORE_ROOMS}
</div>

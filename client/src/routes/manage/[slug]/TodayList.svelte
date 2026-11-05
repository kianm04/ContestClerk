<script lang="ts">
	import ManageSection from '$lib/components/manage/ManageSection.svelte';
	import type { TodayRow } from '$lib/dashboard-today';
	import { manageScheduleUrl } from '$lib/urls';

	type Props = {
		/** Today's events, soonest first, from `todayRows` in `$lib/dashboard-today.ts`. */
		rows: TodayRow[];
		conferenceSlug: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { rows, conferenceSlug }: Props = $props();

	/* The event going on now is drawn in blue. Both class lists are written out
	   in full, because Tailwind reads the class names out of this file. */
	const ROW_CLASSES = {
		current: 'flex gap-4 border-b border-border bg-accent px-1 py-2.5 text-dense',
		other: 'flex gap-4 border-b border-border px-1 py-2.5 text-dense'
	};
	const TIME_CLASSES = {
		current: 'w-28 shrink-0 font-semibold whitespace-nowrap text-link tabular-nums',
		other: 'w-28 shrink-0 whitespace-nowrap text-muted-foreground tabular-nums'
	};
</script>

<!-- On a conference day: the whole of today's programme, with what is on now picked out. -->
<ManageSection title="Today" link={{ label: 'Schedule', href: manageScheduleUrl(conferenceSlug) }}>
	{#if rows.length === 0}
		<p class="px-1 py-4 text-dense text-muted-foreground">Nothing is on the schedule today.</p>
	{/if}

	<ul>
		<!--
			The `(row.id)` key lets Svelte reuse rows instead of rebuilding them.
			`aria-current="time"` tells a screen reader which event is on now.
		-->
		{#each rows as row (row.id)}
			<li
				class={row.isCurrent ? ROW_CLASSES.current : ROW_CLASSES.other}
				aria-current={row.isCurrent ? 'time' : undefined}
			>
				<span class={row.isCurrent ? TIME_CLASSES.current : TIME_CLASSES.other}>{row.time}</span>
				<div class="min-w-0 flex-1">
					<p class="font-medium text-foreground">{row.title}</p>
					{#if row.place}
						<p class="text-small text-muted-foreground">{row.place}</p>
					{/if}
				</div>
			</li>
		{/each}
	</ul>
</ManageSection>

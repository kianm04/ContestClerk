<script lang="ts">
	import StatusDot from '$lib/components/manage/StatusDot.svelte';
	import type { ProgrammeRowData } from '$lib/home-rows';

	type Props = {
		/** One event, worded by `todayProgrammeRows` or `programmeRows` in `$lib/home-rows.ts`. */
		row: ProgrammeRowData;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { row }: Props = $props();

	/*
		How wide the time column is from `sm` up. On a conference day it holds a
		time alone, "12:30 – 13:30"; on an ordinary day it holds the day as well,
		"Tomorrow · 09:00 – 10:30", and needs the room. The row tells the two
		apart by the " · " that `eventWhen` in `$lib/home.ts` puts between the day
		and the time, which a time on its own never contains. Both classes are
		written out in full, because Tailwind reads the class names out of this
		file. `$derived` works it out again whenever the row changes.
	*/
	const timeColumnClass = $derived(row.when.includes(' · ') ? 'sm:w-[13rem]' : 'sm:w-[9rem]');
</script>

<!--
	One row of "Today's programme" or "Programme": when, what and where, and
	"Now" in light blue while the event runs. The whole row is one link to the
	conference's programme on that day. It is an `<li>`, so the section puts
	these rows inside a `<ul>`. Below `sm` the time sits above the title.
-->
<li>
	<a
		href={row.href}
		class="flex min-h-13 flex-col gap-0.5 border-b border-border px-1 py-2 transition-colors duration-150 hover:bg-accent sm:flex-row sm:items-center sm:gap-4"
	>
		<p class="shrink-0 text-small text-muted-foreground tabular-nums {timeColumnClass}">
			{row.when}
		</p>

		<!-- `min-w-0` lets a long title wrap instead of pushing "Now" off the row. -->
		<div class="min-w-0 flex-1">
			<p class="text-dense font-medium text-foreground">{row.title}</p>

			{#if row.meta !== null}
				<p class="text-small text-muted-foreground">{row.meta}</p>
			{/if}
		</div>

		{#if row.isNow}
			<span class="shrink-0"><StatusDot text="Now" tone="brand" /></span>
		{/if}
	</a>
</li>

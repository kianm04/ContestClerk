<script lang="ts">
	import ChevronRight from 'carbon-icons-svelte/lib/ChevronRight.svelte';
	import { HERO_ATTENTION_ROWS } from '$lib/organiser-start';
	import HeroPictureFigures from './HeroPictureFigures.svelte';
</script>

<!--
	The drawn dashboard card: the conference's name and state, the four things
	that need attention, and the strip of running totals along the bottom. It
	is part of a picture, so nothing in it can be pressed: the chevrons only
	show that a real row would open something.

	`{#each}` draws one row per item in the list. The `(row.sentence)` after it
	is the row's key, which tells Svelte which row is which; every sentence is
	different, so it can serve.
-->
<div class="overflow-hidden rounded-xl bg-surface shadow-card">
	<div class="flex items-start justify-between gap-4 border-b border-neutral-100 px-5 py-4">
		<div class="flex min-w-0 flex-col">
			<span class="font-display text-[1.25rem]/[1.75rem] font-semibold">Northbridge MUN 2027</span>
			<span class="text-small text-ink-600">Applications open</span>
		</div>
		<span
			class="mt-1 flex-none rounded-full bg-success-100 px-2.5 py-0.5 text-caption font-medium text-success-700"
		>
			Published
		</span>
	</div>

	<div class="px-5 pt-3.5 pb-1.5 text-caption font-medium text-ink-600">Needs attention</div>

	<div class="flex flex-col divide-y divide-neutral-100 px-5">
		{#each HERO_ATTENTION_ROWS as row (row.sentence)}
			<div class="flex min-h-[3.625rem] items-center gap-3.5 py-2">
				<span
					class="w-9 flex-none text-right text-[1.375rem]/[1.75rem] font-semibold text-brand-700 tabular-nums"
				>
					{row.count}
				</span>
				<div class="flex min-w-0 flex-1 flex-col">
					<span class="text-dense font-medium">{row.sentence}</span>
					<span class="text-caption text-ink-600">{row.detail}</span>
				</div>
				<ChevronRight size={16} class="flex-none text-ink-600" />
			</div>
		{/each}
	</div>

	<HeroPictureFigures />
</div>

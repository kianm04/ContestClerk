<script lang="ts">
	import Draggable from 'carbon-icons-svelte/lib/Draggable.svelte';
	import { countryName } from '$lib/countries';
	import { flagUrl } from '$lib/media';
	import { ROOM_SPEAKING_TIME, ROOM_WAITING_CODES } from '$lib/organiser-room';
</script>

<!--
	The speakers' list on the drawn chair's console: the five countries
	waiting, in order, each with a drag handle, its place and its flag. On the
	real console the chair drags a row to move it; here the handle is only
	drawn.

	`{#each … (code)}` draws one row per country, keyed by its code, which is
	on the list once.
-->
<div class="flex min-w-0 flex-[1_1_12rem] flex-col bg-surface px-5 pt-3.5 pb-2">
	<span class="flex items-baseline justify-between pb-2 text-caption font-medium text-ink-600">
		Speakers' list
		<span class="font-normal tabular-nums">{ROOM_SPEAKING_TIME} each</span>
	</span>
	<ol class="flex flex-col">
		{#each ROOM_WAITING_CODES as code, index (code)}
			<li class="flex min-h-10 items-center gap-2 border-t border-neutral-100">
				<Draggable size={16} class="-ml-1 shrink-0 text-ink-400" />
				<span class="w-3 text-caption text-ink-600 tabular-nums">{index + 1}</span>
				<img
					src={flagUrl(code, 'sm')}
					alt=""
					class="h-[0.9375rem] w-5 shrink-0 rounded-[2px] object-cover outline-1 -outline-offset-1 outline-ink-900/10"
				/>
				<span>{countryName(code)}</span>
			</li>
		{/each}
	</ol>
</div>

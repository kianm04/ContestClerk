<script lang="ts">
	import { countryName } from '$lib/countries';
	import { flagUrl } from '$lib/media';
	import { ROOM_DELEGATE_CODE, ROOM_PHONE_ROWS, ROOM_WAITING_CODES } from '$lib/organiser-room';

	// The phone has room for the next three countries only.
	const shownCodes = ROOM_WAITING_CODES.slice(0, ROOM_PHONE_ROWS);
</script>

<!--
	The speakers' list on the drawn delegate's phone: the next three countries
	in speaking order, each with its place and flag. The delegate's own country
	is in bold and says "(you)".

	`{#each … (code)}` draws one row per country; the `(code)` is its key, the
	name Svelte knows that row by. A country is on the list once, so its code
	will do.
-->
<div class="mt-3.5 flex flex-col text-caption">
	<span class="pb-1.5 font-medium text-ink-600">Speakers' list</span>
	<ol class="flex flex-col">
		{#each shownCodes as code, index (code)}
			<li class="flex min-h-8 items-center gap-2 border-t border-neutral-100">
				<span class="w-3 text-ink-600 tabular-nums">{index + 1}</span>
				<img
					src={flagUrl(code, 'sm')}
					alt=""
					class="h-[0.9375rem] w-5 rounded-[2px] object-cover outline-1 -outline-offset-1 outline-ink-900/10"
				/>
				<span class={code === ROOM_DELEGATE_CODE ? 'font-semibold' : ''}>
					{countryName(code)}{code === ROOM_DELEGATE_CODE ? ' (you)' : ''}
				</span>
			</li>
		{/each}
	</ol>
</div>

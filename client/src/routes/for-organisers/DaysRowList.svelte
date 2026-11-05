<script lang="ts">
	import { DAYS_ROWS } from '$lib/for-organisers';
</script>

<!--
	What a chair can do in the room, under the drawn screens, in two newspaper
	columns. `columns-[24rem_2]` asks for at most two columns of at least 24rem,
	so a phone gets one; `break-inside-avoid` keeps a row from being split
	between the two. The space under each row is padding rather than a gap,
	because columns have no gap down, and the list's negative bottom margin
	takes the last row's back off.

	`<row.icon />` draws whichever icon component the row holds.
-->
<ul class="mt-12 -mb-6 columns-[24rem_2] gap-x-16">
	{#each DAYS_ROWS as row (row.title)}
		<li class="flex break-inside-avoid gap-3.5 pb-6">
			<row.icon size={20} aria-hidden="true" class="mt-0.5 shrink-0 text-brand-700" />
			<div class="min-w-0">
				<h3 class="text-h3 text-ink-900">{row.title}</h3>
				<p class="mt-0.5 text-small text-ink-600">{row.detail}</p>
			</div>
		</li>
	{/each}
</ul>

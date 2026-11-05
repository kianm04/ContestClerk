<script lang="ts">
	import { HERO_FIGURES } from '$lib/organiser-start';
</script>

<!--
	The strip of four running totals along the bottom of the drawn dashboard.
	The numbers are `tabular-nums` so their digits line up.

	The wide padding on the right keeps the strip clear of the delegate's phone,
	which hangs over this corner. On a desktop the four figures sit in a row; on
	a phone the phone stands over more of the card, so they stack in one column
	on the left. Each figure's label is the `{#each}` key, being different for
	every figure.
-->
<div
	class="grid grid-cols-[auto] justify-start gap-x-5 gap-y-3 border-t border-neutral-100 pt-3.5 pr-[13.25rem] pb-4 pl-5 md:grid-cols-[repeat(4,auto)] md:pr-[6.75rem]"
>
	{#each HERO_FIGURES as figure (figure.label)}
		<div class="flex min-w-0 flex-col">
			<span class="text-caption text-ink-600">{figure.label}</span>
			<span class="text-h3 whitespace-nowrap tabular-nums">{figure.value}</span>
		</div>
	{/each}
</div>

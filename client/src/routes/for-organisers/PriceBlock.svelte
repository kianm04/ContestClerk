<script lang="ts">
	import { PRICE_HEADING, PRICE_LINES, PRICE_NOTE } from '$lib/organiser-close';
</script>

<!--
	What it costs: the section's heading on the left and a short price list on
	the right, on hairlines with the figures right-aligned and tabular, so they
	line up. The two sit side by side where there is room and wrap one under the
	other on a phone, so no breakpoint is needed.

	The section around this block is the page's, and is named by the heading's
	`id="price-title"`. The heading is set in the serif's shape for large type,
	like the page's other section titles: `[font-variation-settings:normal]`
	lets the browser choose it. Price lines have no id, so the `(line.item)` key
	tells Svelte which row is which.
-->
<div class="flex flex-wrap items-start gap-x-16 gap-y-7">
	<div class="min-w-0 flex-[1_1_16rem]">
		<p class="text-label tracking-[0.14em] text-brand-700 uppercase">{PRICE_HEADING.eyebrow}</p>
		<h2
			id="price-title"
			class="mt-2.5 font-display text-h1-mobile font-medium text-balance text-ink-900 [font-variation-settings:normal] md:text-closing"
		>
			{PRICE_HEADING.title}
		</h2>
	</div>

	<div class="min-w-0 flex-[1.7_1_20rem]">
		<dl class="flex flex-col text-body text-ink-900">
			{#each PRICE_LINES as line (line.item)}
				<div
					class="flex items-baseline justify-between gap-6 border-t border-line py-3.5 last:border-b"
				>
					<dt>{line.item}</dt>
					<dd class="flex-none text-base font-semibold tabular-nums">{line.price}</dd>
				</div>
			{/each}
		</dl>
		<p class="mt-4 text-small text-ink-600">{PRICE_NOTE}</p>
	</div>
</div>

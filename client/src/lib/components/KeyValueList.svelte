<script lang="ts">
	import Flag from './Flag.svelte';

	/** One fact: what it is, and what it says. */
	export type KeyValueItem = {
		label: string;
		value: string;
		/** When the fact is a country: its two-letter code, drawn as a flag before the value. */
		countryCode?: string | null;
	};

	type Props = {
		items: KeyValueItem[];
	};

	let { items }: Props = $props();
</script>

<!--
	A description list: `<dt>` is the name of a fact and `<dd>` is the fact
	itself, which is what tells a screen reader the two belong together. The
	grid puts them side by side from the `sm` width up and stacks them below it.
-->
<dl class="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-[10rem_1fr]">
	<!--
		These facts come straight from a prop and have no id of their own, so the
		place in the list is the key. Svelte then updates a row in place when only
		its words change.
	-->
	{#each items as item, index (index)}
		<dt class="text-label text-ink-600 uppercase">{item.label}</dt>
		<!--
			Two classes, and a long email address needs both. `min-w-0` lets this
			grid column be narrower than the text inside it: a grid item may be as
			wide as its widest unbreakable word unless it is told otherwise, which
			is the trap `/styleguide` found once already. `break-words` then breaks
			that word rather than letting it run out past the edge of the card, as
			the profile page's private details did with a long address.
		-->
		<dd class="min-w-0 text-body break-words">
			<!--
				The value already names the country, so a screen reader skips the
				flag rather than reading the name twice. The value is written in both
				branches, rather than once after `{/if}`, because Svelte keeps the
				space between a block and the text after it, and the value would then
				start with a space.
			-->
			{#if item.countryCode}
				<span class="mr-2 inline-flex align-middle" aria-hidden="true"
					><Flag countryCode={item.countryCode} /></span
				>{item.value}
			{:else}
				{item.value}
			{/if}
		</dd>
	{/each}
</dl>

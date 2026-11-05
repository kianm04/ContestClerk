<script lang="ts">
	type Props = {
		/** Short facts about the public page, such as "Banner" and "Using organisation branding". */
		facts: { label: string; value: string }[];
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { facts }: Props = $props();
</script>

<!--
	A description list: each label is a `<dt>`, its value the `<dd>` after it.
	The labels take a 136 design pixel column (`--spacing(34)` is 34 steps of
	four) and every line is 36 tall; a value too long for its line is
	cut short, with the whole of it in `title`.
-->
<dl class="grid min-w-0 flex-1 grid-cols-[--spacing(34)_minmax(0,1fr)] content-start lg:pt-2.5">
	<!-- Keyed by the label, which is unique within one list. -->
	{#each facts as fact (fact.label)}
		<dt class="flex h-9 items-center fs-13 font-semibold text-creation-ink-950">{fact.label}</dt>
		<dd class="flex h-9 min-w-0 items-center fs-14 text-creation-ink-450">
			<span class="truncate" title={fact.value}>{fact.value}</span>
		</dd>
	{/each}
</dl>

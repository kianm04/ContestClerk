<script lang="ts">
	type Props = {
		/** Short facts about one thing, such as "Committees" and "5". */
		facts: { label: string; value: string }[];
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { facts }: Props = $props();
</script>

<!-- A description list: each label is a `<dt>`, its value the `<dd>` after it. -->
<dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
	<!-- Keyed by the label, which is unique within one list. -->
	{#each facts as fact (fact.label)}
		<dt class="text-xs font-semibold">{fact.label}</dt>
		<dd class="text-sm break-words">{fact.value}</dd>
	{/each}
</dl>

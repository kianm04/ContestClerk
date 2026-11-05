<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		/**
		 * What the cell holds, such as "Topics". A phone shows it before the
		 * value, because there is no heading row above it there. From `xl` up the
		 * heading row says it instead, and only a screen reader still hears it.
		 */
		label?: string;
		/** A count, lined up on the right from `xl` up, as a table lines up figures. */
		isNumber?: boolean;
		/** What the cell shows. */
		children: Snippet;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { label, isNumber = false, children }: Props = $props();
</script>

<!--
	One cell of a committee row. On a phone the row is two columns, the drag
	handle and everything else, so `col-start-2` puts each cell under the
	committee's name. From `xl` up the row is the table's eight columns and the
	cell takes the next one along.
-->
<div class="col-start-2 min-w-0 xl:col-start-auto xl:p-3 {isNumber ? 'xl:text-right' : ''}">
	{#if label}
		<!-- `xl:sr-only` hides the words from the screen from `xl` up, but not from a screen reader. -->
		<span class="text-muted-foreground xl:sr-only">{label}</span>
	{/if}
	{@render children()}
</div>

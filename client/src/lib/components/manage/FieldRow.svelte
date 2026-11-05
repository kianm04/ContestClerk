<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		/** How many fields sit side by side once there is room. A phone always stacks them. */
		columns: 2 | 3;
		/** The fields of the row. */
		children: Snippet;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { columns, children }: Props = $props();

	/*
		Each class name is written out in full rather than built from the number,
		because Tailwind only makes the classes it can find written in the source.
	*/
	const COLUMN_CLASSES = {
		2: 'sm:grid-cols-2',
		3: 'sm:grid-cols-3'
	};
</script>

<!--
	Two or three fields side by side inside a `FormSection` (the manage
	redesign's dense forms). A grid with no columns of its own is one column,
	so a phone stacks the fields without a second rule saying so.
-->
<div class="grid gap-x-4 gap-y-5 {COLUMN_CLASSES[columns]}">
	{@render children()}
</div>

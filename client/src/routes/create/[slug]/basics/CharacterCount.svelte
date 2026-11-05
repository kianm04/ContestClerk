<script lang="ts">
	import { COUNTER_CLASSES } from './field-classes';

	type Props = {
		/** How many characters the field holds now. */
		length: number;
		maximum: number;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { length, maximum }: Props = $props();
</script>

<!--
	"28 / 120" in the design's quiet blue-grey. `tabular-nums` keeps the digits
	from dancing as one types.
-->
<span class={COUNTER_CLASSES}>{length} / {maximum}</span>

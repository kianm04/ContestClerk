<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		/** The wide column starts at 30rem, the narrow one at 21.25rem. */
		isWide?: boolean;
		/** The section inside. */
		children: Snippet;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { isWide = false, children }: Props = $props();
</script>

<!--
	One column inside `DashboardColumns`. Both grow to share the spare width;
	`min-w-0` lets a table inside scroll rather than push the page wider.
	Both class lists are written out in full for Tailwind.
-->
<div class={isWide ? 'min-w-0 flex-[1_1_30rem]' : 'max-w-full min-w-0 flex-[1_1_21.25rem]'}>
	<!-- `{@render children()}` draws whatever the page put between the tags. -->
	{@render children()}
</div>

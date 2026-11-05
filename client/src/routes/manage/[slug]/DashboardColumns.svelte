<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		/** Two `DashboardColumn`s: the wide one first, then the narrow one. */
		children: Snippet;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { children }: Props = $props();
</script>

<!--
	Two sections side by side on a wide screen, such as "Waiting for a decision"
	beside "Committees". `flex-wrap` puts the second under the first once the
	two no longer fit, which is what a phone shows.
-->
<div class="flex flex-wrap items-start gap-x-12 gap-y-10">
	<!-- `{@render children()}` draws whatever the page put between the tags. -->
	{@render children()}
</div>

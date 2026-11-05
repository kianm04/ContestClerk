<script lang="ts">
	import type { ResolvedPathname } from '$app/types';

	type Props = {
		/** How many rows the list holds in all, drawn and left out together: "Show all 11". */
		count: number;
		/** This page asked for the whole list. Built with a helper from `$lib/urls.ts`. */
		href: ResolvedPathname;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { count, href }: Props = $props();
</script>

<!--
	"Show all 11" under a list that stopped short. It is a plain link to the same
	page with the list asked for in full, so it works without JavaScript and the
	back button returns to the short list. `min-h-11` keeps it a 44px target on a
	phone; `px-1` lines it up with the rows above, which have the same inset.
-->
<a {href} class="inline-flex min-h-11 items-center px-1 text-small text-link hover:underline">
	Show all {count}
</a>

<script lang="ts">
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import type { ResolvedPathname } from '$app/types';

	type Props = {
		/**
		 * The page one level up. `ResolvedPathname` is the type `resolve()` from
		 * `$app/paths` gives back, so only an address built by a helper in
		 * `$lib/urls.ts` can be passed in.
		 */
		href: ResolvedPathname;
		/** The name of that page, such as "Applications". */
		label: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { href, label }: Props = $props();
</script>

<!--
	The quiet link above the title of a page that belongs to a list, such as
	one application, back to that list. It is 44px tall on a touch screen and
	only as tall as its words from `lg` up, where a mouse points at it.
-->
<a
	{href}
	class="inline-flex min-h-11 items-center gap-1.5 text-small text-muted-foreground hover:text-foreground lg:min-h-0"
>
	<ArrowLeft size={14} strokeWidth={1.75} aria-hidden="true" />
	{label}
</a>

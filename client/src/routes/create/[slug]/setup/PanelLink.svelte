<script lang="ts">
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import type { ResolvedPathname } from '$app/types';
	import { cn } from '$lib/utils';

	type Props = {
		href: ResolvedPathname;
		/** What a screen reader says, because the arrow alone has no words. */
		label: string;
		/** The box where the design draws it narrower or further out, such as `w-4.5`. */
		class?: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { href, label, class: className }: Props = $props();
</script>

<!--
	The blue arrow at the right end of a panel's title row, as the design draws
	it: a 22 pixel chevron that opens the fuller page for that part of the
	conference. 44 pixels square on a phone, so a thumb can hit it.
-->
<a
	{href}
	aria-label={label}
	class={cn(
		'flex size-5.5 shrink-0 items-center justify-center text-creation-blue transition-colors duration-150 hover:text-creation-blue-hover max-lg:size-11',
		className
	)}
>
	<ChevronRight class="size-5.5" aria-hidden="true" />
</a>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	type Props = {
		/** The step's panels, on the left. */
		children: Snippet;
		/** The preview, on the right from a laptop up and under the panels on a phone. */
		aside: Snippet;
		/** The design's width of the left column in pixels, 1015 on the Organisation step. */
		left?: number;
		/** The design's width of the right column in pixels, 529 on the Organisation step. */
		right?: number;
		/** Extra classes for the grid, such as `lg:items-start` or another gap. */
		class?: string;
		/** Extra classes for the left column, whose panels stack with `gap-1.5` unless told otherwise. */
		leftClass?: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	// `children` is whatever the parent writes between the tags; `aside` is a
	// second block the parent names with `{#snippet aside()}`.
	let { children, aside, left = 1015, right = 529, class: className, leftClass }: Props = $props();
</script>

<!--
	The two columns of every creation step, as wide as the designs draw them.
	The widths are proportions (`fr`) rather than pixels, so that a window wider
	than the design's shape spreads them and nothing else; `minmax(0, …)` lets a
	column shrink below its widest word instead of pushing the page wide. The
	padding at the sides is the design's 57 and 56 pixels. `grid-cols-(--…)`
	reads the proportions from the variable `style:` sets below, because a class
	name cannot hold a number that changes per step. The 16 pixels under the
	columns keep the last panel off the footer, which the designs' boards cut
	through. On a phone the columns stack in one.
-->
<div
	class={cn(
		'grid w-full gap-4 px-4 pb-4 lg:grid-cols-(--creation-columns) lg:pr-14 lg:pl-14.25',
		className
	)}
	style:--creation-columns="minmax(0, {left}fr) minmax(0, {right}fr)"
>
	<div class={cn('flex min-w-0 flex-col gap-1.5', leftClass)}>
		{@render children()}
	</div>
	<aside class="flex min-w-0 flex-col">
		{@render aside()}
	</aside>
</div>

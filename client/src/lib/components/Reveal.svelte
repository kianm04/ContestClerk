<script lang="ts">
	import type { Snippet } from 'svelte';
	import { REVEAL_ROOT_MARGIN, isBelowTheFold, prefersReducedMotion } from '$lib/reveal';

	type Props = {
		/** Milliseconds to wait before rising, so one block can follow another. */
		delay?: number;
		/** Layout classes for the block itself, such as a grid column. */
		class?: string;
		/** What is revealed. */
		children: Snippet;
	};

	let { delay = 0, class: className = '', children }: Props = $props();

	// The block's own element. `bind:this` below fills it in once the block is
	// on the page, and `$state` lets the effect notice when that happens.
	let element: HTMLDivElement | undefined = $state();

	// Whether the block is in view. It starts true: on the server, and in a
	// browser without JavaScript, everything is simply on the page.
	let isShown = $state(true);

	// `$effect` runs in the browser once the block is on screen, and is the
	// right place to talk to something outside Svelte, here the browser's
	// `IntersectionObserver`, which calls back when an element scrolls into
	// view. Returning a function tells Svelte how to tidy up afterwards.
	$effect(() => {
		if (element === undefined) {
			return;
		}

		// Somebody who has asked for less motion gets none: the block stays as
		// it was drawn. So does a block already on the first screen, which would
		// only blink if it were hidden and then faded straight back in.
		const reducedMotion = prefersReducedMotion((query) => window.matchMedia(query));
		const elementTop = element.getBoundingClientRect().top;

		if (reducedMotion || !isBelowTheFold(elementTop, window.innerHeight)) {
			return;
		}

		isShown = false;

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					isShown = true;
					// Once is enough: the block stays where it is from now on.
					observer.disconnect();
				}
			},
			{ rootMargin: REVEAL_ROOT_MARGIN }
		);

		observer.observe(element);

		return () => observer.disconnect();
	});
</script>

<!--
	A block of the landing page that fades and rises into view once, as the
	reader scrolls down to it (docs/DESIGN.md, "Motion", the landing page's
	exception).

	`data-reveal` marks every such block, so a browser test can find them.
	`data-shown` is there whenever the block is in view. It is what the items
	inside can watch through `group/reveal`, so a list of rows can arrive one
	after another: see `REVEAL_ITEM_CLASSES` in `$lib/reveal.ts`.

	The `class` attribute takes an array: every string in it is kept, and a
	false or empty one is dropped, which is how `isShown` picks one of two
	looks. `style:transition-delay` writes one CSS property straight onto the
	element.
-->
<div
	bind:this={element}
	data-reveal=""
	data-shown={isShown ? '' : undefined}
	style:transition-delay="{delay}ms"
	class={[
		'group/reveal transition-all duration-500 ease-out motion-reduce:transition-none',
		isShown ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
		className
	]}
>
	{@render children()}
</div>

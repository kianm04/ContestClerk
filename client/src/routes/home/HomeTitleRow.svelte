<script lang="ts">
	import type { HomeLink } from '$lib/home';

	type Props = {
		/** "Good evening, Sofia.", from `greeting` in `$lib/home.ts`. */
		greeting: string;
		/** The one text link at the right, from `titleRowLink` in `$lib/home-hero.ts`, or `null` for none. */
		link: HomeLink | null;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { greeting, link }: Props = $props();
</script>

<!--
	The top of the signed-in home page (`docs/home.md` section 3.1): the
	greeting on the left and at most one text link on the right, on the same
	baseline. The greeting is a `<p>`, not a heading: the page's `<h1>` is the
	conference's name in the panel under it. No date, no sentence, no button.

	On a phone (below `sm`, 640px) the link takes a line of its own under the
	greeting, left-aligned, and grows to the 44px a finger needs; the negative
	margins pull the row back in by most of that growth, so the target is tall
	but the hero under it is not pushed down, and a live day's button stays in
	a phone's first screen. From `sm` up it sits at the right and is as tall as
	its words, so the row stays as short as the greeting.
-->
<div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
	<p class="font-display text-h2 font-medium text-foreground">{greeting}</p>

	{#if link}
		<a
			href={link.href}
			class="inline-flex min-h-11 items-center text-dense font-medium text-link max-sm:-my-2 max-sm:basis-full sm:min-h-0"
		>
			{link.label}
		</a>
	{/if}
</div>

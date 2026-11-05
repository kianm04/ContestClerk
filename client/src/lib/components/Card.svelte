<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { ResolvedPathname } from '$app/types';

	type Props = {
		/**
		 * When given, the whole card becomes a link and lifts on hover.
		 *
		 * `ResolvedPathname` is the type `resolve()` from `$app/paths` returns, so
		 * only an address built by a helper in `$lib/urls.ts` can be passed in. A
		 * hand-written string is refused by the type check.
		 */
		href?: ResolvedPathname;
		/** `tight` is for small tiles such as `Stat`; everything else uses `normal`. */
		padding?: 'normal' | 'tight';
		/**
		 * The contents of the card. A `Snippet` is the markup a page writes
		 * between `<Card>` and `</Card>`; `{@render children()}` below puts it on
		 * the screen. It is Svelte 5's replacement for the old `<slot />`.
		 */
		children: Snippet;
	};

	let { href, padding = 'normal', children }: Props = $props();

	/* The two paddings, in full so that Tailwind can find the class names. The
	   smaller number is the phone size the design system asks for. */
	const PADDING_CLASSES = {
		normal: 'p-4 md:p-6',
		tight: 'p-3 md:p-4'
	};

	// `$derived` works the value out again whenever `padding` changes.
	const paddingClass = $derived(PADDING_CLASSES[padding]);
</script>

<!--
	The same card twice: once as a link, once as a plain box. Svelte has no way
	to change which element it renders without `<svelte:element>`, which
	CLAUDE.md asks us to avoid, and two short blocks read better than one clever
	one.
-->
{#if href}
	<a
		{href}
		class="block rounded-2xl border border-line bg-surface transition-shadow duration-150 hover:shadow-card {paddingClass}"
	>
		{@render children()}
	</a>
{:else}
	<div class="rounded-2xl border border-line bg-surface {paddingClass}">
		{@render children()}
	</div>
{/if}

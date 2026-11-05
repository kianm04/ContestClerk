<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import type { Snippet } from 'svelte';
	// `afterNavigate` runs the function it is given after every navigation from
	// one page to another, once the new page is on screen.
	import { afterNavigate } from '$app/navigation';

	type Props = {
		/** What the button says: the page being shown ("Dashboard"), or "Menu". */
		label: string;
		/** An icon component from `@lucide/svelte`, drawn before the words. */
		icon?: LucideIcon;
		/**
		 * Draws the icon alone, a 44px square, with `label` as its `aria-label`
		 * for a screen reader. The top bar's hamburger uses it: the bar has no room for words,
		 * and no room for the list to push down either, so the open list floats
		 * under the button instead.
		 */
		isIconOnly?: boolean;
		/**
		 * The open list: the markup a page writes between `<SectionMenu>` and
		 * `</SectionMenu>`. `{@render children()}` below puts it on the screen.
		 */
		children: Snippet;
	};

	let { label, icon: Icon, isIconOnly = false, children }: Props = $props();

	// Whether the menu is open. `bind:open` below keeps it and the `<details>`
	// in step both ways: a click on the button changes it, and changing it opens
	// or closes the menu.
	let isOpen = $state(false);

	// The layouts that draw these menus stay on screen while the reader moves
	// from page to page, so a menu opened to pick a page would still be open,
	// covering the new page's first screen. Closing it here after every
	// navigation fixes that. Without JavaScript every link is a full page load,
	// which starts the menu closed anyway.
	afterNavigate(() => {
		isOpen = false;
	});

	/* Written out in full, because Tailwind reads the class names out of this file. */
	const SUMMARY_CLASSES = {
		iconOnly: 'flex size-11 items-center justify-center rounded-control text-ink-600',
		full: 'flex min-h-11 w-full items-center gap-2 rounded-control border border-line bg-surface px-3 text-body text-ink-900'
	};
	const PANEL_CLASSES = {
		iconOnly:
			'absolute left-0 z-10 mt-1 min-w-56 rounded-2xl border border-line bg-surface p-2 shadow-card',
		full: 'mt-2 rounded-2xl border border-line bg-surface p-2'
	};

	const variant = $derived(isIconOnly ? 'iconOnly' : 'full');
</script>

<!--
	A native `<details>`, so it opens, closes and takes the keyboard with no
	JavaScript at all. `group` lets the chevron inside read whether it is open
	(`group-open:`), which also works without JavaScript. Without `isIconOnly`
	the list sits in the page's own flow, so opening it pushes the page down
	rather than covering it.
-->
<details bind:open={isOpen} class="group {isIconOnly ? 'relative' : 'w-full'}">
	<!--
		With `isIconOnly` the button has no words on screen, so `aria-label` gives
		it the name a screen reader says ("Menu").
	-->
	<summary
		aria-label={isIconOnly ? label : undefined}
		class="cursor-pointer hover:bg-neutral-100 {SUMMARY_CLASSES[variant]}"
	>
		{#if Icon}
			<Icon size={24} strokeWidth={1.75} aria-hidden="true" />
		{/if}

		{#if !isIconOnly}
			<span class="flex-1 text-left">{label}</span>
			<ChevronDown
				size={20}
				strokeWidth={1.75}
				aria-hidden="true"
				class="transition-transform group-open:rotate-180"
			/>
		{/if}
	</summary>

	<div class={PANEL_CLASSES[variant]}>
		{@render children()}
	</div>
</details>

<style>
	/*
		Hide the little triangle a browser draws on a `<summary>`. `list-style` is
		enough for Firefox and Chrome; Safari needs its own rule, which Tailwind
		cannot write as a class.
	*/
	summary {
		list-style: none;
	}

	summary::-webkit-details-marker {
		display: none;
	}
</style>

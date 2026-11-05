<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import { creationClasses } from '$lib/creation-classes';
	import IconCircle from './IconCircle.svelte';

	type Props = {
		title: string;
		/** One line under the title. */
		description?: string;
		/** The lucide icon in the pale blue circle beside the title, as every design draws it. */
		icon: LucideIcon;
		/** Buttons or pills at the right of the title, such as "Add committee". */
		actions?: Snippet;
		/** The body under the title, which sets its own distance from it; a panel that is all header leaves it out. */
		children?: Snippet;
		/** The design's padding for this panel when it is not the size's usual, such as `pb-4`, and anything else about the box. */
		class?: string;
		/** Extra classes for the title row, such as a fixed height. */
		headerClass?: string;
		/**
		 * `large` is the panel of the first three steps: a 56 pixel circle and a 24
		 * pixel title. `small` is Setup's: 48 and 22, in a 56 pixel row, with a
		 * 14 pixel line, roomier than the board so the owner can read it.
		 */
		size?: 'large' | 'small';
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let {
		title,
		description,
		icon,
		actions,
		children,
		class: className,
		headerClass,
		size = 'large'
	}: Props = $props();

	/* The design's pixels for the two sizes. Written out in full so Tailwind can find the classes. */
	const SIZES = {
		large: {
			panel: 'pt-4.5 pr-5 pb-5 pl-5',
			header: 'gap-5',
			circle: 'size-14',
			icon: 'size-7',
			title: 'fs-24 lh-30',
			description: 'mt-0.5 fs-16 lh-22',
			words: ''
		},
		small: {
			panel: 'pt-3 pr-5 pb-4 pl-5',
			// The 56 pixel row is for a laptop: on a phone the actions wrap under the title and the row grows.
			header: 'gap-4.5 lg:h-14',
			circle: 'size-12',
			icon: 'size-6',
			title: 'fs-22 lh-28',
			description: 'fs-14 lh-20',
			// On a phone the words stay beside the circle and wrap there
			// (`flex-1` starts them at no width); only the actions drop below.
			words: 'max-lg:flex-1'
		}
	};
	const sizes = $derived(SIZES[size]);
</script>

<!--
	One white panel of a creation step, as the designs draw it: a 12 pixel
	corner, a hairline, a breath of shadow; the pale blue circle, the serif title
	and its one line at the left of the title row, the actions at the right; then
	whatever the step puts under it. `creationClasses` merges the classes so a
	padding passed in replaces the size's own instead of fighting it.
	On a phone the actions may wrap under the title instead of squeezing it.
-->
<section
	class={creationClasses(
		'rounded-xl border border-creation-panel-border bg-white shadow-creation-panel',
		sizes.panel,
		className
	)}
>
	<div
		class={creationClasses(
			'flex items-center max-lg:flex-wrap max-lg:gap-y-2',
			sizes.header,
			headerClass
		)}
	>
		<IconCircle {icon} class={sizes.circle} iconClass={sizes.icon} />
		<div class="min-w-0 {sizes.words}">
			<h2 class="font-display font-bold text-creation-ink-950 {sizes.title}">{title}</h2>
			{#if description}
				<p class="text-creation-ink-350 {sizes.description}">{description}</p>
			{/if}
		</div>
		{#if actions}
			<div
				class="ml-auto flex shrink-0 items-center max-lg:ml-0 max-lg:w-full max-lg:shrink max-lg:flex-wrap"
			>
				{@render actions()}
			</div>
		{/if}
	</div>
	{#if children}
		{@render children()}
	{/if}
</section>

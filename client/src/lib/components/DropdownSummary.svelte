<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Avatar from './Avatar.svelte';

	type Props = {
		/** What the menu is called. With an `icon` it is read by screen readers only. */
		label: string;
		/** An icon component from `@lucide/svelte`, for a menu with no visible words. */
		icon?: LucideIcon;
		/**
		 * A person's picture shown before the words. On a phone the picture stands
		 * in for the words altogether; they are still there for a screen reader.
		 */
		avatar?: { name: string; imagePath?: string | null };
		/**
		 * A bare icon with no border, for a menu repeated on every row of a list,
		 * such as the "⋯" on each seat of the allocation grid. It is 44px square
		 * on a touch screen and 32px from `lg` up, like a `dense-sm` button.
		 */
		isQuiet?: boolean;
	};

	let { label, icon: Icon, avatar, isQuiet = false }: Props = $props();

	/* Both looks written out in full, so Tailwind can find the class names.
	   `$derived` picks one again if `isQuiet` changes. */
	const summaryClasses = $derived(
		isQuiet
			? 'flex size-11 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground lg:size-8'
			: 'flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-border bg-background px-3 text-body text-foreground hover:bg-muted'
	);
</script>

<!-- The clickable part of a native `<details>` menu; `Dropdown` opens and closes it. -->
<summary class={summaryClasses}>
	{#if Icon}
		<Icon size={20} strokeWidth={1.75} aria-hidden="true" />
		<span class="sr-only">{label}</span>
	{:else if avatar}
		<Avatar name={avatar.name} imagePath={avatar.imagePath} size="sm" />
		<!-- `max-md:sr-only` hides the words on a phone but not from a screen reader. -->
		<span class="max-md:sr-only">{label}</span>
		<ChevronDown size={20} strokeWidth={1.75} aria-hidden="true" />
	{:else}
		{label}
		<ChevronDown size={20} strokeWidth={1.75} aria-hidden="true" />
	{/if}
</summary>

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

<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';
	import { cn } from '$lib/utils';

	type Props = {
		/** A lucide icon, such as `Users`, passed as the component itself rather than drawn. */
		icon: LucideIcon;
		/** The circle's size and colours, such as `size-12` or `bg-creation-red-tint text-creation-red`. */
		class?: string;
		/** The icon's size as a class, such as `size-6` for the 24 pixel icon in a 48 pixel circle. */
		iconClass?: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	// `icon: Icon` renames it on the way in: a component has to be written with
	// a capital letter, `<Icon />`, for Svelte to draw it as one.
	let { icon: Icon, class: className, iconClass }: Props = $props();
</script>

<!--
	The pale blue circle the designs put beside every panel title, 56 pixels
	with a 28 pixel icon unless told otherwise. `cn` merges the classes so a
	`size-12` passed in replaces the `size-14` here instead of fighting it.
	The icon is sized by class rather than lucide's `size`, because a class
	counts in the design's pixels and lucide's number does not.
-->
<span
	aria-hidden="true"
	class={cn(
		'flex size-14 shrink-0 items-center justify-center rounded-full bg-creation-tint text-creation-blue',
		className
	)}
>
	<Icon class={cn('size-7', iconClass)} />
</span>

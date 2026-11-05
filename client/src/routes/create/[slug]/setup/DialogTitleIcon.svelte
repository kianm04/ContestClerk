<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';
	import IconCircle from '$lib/components/creation/IconCircle.svelte';
	import { creationClasses } from '$lib/creation-classes';

	type Props = {
		icon: LucideIcon;
		/** `danger` for a delete, which the designs draw in a pale red circle with a red icon. */
		tone: 'brand' | 'danger';
		/** The circle's size in the design's pixels when not 72, such as `size-16`. */
		class?: string;
		/** The icon's size when not 36, such as `size-8`. */
		iconClass?: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { icon, tone, class: className, iconClass }: Props = $props();
</script>

<!-- The circle above a delete dialog's title, larger than a panel's, and red when the dialog deletes. -->
<IconCircle
	{icon}
	class={creationClasses(
		'size-18',
		tone === 'danger' && 'bg-creation-red-tint text-creation-red-icon',
		className
	)}
	iconClass={creationClasses('size-9', iconClass)}
/>

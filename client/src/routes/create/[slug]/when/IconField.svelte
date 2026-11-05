<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	type Props = {
		/** The lucide icon drawn inside the field's left edge, such as `MapPin`. */
		icon: LucideIcon;
		/** The field itself, written between the tags; give it `pl-12` to clear the icon. */
		children: Snippet;
	};

	// `icon: Icon` renames it on the way in: a component is drawn with a capital
	// letter, `<Icon />`. `children` is whatever the parent writes between the tags.
	let { icon: Icon, children }: Props = $props();
</script>

<!--
	A field with the design's 20 pixel grey-blue icon 14 pixels inside its
	left edge, as the venue and timezone fields have it. The icon ignores the
	pointer, so a click on it lands in the field.
-->
<div class="relative">
	<Icon
		class="pointer-events-none absolute top-1/2 left-3.5 z-10 size-5 -translate-y-1/2 text-creation-ink-650"
		aria-hidden="true"
	/>
	{@render children()}
</div>

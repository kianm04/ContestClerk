<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';
	import { quickFilterChipClasses } from '$lib/button-classes';
	import { Button } from '$lib/components/ui/button';
	import type { QuickFilterChip } from '$lib/conference-quick-filters';

	type Props = {
		/** Where the chip goes and whether the results are filtered its way, from `quickFilterChips`. */
		chip: QuickFilterChip;
		/** An icon component from `@lucide/svelte`, drawn before the words. */
		icon: LucideIcon;
	};

	let { chip, icon: Icon }: Props = $props();
</script>

<!--
	One chip in the row under the search box: a shadcn `Button` given an `href`,
	so it is a plain link that works without JavaScript, drawn as the mockup's
	pill by `quickFilterChipClasses`. `aria-current` tells a screen reader which
	chips the results on screen are filtered by, as the light blue fill tells
	the eye.
-->
<Button
	href={chip.href}
	variant="outline"
	aria-current={chip.isActive ? 'true' : undefined}
	class={quickFilterChipClasses(chip.isActive)}
>
	<Icon size={18} strokeWidth={1.75} aria-hidden="true" />
	{chip.label}
</Button>

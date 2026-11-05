<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import IconCircle from '$lib/components/creation/IconCircle.svelte';
	import { creationClasses } from '$lib/creation-classes';

	type Props = {
		title: string;
		description: string;
		icon: LucideIcon;
		/** The design's padding for this panel, such as `pt-3 pr-5 pb-2.75 pl-5`. */
		class?: string;
		/** The size of the line under the title: 15 over 20 on one panel, 14 over 20 on the other. */
		descriptionClass?: string;
		children: Snippet;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { title, description, icon, class: className, descriptionClass, children }: Props = $props();
</script>

<!--
	The two left-hand panels of Launch, as the design draws them. Like the shared
	`CreationPanel` at its small size, but with the Launch board's own header: a
	54 pixel circle 22 pixels from the title, in a 54 pixel row, and a
	description that is 15 or 14 pixels rather than 13. `creationClasses`
	merges the classes so a padding passed in replaces the default.
-->
<section
	class={creationClasses(
		'rounded-xl border border-creation-panel-border bg-white px-4 pt-3 pb-4 shadow-creation-panel lg:px-5',
		className
	)}
>
	<div class="flex items-center gap-5.5 lg:h-13.5">
		<IconCircle {icon} class="size-13.5" iconClass="size-7" />
		<div class="min-w-0">
			<h2 class="font-display fs-22 lh-28 font-bold text-creation-ink-950">{title}</h2>
			<p class={creationClasses('fs-15 lh-20 text-creation-ink-350', descriptionClass)}>
				{description}
			</p>
		</div>
	</div>
	{@render children()}
</section>

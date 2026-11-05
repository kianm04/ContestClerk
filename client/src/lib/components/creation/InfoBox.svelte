<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';
	import Info from '@lucide/svelte/icons/info';
	import { creationClasses } from '$lib/creation-classes';

	type Props = {
		/** `Info` unless the note is about something else, such as `Clock` for opening times. */
		icon?: LucideIcon;
		title: string;
		text: string;
		/** The design's distance above and padding for this note, when not the Organisation step's `pt-4.5 pr-4.5 pb-4.5 pl-5`. */
		class?: string;
		iconClass?: string;
		titleClass?: string;
		/** The sentence's size when not 16 over 24, such as `fs-15 lh-21` on Basics. */
		textClass?: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let {
		icon: Icon = Info,
		title,
		text,
		class: className,
		iconClass,
		titleClass,
		textClass
	}: Props = $props();
</script>

<!--
	The pale blue note at the foot of the preview column in every design: a 26
	pixel blue icon, a bold blue title and a blue-grey sentence, in a 10 pixel
	corner. `creationClasses` merges the classes so a size passed in replaces the
	default instead of fighting it.
-->
<div
	class={creationClasses(
		'flex gap-4 rounded-lg bg-creation-note pt-4.5 pr-4.5 pb-4.5 pl-5',
		className
	)}
>
	<Icon
		class={creationClasses('mt-0.5 size-6.5 shrink-0 text-creation-blue', iconClass)}
		aria-hidden="true"
	/>
	<div class="min-w-0">
		<p class={creationClasses('fs-17 lh-24 font-semibold text-creation-blue-text', titleClass)}>
			{title}
		</p>
		<p class={creationClasses('fs-16 lh-24 text-creation-ink-375', textClass)}>{text}</p>
	</div>
</div>

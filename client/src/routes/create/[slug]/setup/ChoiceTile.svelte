<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';
	import RadioItem from './RadioItem.svelte';

	type Props = {
		value: string;
		label: string;
		description: string;
		icon: LucideIcon;
		/**
		 * `type` is a fee type card: 118 pixels, the dot and the icon on one
		 * line, the words under the icon. `collection` is a payment card: 79
		 * pixels, the dot, the icon and the words side by side.
		 */
		shape: 'type' | 'collection';
		/** The title's distance from the icon line on a type card, when not 10 pixels. */
		titleClass?: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { value, label, description, icon: Icon, shape, titleClass = 'mt-2.5' }: Props = $props();
</script>

<!--
	A card of the fee dialog: a label round one of shadcn's radio buttons, so
	the whole card picks it and the words name it. The chosen card takes the
	board's 2 pixel blue border and pale fill (`has-[[data-state=checked]]:`
	reads bits-ui's mark on the chosen radio), and loses a pixel of padding so
	the words stay where they were. Inside a `RadioGroup` (`FeeTypeChoice`,
	`FeeCollectionChoice`), which holds the choice and sends it.
-->
<label
	class={[
		'group relative block cursor-pointer rounded-lg border border-creation-input-border bg-white transition-colors duration-150',
		'has-[[data-state=checked]]:border-2 has-[[data-state=checked]]:border-creation-blue-border has-[[data-state=checked]]:bg-creation-selected',
		shape === 'type'
			? 'pt-3 pr-1 pb-2.5 pl-3.5 has-[[data-state=checked]]:pt-2.75 has-[[data-state=checked]]:pl-3.25 lg:h-29.5'
			: 'flex items-start gap-3 pt-3.5 pr-2 pb-3 pl-3.5 has-[[data-state=checked]]:pt-3.25 has-[[data-state=checked]]:pl-3.25 lg:h-19.75'
	]}
>
	{#if shape === 'type'}
		<span class="flex items-center gap-7">
			<RadioItem {value} />
			<Icon class="size-5.5 text-creation-ink-650" aria-hidden="true" />
		</span>
		<span class="ml-11.5 block {titleClass} fs-13 lh-17 font-semibold text-creation-ink-950"
			>{label}</span
		>
		<span class="mt-0.25 ml-11.5 block fs-12.5 lh-16 text-creation-ink-450">{description}</span>
	{:else}
		<RadioItem {value} class="mt-0.25" />
		<Icon class="mt-0.25 size-5.5 shrink-0 text-creation-ink-800" aria-hidden="true" />
		<span class="min-w-0">
			<span class="block fs-14 lh-18 font-semibold text-creation-ink-950">{label}</span>
			<span class="block fs-11.5 lh-16 text-creation-ink-450">{description}</span>
		</span>
	{/if}
</label>

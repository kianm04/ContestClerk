<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';
	import * as Select from '$lib/components/ui/select';
	import { creationClasses } from '$lib/creation-classes';
	import RadioDot from './RadioDot.svelte';

	type Props = {
		/** The trigger's `id`, which the field's label points at. */
		id: string;
		/** The form field the choice is sent as. */
		name: string;
		value: string;
		options: { value: string; label: string }[];
		/** The glyph at the trigger's left; leave it out to draw a filled radio dot instead. */
		icon?: LucideIcon;
		/**
		 * The board's height, left padding and type size for this trigger. The
		 * height is written `data-[size=default]:h-10`, and the size `fs-14!`,
		 * to win over the shadcn trigger's own `h-8` and `text-sm`.
		 */
		class: string;
		/** The help line, and the error when there is one. */
		describedBy?: string;
	};

	// `$bindable()` lets the field write `bind:value`, so what depends on the choice follows it.
	let {
		id,
		name,
		value = $bindable(),
		options,
		icon: Icon,
		class: className,
		describedBy
	}: Props = $props();

	// The words on the closed dropdown, such as "Long answer".
	const selectedLabel = $derived(options.find((option) => option.value === value)?.label ?? '');
</script>

<!--
	shadcn's `Select`: a button that opens a list floating over the dialog.
	`name` puts the choice in a hidden field, so the form sends it like any
	input. The list is drawn outside the dialog, so it carries `creation-root`
	to count its sizes in the design's pixels too. The trigger's own chevron
	is resized to the board's from here (`[&>svg:last-child]`).
-->
<Select.Root type="single" {name} bind:value>
	<Select.Trigger
		{id}
		aria-describedby={describedBy}
		class={creationClasses(
			'relative w-full justify-start gap-0 rounded-md border-creation-input-border bg-white py-0 pr-11 text-creation-ink-950 max-lg:min-h-11 [&>svg:last-child]:absolute [&>svg:last-child]:right-4 [&>svg:last-child]:size-5 [&>svg:last-child]:text-creation-ink-800',
			className
		)}
	>
		{#if Icon}
			<Icon
				class="absolute top-1/2 left-4 size-4.5 -translate-y-1/2 text-creation-ink-800"
				aria-hidden="true"
			/>
		{:else}
			<RadioDot class="absolute top-1/2 left-4 size-4.5 -translate-y-1/2" />
		{/if}
		{selectedLabel}
	</Select.Trigger>
	<Select.Content class="creation-root creation-root-dialog rounded-lg">
		{#each options as option (option.value)}
			<Select.Item
				value={option.value}
				label={option.label}
				class="min-h-10 px-3 fs-14 max-lg:min-h-11"
			/>
		{/each}
	</Select.Content>
</Select.Root>

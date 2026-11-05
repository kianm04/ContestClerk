<script lang="ts">
	import * as Select from '$lib/components/ui/select';
	import { creationClasses } from '$lib/creation-classes';

	/** One choice in the dropdown: the value is sent, the label is read. */
	export type DialogSelectOption = { value: string; label: string };

	type Props = {
		/** The id the field's `<label for>` points at, carried by the button. */
		id: string;
		/** The name the chosen value is sent under, in a hidden input. */
		name: string;
		value: string;
		options: DialogSelectOption[];
		describedBy?: string;
		/** Anything about the button when not the dialogs' 40 pixel field. */
		class?: string;
	};

	// `$bindable()` lets the parent write `bind:value`, so a help line can follow the choice.
	let { id, name, value = $bindable(), options, describedBy, class: className }: Props = $props();

	// The words on the closed dropdown, such as "Advanced".
	const selectedLabel = $derived(options.find((option) => option.value === value)?.label);
</script>

<!--
	shadcn's `Select` drawn as the designs' dropdown field: the 40 pixel box
	with its words in ink and a 20 pixel chevron 14 from the right, and a list
	floating under it in the suggestions' style. `name` makes it send its
	choice with the form in a hidden input. Without JavaScript the button
	cannot open, and the hidden input sends the value the dialog opened with.
-->
<Select.Root type="single" {name} bind:value>
	<Select.Trigger
		{id}
		aria-describedby={describedBy}
		class={creationClasses(
			'w-full gap-3 rounded-md border-creation-input-border bg-white py-0 pr-3.5 pl-3.5 fs-17 lh-24 text-creation-ink-950 focus-visible:border-2 focus-visible:border-creation-blue-focus focus-visible:pl-3.25 focus-visible:ring-0 data-[size=default]:h-10 max-lg:data-[size=default]:min-h-11 [&>svg]:size-5 [&>svg]:text-creation-ink-950',
			className
		)}
	>
		{selectedLabel}
	</Select.Trigger>
	<Select.Content
		class="creation-root creation-root-dialog rounded-lg border border-creation-panel-border bg-white p-1 shadow-creation-menu ring-0"
	>
		{#each options as option (option.value)}
			<Select.Item
				value={option.value}
				label={option.label}
				class="h-7.5 rounded-sm px-3 fs-14 lh-20 text-creation-ink-950 data-highlighted:bg-creation-hover data-highlighted:text-creation-ink-950 max-lg:h-11"
			/>
		{/each}
	</Select.Content>
</Select.Root>

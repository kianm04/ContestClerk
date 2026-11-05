<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';
	import { announceChange } from './announce-change';
	import { DROPDOWN_CLASSES } from './where-fields';

	type Props = {
		/** The hidden field's `name`, and the button's `id`, such as `countryCode`. */
		name: string;
		value: string;
		options: { value: string; label: string }[];
		/** What the button says while nothing is picked, such as "Pick a country". */
		placeholder: string;
		/** What the search box inside says, such as "Search countries". */
		searchLabel: string;
		/** An icon at the button's left, or none. */
		icon?: LucideIcon;
		/** The ids of the error or help line under the field. */
		describedBy?: string;
		isInvalid?: boolean;
		/** Called after the organiser picks an option. */
		onPick?: () => void;
	};

	let {
		name,
		value = $bindable(),
		options,
		placeholder,
		searchLabel,
		icon: Icon,
		describedBy,
		isInvalid = false,
		onPick
	}: Props = $props();

	let isOpen = $state(false);
	let wrapper: HTMLElement | undefined = $state(); // set by `bind:this`
	const pickedLabel = $derived(options.find((option) => option.value === value)?.label ?? '');

	function pick(optionValue: string) {
		value = optionValue;
		isOpen = false;
		onPick?.();
		announceChange(wrapper);
	}
</script>

<!--
	A long list to pick one from, as a 36 pixel dropdown button: shadcn's
	combobox, a `Command` search list inside a `Popover`. Typing in its box
	narrows the list. The form sends the hidden input, so without JavaScript
	the value the page was drawn with is sent. The caller's `<Label>` names
	the button through its `id`.
-->
<div class="mt-1" bind:this={wrapper}>
	<input type="hidden" {name} {value} />
	<Popover.Root bind:open={isOpen}>
		<Popover.Trigger
			id={name}
			aria-describedby={describedBy}
			aria-invalid={isInvalid ? 'true' : undefined}
			class="{DROPDOWN_CLASSES} h-9"
		>
			{#if Icon}
				<Icon class="size-5 shrink-0 text-creation-ink-650" aria-hidden="true" />
			{/if}
			<span class="min-w-0 flex-1 truncate">{pickedLabel || placeholder}</span>
			<ChevronDown class="size-4.5 shrink-0" aria-hidden="true" />
		</Popover.Trigger>
		<Popover.Content align="start" class="w-(--bits-popover-anchor-width) min-w-64 p-0">
			<Command.Root>
				<Command.Input placeholder={searchLabel} aria-label={searchLabel} />
				<Command.List>
					<Command.Empty>Nothing matches.</Command.Empty>
					<!-- `(option.value)` is the key: Svelte uses it to keep each option in its place. -->
					{#each options as option (option.value)}
						<Command.Item
							value={option.label}
							data-checked={option.value === value}
							onSelect={() => pick(option.value)}
							class="fs-15"
						>
							{option.label}
						</Command.Item>
					{/each}
				</Command.List>
			</Command.Root>
		</Popover.Content>
	</Popover.Root>
</div>

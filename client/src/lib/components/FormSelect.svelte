<script lang="ts">
	import { onMount } from 'svelte';
	import * as NativeSelect from '$lib/components/ui/native-select';
	import * as Select from '$lib/components/ui/select';
	import { announceChange } from '$lib/form-change';
	import FormSelectChoice from './FormSelectChoice.svelte';

	/** One choice in the dropdown: the value is sent, the label is read. */
	export type FormSelectOption = {
		value: string;
		label: string;
		/** Grey words after the label, such as a role's scope: "Chair · assigned committees". */
		detail?: string;
	};

	type Props = {
		/** The id a `<label for>` points at, carried by whichever dropdown is on screen. */
		id: string;
		/** The name the chosen value is sent under. */
		name: string;
		/** The value chosen so far, as the page was given it. */
		value: string;
		options: FormSelectOption[];
		/** Layout classes for the box around the dropdown, such as its width. */
		class?: string;
		/**
		 * The words on the dropdown while nothing is chosen, such as "Pick a role".
		 * Without JavaScript it is an empty first choice, which sends `''`.
		 */
		placeholder?: string;
		/** Called with the new value after every pick, for a form that changes with it. */
		onChange?: (value: string) => void;
	};

	let { id, name, value, options, class: className, placeholder, onChange }: Props = $props();

	/*
		The choice picked in the dropdown. A `$derived` can be written to: it holds
		the pick, and starts over from `value` when the page arrives with a new one,
		as it does after "Reset".
	*/
	let selectedValue: string = $derived(value);

	// The choice on the closed dropdown, such as "Netherlands".
	const selectedOption = $derived(options.find((option) => option.value === selectedValue));

	/** One line of the list: the label, then its detail when it has one. */
	function optionText(option: FormSelectOption): string {
		return option.detail ? `${option.label} · ${option.detail}` : option.label;
	}

	/*
		Whether the page has come to life. The server always sends `false`, so
		until then, and in a browser without JavaScript, the browser's own
		dropdown is on screen and is sent with the form. `onMount` only runs in
		the browser, once shadcn's dropdown can open, and then that one takes its
		place. `ApplicationSortSelect` does the same.
	*/
	let isEnhanced = $state(false);

	onMount(() => {
		isEnhanced = true;
	});

	// `bind:this` below puts the box round the dropdown here once it is on the page.
	let wrapper: HTMLDivElement;

	/** Tells the form that the choice changed, as the browser's own dropdown would. */
	function handleValueChange() {
		onChange?.(selectedValue);
		announceChange(wrapper);
	}
</script>

<div bind:this={wrapper} class={className}>
	{#if isEnhanced}
		<!--
			shadcn's `Select`: a button that opens a list floating over the page.
			`name` makes it send its choice with the form in a hidden field. The
			button is 44px tall on a touch screen and 2.25rem from `lg` up, where a
			mouse presses it; `data-[size=default]:` is how its own height is replaced.
		-->
		<Select.Root type="single" {name} bind:value={selectedValue} onValueChange={handleValueChange}>
			<Select.Trigger {id} class="w-full data-[size=default]:h-11 lg:data-[size=default]:h-9">
				{#if selectedOption}
					<FormSelectChoice label={selectedOption.label} detail={selectedOption.detail} />
				{:else if placeholder}
					<span class="text-muted-foreground">{placeholder}</span>
				{/if}
			</Select.Trigger>

			<Select.Content>
				<Select.Group>
					<!-- The `(option.value)` key lets Svelte reuse the lines instead of rebuilding them. -->
					{#each options as option (option.value)}
						<Select.Item
							value={option.value}
							label={optionText(option)}
							class="min-h-11 lg:min-h-8"
						/>
					{/each}
				</Select.Group>
			</Select.Content>
		</Select.Root>
	{:else}
		<!--
			The browser's own dropdown, dressed by shadcn's `NativeSelect`. Its
			`class` lands on the box around the dropdown, so `[&>select]:` reaches in
			for the same heights, and `bg-none` takes away the arrow
			`@tailwindcss/forms` would paint under shadcn's. `selected` marks the
			current choice in the HTML itself, so it shows without JavaScript.
		-->
		<NativeSelect.Root
			{id}
			{name}
			{value}
			class="w-full [&>select]:h-11 [&>select]:bg-none lg:[&>select]:h-9"
		>
			{#if placeholder}
				<NativeSelect.Option value="" selected={value === ''}>{placeholder}</NativeSelect.Option>
			{/if}
			{#each options as option (option.value)}
				<NativeSelect.Option value={option.value} selected={option.value === value}>
					{optionText(option)}
				</NativeSelect.Option>
			{/each}
		</NativeSelect.Root>
	{/if}
</div>

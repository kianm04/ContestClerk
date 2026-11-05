<script lang="ts">
	import { onMount } from 'svelte';
	import { Label } from '$lib/components/ui/label';
	import * as RadioGroup from '$lib/components/ui/radio-group';
	import { DATE_WINDOW_OPTIONS } from '$lib/conferences';
	import { announceChange } from '$lib/form-change';
	import { fieldId } from '$lib/form-fields';
	import { cn } from '$lib/utils';

	type Props = {
		/** How many months ahead the results on screen look, 0 for any time. */
		withinMonths: number;
	};

	let { withinMonths }: Props = $props();

	/*
		The window picked, as the address carries it (`?within=6`). A `$derived`
		can be written to, and starts over from `withinMonths` when the page
		arrives with new filters.
	*/
	let selectedValue: string = $derived(String(withinMonths));

	/*
		Whether the page has come to life. Until then, and in a browser without
		JavaScript, the browser's own radios are on screen and are sent with the
		form; `onMount` only runs in the browser, and then shadcn's take their
		place. `FormSelect` explains the pattern in full.
	*/
	let isEnhanced = $state(false);

	onMount(() => {
		isEnhanced = true;
	});

	// `bind:this` below puts the box round the radios here once it is on the page.
	let group: HTMLDivElement;

	/** Tells the form that the choice changed, as the browser's own radios would. */
	function handleValueChange() {
		announceChange(group);
	}

	/** The id of one radio, which its label points at: `field-within-6`. */
	function radioId(value: number): string {
		return fieldId(`within-${value}`);
	}

	/** The words of one radio darken while it is the one chosen. */
	function labelClasses(value: number): string {
		return cn(
			'cursor-pointer font-normal',
			String(value) === selectedValue ? 'text-foreground' : 'text-muted-foreground'
		);
	}
</script>

<!--
	The "Dates" radios of the filter card, after the mockup (Trello WMcXfry0).
	Each line is 44px tall on a phone, a finger's width, and as tight as the
	mockup draws it from `lg` up. The `(option.value)` keys let Svelte reuse the
	lines instead of rebuilding them.
-->
<div bind:this={group}>
	{#if isEnhanced}
		<!-- shadcn's radios; `name` makes the group send its choice with the form in a hidden field. -->
		<RadioGroup.Root
			name="within"
			bind:value={selectedValue}
			onValueChange={handleValueChange}
			class="gap-0"
		>
			{#each DATE_WINDOW_OPTIONS as option (option.value)}
				<div class="flex min-h-11 items-center gap-2.5 lg:min-h-6">
					<RadioGroup.Item id={radioId(option.value)} value={String(option.value)} />
					<Label for={radioId(option.value)} class={labelClasses(option.value)}
						>{option.label}</Label
					>
				</div>
			{/each}
		</RadioGroup.Root>
	{:else}
		{#each DATE_WINDOW_OPTIONS as option (option.value)}
			<div class="flex min-h-11 items-center gap-2.5 lg:min-h-6">
				<input
					id={radioId(option.value)}
					type="radio"
					name="within"
					value={String(option.value)}
					checked={option.value === withinMonths}
					class="size-4 accent-primary"
				/>
				<Label for={radioId(option.value)} class={labelClasses(option.value)}>{option.label}</Label>
			</div>
		{/each}
	{/if}
</div>

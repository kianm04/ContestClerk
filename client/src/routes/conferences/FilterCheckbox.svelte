<script lang="ts">
	import { onMount } from 'svelte';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';
	import { announceChange } from '$lib/form-change';
	import { fieldId } from '$lib/form-fields';
	import { cn } from '$lib/utils';

	type Props = {
		/** The name sent with the form, which several boxes can share, such as `region`. */
		name: string;
		/** What this box sends under `name` when it is ticked. */
		value: string;
		/** The words beside the box. */
		label: string;
		/** Whether the results on screen were filtered this way. */
		isChecked: boolean;
	};

	let { name, value, label, isChecked }: Props = $props();

	// Several boxes share a `name`, so the id takes the value as well: `field-region-europe`.
	const boxId = $derived(fieldId(`${name}-${value}`));

	/*
		Whether the box is ticked now: the server's answer to begin with, and
		whatever the reader does after that. A `$derived` can be written to, and
		starts over from `isChecked` when the page arrives with new filters.
	*/
	let isCurrentlyChecked: boolean = $derived(isChecked);

	/*
		Whether the page has come to life. The server always sends `false`, so
		until then, and in a browser without JavaScript, the browser's own tick
		box is on screen and is sent with the form. `onMount` only runs in the
		browser, and then shadcn's box takes its place. `FormSelect` does the same.
	*/
	let isEnhanced = $state(false);

	onMount(() => {
		isEnhanced = true;
	});

	// `bind:this` below puts the line's box here once it is on the page.
	let line: HTMLDivElement;

	/** Tells the form that the box changed, as the browser's own would. */
	function handleCheckedChange() {
		announceChange(line);
	}
</script>

<!--
	One tick box of the filter card, after the mockup (Trello WMcXfry0): the box,
	then its words, which darken while it is ticked. A line is 44px tall on a
	phone, a finger's width, and as tight as the mockup draws it from `lg` up.
-->
<div bind:this={line} class="flex min-h-11 items-center gap-2.5 lg:min-h-6">
	{#if isEnhanced}
		<!-- shadcn's tick box; `name` and `value` make it send its tick with the form in a hidden field. -->
		<Checkbox
			id={boxId}
			{name}
			{value}
			bind:checked={isCurrentlyChecked}
			onCheckedChange={handleCheckedChange}
		/>
	{:else}
		<input
			id={boxId}
			type="checkbox"
			{name}
			{value}
			checked={isChecked}
			class="size-4 accent-primary"
		/>
	{/if}

	<Label
		for={boxId}
		class={cn(
			'cursor-pointer font-normal',
			isCurrentlyChecked ? 'text-foreground' : 'text-muted-foreground'
		)}
	>
		{label}
	</Label>
</div>

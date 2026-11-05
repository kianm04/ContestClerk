<script lang="ts">
	import Building from '@lucide/svelte/icons/building';
	import Laptop from '@lucide/svelte/icons/laptop';
	import Monitor from '@lucide/svelte/icons/monitor';
	import * as RadioGroup from '$lib/components/ui/radio-group';
	import type { LocationMode } from '$lib/creation-draft';
	import { announceChange } from './announce-change';

	type Props = {
		/** The format chosen so far: `in_person`, `online` or `hybrid`. */
		locationMode: string;
	};

	let { locationMode = $bindable() }: Props = $props();

	const CHOICES: { value: LocationMode; label: string; icon: typeof Building }[] = [
		{ value: 'in_person', label: 'In person', icon: Building },
		{ value: 'online', label: 'Online', icon: Monitor },
		{ value: 'hybrid', label: 'Hybrid', icon: Laptop }
	];

	let group: HTMLElement | null = $state(null); // set by `bind:ref`
</script>

<!--
	shadcn's `RadioGroup`, drawn as the design's three 150 by 50 boxes, 14
	pixels apart: the chosen one with a 2 pixel blue border on the pale blue
	fill, in semibold blue, the others with a hairline border. Each box is a
	`<label>` around the group's own radio button, which is hidden but keeps
	the keyboard and a screen reader working; pressing the box presses it.
	With a `name` the group keeps a hidden input that sends the format.
-->
<RadioGroup.Root
	name="locationMode"
	aria-label="Format"
	bind:ref={group}
	bind:value={locationMode}
	onValueChange={() => announceChange(group ?? undefined)}
	class="flex gap-3.5 max-lg:w-full max-lg:gap-2"
>
	<!-- `(choice.value)` is the key: Svelte uses it to keep each box in its place. -->
	{#each CHOICES as choice (choice.value)}
		{@const isChosen = locationMode === choice.value}
		<label
			class={[
				'flex h-12.5 w-37.5 cursor-pointer items-center justify-center gap-4 rounded-md fs-17 lh-22 transition-colors duration-150 has-focus-visible:ring-2 has-focus-visible:ring-creation-blue-focus max-lg:w-auto max-lg:min-w-0 max-lg:flex-1 max-lg:gap-1.5 max-lg:fs-15',
				isChosen
					? 'border-2 border-creation-blue-border bg-creation-selected font-semibold text-creation-blue'
					: 'border border-creation-input-border bg-white font-medium text-creation-ink-950 hover:bg-creation-field'
			]}
		>
			<!--
				The radio button itself is only for the keyboard and screen readers.
				The `<span>` hides it rather than a class on the button, because
				shadcn's item keeps its own `relative`, which would leave the hidden
				button in the row and push the icon and words off centre.
			-->
			<span class="sr-only"><RadioGroup.Item value={choice.value} /></span>
			<choice.icon
				class="size-5.5 shrink-0 max-lg:size-5 {isChosen ? '' : 'text-creation-ink-650'}"
				aria-hidden="true"
			/>
			{choice.label}
		</label>
	{/each}
</RadioGroup.Root>

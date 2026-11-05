<script lang="ts">
	import { onMount, tick } from 'svelte';
	import * as NativeSelect from '$lib/components/ui/native-select';
	import * as Select from '$lib/components/ui/select';
	import { APPLICATION_SORTS, type ApplicationSort } from '$lib/my-applications-query';

	type Props = {
		/** The order the cards on screen are in. */
		sort: ApplicationSort;
	};

	let { sort }: Props = $props();

	/*
		The order picked in the dropdown. A `$derived` can be written to: it holds
		the pick, and starts over from `sort` when the page arrives with a new one.
	*/
	let selectedSort: string = $derived(sort);

	// The words on the closed dropdown, such as "Most recent".
	const selectedLabel = $derived(
		APPLICATION_SORTS.find((option) => option.sort === selectedSort)?.label
	);

	/*
		Whether the page has come to life. The server always sends `false`, so
		until then, and in a browser without JavaScript, the browser's own
		dropdown is on screen. `onMount` only runs in the browser, once shadcn's
		dropdown can open, and then that one takes its place.
	*/
	let isEnhanced = $state(false);

	onMount(() => {
		isEnhanced = true;
	});

	// `bind:this` below puts the box round the dropdown here once it is on the page.
	let wrapper: HTMLDivElement;

	/**
	 * Tells the search form that the order changed, as the browser's own dropdown
	 * would. shadcn's dropdown keeps its choice in a hidden field named `sort`
	 * but fires no `change` event, so this fires one that bubbles up to the
	 * form. `tick()` waits until Svelte has written the new choice into that field.
	 */
	async function handleSortChange() {
		await tick();
		wrapper.dispatchEvent(new Event('change', { bubbles: true }));
	}
</script>

<div bind:this={wrapper} class="shrink-0">
	{#if isEnhanced}
		<!--
			shadcn's `Select`: a button that opens a list floating over the page.
			`name` makes it send its choice with the form. `data-[size=default]:h-11`
			replaces the button's own height with the 44px a finger needs.
		-->
		<Select.Root
			type="single"
			name="sort"
			bind:value={selectedSort}
			onValueChange={handleSortChange}
		>
			<Select.Trigger
				aria-label="Sort applications"
				class="w-full data-[size=default]:h-11 sm:w-44"
			>
				{selectedLabel}
			</Select.Trigger>

			<Select.Content>
				<Select.Group>
					<!--
						The `(option.sort)` key lets Svelte reuse list items instead of
						rebuilding them. `min-h-11` makes each one 44px, big enough for a finger.
					-->
					{#each APPLICATION_SORTS as option (option.sort)}
						<Select.Item value={option.sort} label={option.label} class="min-h-11" />
					{/each}
				</Select.Group>
			</Select.Content>
		</Select.Root>
	{:else}
		<!--
			The browser's own dropdown, dressed by shadcn's `NativeSelect`, which
			works inside the form without JavaScript. `selected` marks the current
			order in the HTML itself. Its `class` reaches the box around the
			dropdown, so `[&>select]:` reaches in: `h-11` for 44px, and `bg-none`
			to take away the arrow `@tailwindcss/forms` would paint under shadcn's.
		-->
		<label for="applications-sort" class="sr-only">Sort applications</label>

		<NativeSelect.Root
			id="applications-sort"
			name="sort"
			class="w-full sm:w-44 [&>select]:h-11 [&>select]:bg-none"
		>
			{#each APPLICATION_SORTS as option (option.sort)}
				<NativeSelect.Option value={option.sort} selected={option.sort === sort}>
					{option.label}
				</NativeSelect.Option>
			{/each}
		</NativeSelect.Root>
	{/if}
</div>

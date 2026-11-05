<script lang="ts">
	import { onMount } from 'svelte';
	import { Checkbox } from '$lib/components/ui/checkbox';

	type Props = {
		/** The id the `<Label for>` beside the box points at. */
		id: string;
		/** The name sent with the form, which several boxes can share, such as `roleId`. */
		name: string;
		/** What this box sends under `name` when it is ticked. */
		value: string;
		isChecked: boolean;
		/** A disabled box cannot be changed and sends nothing, ticked or not. */
		isDisabled?: boolean;
		/** Called with the new state after every tick or untick. */
		onChange?: (isChecked: boolean) => void;
	};

	let { id, name, value, isChecked, isDisabled = false, onChange }: Props = $props();

	/*
		Whether the box is ticked now: the server's answer to begin with, and
		whatever the reader does after that. A `$derived` can be written to, and
		starts over from `isChecked` when the page arrives with a new answer.
	*/
	let isCurrentlyChecked: boolean = $derived(isChecked);

	/*
		Whether the page has come to life. Until then, and in a browser without
		JavaScript, the browser's own tick box is on screen and is sent with the
		form; `onMount` only runs in the browser, and then shadcn's box takes its
		place. `FormSelect` explains the pattern in full.
	*/
	let isEnhanced = $state(false);

	onMount(() => {
		isEnhanced = true;
	});

	function handleCheckedChange(isTicked: boolean) {
		onChange?.(isTicked);
	}

	/** The browser's own box tells `onChange` too, in case JavaScript arrives late. */
	function handleNativeChange(event: Event & { currentTarget: HTMLInputElement }) {
		onChange?.(event.currentTarget.checked);
	}
</script>

<!--
	Only the box: the words beside it are the caller's own `<Label for={id}>`,
	since each place lays them out differently.
-->
{#if isEnhanced}
	<!-- shadcn's tick box; `name` and `value` make it send its tick with the form in a hidden field. -->
	<Checkbox
		{id}
		{name}
		{value}
		disabled={isDisabled}
		bind:checked={isCurrentlyChecked}
		onCheckedChange={handleCheckedChange}
	/>
{:else}
	<input
		{id}
		type="checkbox"
		{name}
		{value}
		checked={isChecked}
		disabled={isDisabled}
		onchange={handleNativeChange}
		class="size-4 accent-primary"
	/>
{/if}

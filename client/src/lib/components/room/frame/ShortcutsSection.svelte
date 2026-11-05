<script lang="ts">
	import { onMount } from 'svelte';
	import ShortcutList from './ShortcutList.svelte';

	type Props = {
		/** Whether the console's single-key shortcuts are on in this browser. */
		areShortcutsOn: boolean;
		/** Called when the chair flips the switch. */
		onToggleShortcuts: () => void;
		/** Drawn open, when "?" asked for the list of keys. */
		isOpen: boolean;
	};

	let { areShortcutsOn, onToggleShortcuts, isOpen }: Props = $props();

	/*
		Whether this component is running in the browser. Without JavaScript
		there are no keys to turn off, so the switch and its "On" wait for the
		script. `onMount` only ever runs in the browser.
	*/
	let isScriptRunning = $state(false);
	onMount(() => {
		isScriptRunning = true;
	});

	const stateWord = $derived(areShortcutsOn ? 'On' : 'Off');
</script>

<!--
	"Keyboard shortcuts" in the committee menu: a native `<details>` holding
	the switch and the list of keys. The switch turns the single-character
	keys off for anyone whose speech input or screen reader could set them off
	by accident (WCAG 2.1.4). Its name stays the same and `aria-pressed` says
	whether it is on, which is how a screen reader expects a toggle to work.
-->
<details open={isOpen}>
	<summary
		class="flex min-h-10 cursor-pointer list-none items-center gap-3 rounded-lg px-3 hover:bg-neutral-100 [&::-webkit-details-marker]:hidden"
	>
		Keyboard shortcuts
		{#if isScriptRunning}
			<span class="ml-auto pl-6 text-small text-ink-600">{stateWord}</span>
		{/if}
	</summary>

	{#if isScriptRunning}
		<button
			type="button"
			aria-pressed={areShortcutsOn}
			onclick={onToggleShortcuts}
			class="mx-3 my-1 inline-flex min-h-9 items-center gap-3 rounded-lg border border-line px-3 text-small font-medium hover:bg-neutral-100"
		>
			Use keyboard shortcuts
			<span
				aria-hidden="true"
				class="rounded-md px-1.5 {areShortcutsOn
					? 'bg-brand-100 text-brand-900'
					: 'bg-neutral-100 text-ink-600'}">{stateWord}</span
			>
		</button>
	{/if}
	<ShortcutList />
</details>

<script lang="ts">
	import Search from '@lucide/svelte/icons/search';
	import { CONTROL_CLASSES, fieldId, LARGE_CONTROL_CLASSES } from '$lib/form-fields';

	type Props = {
		/** The name the text is sent under, usually `q`. */
		name: string;
		/** What the server sent back, so the box still shows the current search. */
		value: string;
		placeholder: string;
		/**
		 * Called on every keystroke. The page decides what to do with it, including
		 * waiting for a pause before searching; this component never navigates.
		 */
		oninput?: (event: Event & { currentTarget: HTMLInputElement }) => void;
		/** Called on every key pressed in the box, for a page that acts on Enter itself. */
		onkeydown?: (event: KeyboardEvent & { currentTarget: HTMLInputElement }) => void;
		/** The words a screen reader reads for the box, which has no visible label. */
		label?: string;
		/**
		 * The input's own `id`, when the default would clash. Two boxes with the same
		 * `name` on one page — the top bar's and the conference directory's — would
		 * otherwise both be `field-q`, and a label can only point at one of them.
		 */
		inputId?: string;
		/**
		 * A taller, rounder box, for a page whose search is the first thing on it
		 * (T180; a pill since Trello WMcXfry0).
		 */
		isLarge?: boolean;
	};

	let {
		name,
		value,
		placeholder,
		oninput,
		onkeydown,
		label = 'Search',
		inputId,
		isLarge = false
	}: Props = $props();

	/*
		What the box holds now: the server's value to begin with, and whatever is
		typed after that. `bind:value` rather than writing `value` onto the input
		keeps text typed before Svelte brought the page to life, which
		`$lib/components/TextField.svelte` explains in full.
		`sentValue` counts only a different value as a change, so fresh page data
		carrying the same value does not undo what was chosen; see `TextField`.
	*/
	const sentValue = $derived(value);
	let currentValue = $derived(sentValue);

	// The caller's id when it gave one, and `field-q` when it did not.
	const resolvedInputId = $derived(inputId ?? fieldId(name));

	const controlClasses = $derived(isLarge ? LARGE_CONTROL_CLASSES : CONTROL_CLASSES);

	// The pill's rounder ends need the magnifier, and the text after it, further in.
	const iconInset = $derived(isLarge ? 'left-5' : 'left-3');
	const textInset = $derived(isLarge ? 'pl-13' : 'pl-10');
</script>

<div class="relative">
	<!-- `sr-only` hides the label from the screen but not from a screen reader. -->
	<label for={resolvedInputId} class="sr-only">{label}</label>

	<!-- The magnifier sits inside the box, and `textInset` keeps the text clear of it. -->
	<span class="pointer-events-none absolute inset-y-0 {iconInset} flex items-center text-ink-400">
		<Search size={20} strokeWidth={1.75} aria-hidden="true" />
	</span>

	<input
		id={resolvedInputId}
		{name}
		bind:value={currentValue}
		{placeholder}
		{oninput}
		{onkeydown}
		type="search"
		class="{controlClasses} {textInset}"
	/>
</div>

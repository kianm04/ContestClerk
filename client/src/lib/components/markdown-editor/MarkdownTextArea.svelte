<script lang="ts">
	import { onMount } from 'svelte';

	type Props = {
		/** The name the Markdown is sent under when the form is submitted. */
		name: string;
		/** The Markdown the box holds. */
		value: string;
		/** The id of the element that names the box for a screen reader. */
		labelledBy: string;
		/** Written in the box while it is empty. */
		placeholder: string;
		/** Hidden while the formatted editor shows the same text. A hidden box is still sent. */
		isHidden?: boolean;
		/** Focuses the box when the page loads, which only matters without JavaScript. */
		hasAutofocus?: boolean;
		/** Called with the box's text after every change, and with text typed before the script ran. */
		onInput?: (value: string) => void;
	};

	let {
		name,
		value,
		labelledBy,
		placeholder,
		isHidden = false,
		hasAutofocus = false,
		onInput
	}: Props = $props();

	/*
		What the box holds now: `value` to begin with, and whatever is typed after
		that. `bind:value` rather than writing `value` onto the box keeps text
		typed before Svelte brought the page to life, which
		`$lib/components/TextField.svelte` explains in full.
	*/
	let currentValue = $derived(value);

	// `onMount` runs in the browser once the page's script has started, so this
	// hands up anything typed into the box before it did.
	onMount(() => {
		if (currentValue !== value) onInput?.(currentValue);
	});

	function handleInput(event: Event & { currentTarget: HTMLTextAreaElement }) {
		onInput?.(event.currentTarget.value);
	}

	const BOX_CLASSES =
		'block min-h-48 w-full rounded-control border-0 bg-surface px-3 py-2 font-mono text-body text-ink-900 placeholder:text-ink-400';
</script>

<!--
	The Markdown as plain text. Without JavaScript this is the whole editor, and
	it sits in the same form, so Save sends the same Markdown either way. With
	JavaScript it is the "Markdown" view of the editor.
-->
<!-- `hasAutofocus` is off unless a page asks, as after adding a chair note. -->
<!-- svelte-ignore a11y_autofocus -->
<textarea
	{name}
	rows="8"
	{placeholder}
	aria-labelledby={labelledBy}
	autofocus={hasAutofocus}
	hidden={isHidden}
	bind:value={currentValue}
	oninput={handleInput}
	class={BOX_CLASSES}></textarea>

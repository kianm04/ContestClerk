<script lang="ts">
	import type { Editor } from '@tiptap/core';
	import Button from '$lib/components/Button.svelte';
	import FieldError from '$lib/components/FieldError.svelte';
	import { CONTROL_CLASSES, LABEL_CLASSES } from '$lib/form-fields';
	import { linkAddressFromTyped } from '$lib/markdown';
	import { currentLinkAddress, removeMarkdownLink, setMarkdownLink } from '$lib/markdown-editor';

	type Props = {
		/** The editor whose selected text, or whose link at the cursor, the box links. */
		editor: Editor;
		/** Called when the box is closed without a change. */
		onClose: () => void;
	};

	let { editor, onClose }: Props = $props();

	// `$props.id()` gives this component an id of its own, the same on the server
	// and in the browser, so the label and the message point at this box only.
	const uid = $props.id();
	const inputId = `${uid}-address`;
	const errorId = `${uid}-error`;

	// The address of the link at the cursor when the box opened, or '' for a new link.
	// svelte-ignore state_referenced_locally
	const initialAddress = currentLinkAddress(editor);
	/** What the reader has typed, starting from the link's current address. */
	let typedAddress = $state(initialAddress);
	let errorMessage: string | null = $state(null);

	const REFUSED_ADDRESS = 'Enter a web address, such as www.un.org, or a mailto: address.';

	/*
		Puts the cursor in the address as soon as the box opens, which is what
		pressing "Link" or Ctrl+K is asking for. This `$effect` reads no state, so
		it runs once, after the box is on the page. The `autofocus` attribute is
		not enough: Svelte only honours it when nothing else on the page has the
		focus, and the writing area or the Link button always does here.
	*/
	$effect(() => {
		document.getElementById(inputId)?.focus();
	});

	function handleApply() {
		const address = linkAddressFromTyped(typedAddress);

		if (address === null) {
			errorMessage = REFUSED_ADDRESS;
			return;
		}

		setMarkdownLink(editor, address);
		onClose();
	}

	function handleRemove() {
		removeMarkdownLink(editor);
		onClose();
	}

	/**
	 * Enter adds the link rather than sending the form the editor sits in, and
	 * Escape closes the box, as it does any small box that opens over a page.
	 */
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			handleApply();
		}

		if (event.key === 'Escape') {
			event.preventDefault();
			onClose();
		}
	}
</script>

<!--
	A small box under the toolbar, not a separate window, so the text being
	linked stays in view.
-->
<div
	role="group"
	aria-label="Link"
	class="absolute top-full right-2 left-2 z-10 mt-1 grid gap-3 rounded-control border border-line bg-surface p-3 shadow-lg sm:left-auto sm:w-96"
>
	<div>
		<label for={inputId} class={LABEL_CLASSES}>Link address</label>
		<input
			id={inputId}
			type="text"
			inputmode="url"
			autocomplete="off"
			placeholder="https://www.un.org"
			aria-invalid={errorMessage !== null}
			aria-describedby={errorMessage === null ? undefined : errorId}
			bind:value={typedAddress}
			onkeydown={handleKeydown}
			class={CONTROL_CLASSES}
		/>
		<FieldError id={errorId} message={errorMessage} />
	</div>

	<div class="flex flex-wrap gap-2">
		<Button label="Apply" variant="primary" size="sm" type="button" onclick={handleApply} />
		{#if initialAddress !== ''}
			<Button
				label="Remove link"
				variant="secondary"
				size="sm"
				type="button"
				onclick={handleRemove}
			/>
		{/if}
		<Button label="Cancel" variant="ghost" size="sm" type="button" onclick={onClose} />
	</div>
</div>

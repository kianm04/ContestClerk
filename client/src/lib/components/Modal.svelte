<script lang="ts">
	import type { Snippet } from 'svelte';
	import X from '@lucide/svelte/icons/x';

	type Props = {
		/** Whether the dialog is on screen. The page that opens it owns this. */
		isOpen: boolean;
		title: string;
		/** Called when the reader closes the dialog, by the X, Escape or the backdrop. */
		onClose: () => void;
		children: Snippet;
	};

	let { isOpen, title, onClose, children }: Props = $props();

	/*
		`bind:this` puts the real `<dialog>` element in this variable once Svelte
		has put it on the page. CLAUDE.md asks us to avoid it, and this is the one
		file that needs it: a native dialog is opened and closed by calling methods
		on the element, not by setting an attribute.
	*/
	let dialog: HTMLDialogElement | undefined = $state();

	/*
		`$effect` runs after every change to something it reads, here `isOpen` and
		`dialog`. It is the right tool because it talks to the browser rather than
		to Svelte: `showModal()` is what makes the dialog trap the keyboard, dim
		the page behind it and close on Escape, and there is no way to ask for that
		in markup.
	*/
	$effect(() => {
		if (!dialog) {
			return;
		}

		if (isOpen && !dialog.open) {
			dialog.showModal();
		}

		if (!isOpen && dialog.open) {
			dialog.close();
		}
	});
</script>

<!--
	`onclose` fires however the dialog was closed, Escape included, so the page
	is always told. `backdrop:` is Tailwind's way of styling the dark sheet the
	browser draws behind a modal dialog.

	`m-auto` is what puts the dialog in the middle of the screen. Browsers centre
	a modal dialog with `margin: auto`, but Tailwind's base styles set every
	element's margin to 0, which would pin it to the top-left corner.
-->
<dialog
	bind:this={dialog}
	onclose={onClose}
	aria-label={title}
	class="m-auto w-full max-w-lg rounded-2xl border border-line bg-surface p-0 shadow-card backdrop:bg-ink-900/50"
>
	<div class="p-4 md:p-6">
		<div class="mb-4 flex items-start justify-between gap-4">
			<h2 class="font-display text-h2 text-brand-900">{title}</h2>

			<button
				type="button"
				onclick={onClose}
				aria-label="Close"
				class="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-ink-600 hover:bg-neutral-100"
			>
				<X size={20} strokeWidth={1.75} aria-hidden="true" />
			</button>
		</div>

		{@render children()}
	</div>
</dialog>

<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import TextArea from '$lib/components/TextArea.svelte';
	import { QUICK_SEGMENT_CLASSES } from '$lib/quick-session-classes';

	type Props = {
		/**
		 * Called with the pasted text when "Add these" is pressed with
		 * JavaScript; answers whether the names were added or refused.
		 */
		onAdd: (text: string) => boolean;
		/** Why the last paste was refused, such as more than 300 lines. */
		error?: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { onAdd, error }: Props = $props();

	/*
		Whether the box is open. A refused paste opens it, so its message shows
		even after a page load without JavaScript. A `$derived` may also be
		assigned to, which `handleToggle` and `handleAdd` do; it goes back to
		following `error` whenever the message changes.
	*/
	let isOpen = $derived(error !== undefined);

	/** Keep `isOpen` in step when the reader opens or closes the box themselves. */
	function handleToggle(event: Event & { currentTarget: HTMLDetailsElement }) {
		isOpen = event.currentTarget.open;
	}

	/*
		Without JavaScript "Add these" posts the whole form to `?/paste`. With it
		the click is stopped here: the pasted text is read straight from the
		form's `names` box and added in the browser. Once added, the box is
		emptied and folded away. Setting a box's text from a script does not tell
		Svelte, so an `input` event is sent the way typing would send one.
	*/
	function handleAdd(event: MouseEvent) {
		event.preventDefault();

		const button = event.currentTarget;
		const box =
			button instanceof HTMLButtonElement ? button.form?.elements.namedItem('names') : null;

		if (!(box instanceof HTMLTextAreaElement)) return;
		if (!onAdd(box.value)) return;

		box.value = '';
		box.dispatchEvent(new Event('input', { bubbles: true }));
		isOpen = false;
	}
</script>

<!--
	"Paste a list", the fourth of the segmented buttons. A `<details>` opens
	and closes by itself, without JavaScript. The box hangs under the row of
	buttons, across the column, over the list below; the row is its anchor.
-->
<details open={isOpen} ontoggle={handleToggle}>
	<!-- `in-open:` styles it as the chosen option while its `<details>` is open. -->
	<summary
		class="list-none in-open:border-brand-500 in-open:bg-brand-100 in-open:text-brand-900 [&::-webkit-details-marker]:hidden {QUICK_SEGMENT_CLASSES}"
	>
		Paste a list
	</summary>

	<div
		class="absolute inset-x-0 top-full z-10 mt-2 flex flex-col gap-3 rounded-control border border-line bg-surface p-4 shadow-card"
	>
		<TextArea label="One delegation per line" name="names" value="" rows={6} {error} />
		<div>
			<Button
				label="Add these"
				variant="secondary"
				size="sm"
				formaction="?/paste"
				onclick={handleAdd}
			/>
		</div>
	</div>
</details>

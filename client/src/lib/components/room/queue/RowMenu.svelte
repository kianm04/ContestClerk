<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import { createConsoleMenu, MENU_PANEL_CLASSES } from '$lib/console-menu';
	import MenuItem from '../floor/MenuItem.svelte';

	type Props = {
		/** The waiting entry the menu acts on. */
		entryId: string;
		/** The row's country, which names the menu: "Options for Brazil". */
		seatName: string;
		/** Whether "Speak now" is offered: not for a seat marked absent, nor while the list is off the floor. */
		canSpeakNow: boolean;
		/** First in the queue, so it cannot move up or to the top. */
		isFirst: boolean;
		/** Last in the queue, so it cannot move down. */
		isLast: boolean;
		/** Sends a press through the chair's instant form, which changes the queue at once. */
		onSubmit: SubmitFunction;
	};

	let { entryId, seatName, canSpeakNow, isFirst, isLast, onSubmit }: Props = $props();

	// Closes the menu on a click elsewhere, on Escape and on a press (`$lib/console-menu.ts`).
	const menu = createConsoleMenu();

	/** Fold the menu away at once and hand the press to `onSubmit`, which shows its result. */
	const submitAndClose: SubmitFunction = (input) => {
		menu.close();
		return onSubmit(input);
	};
</script>

<!-- Listeners on the document itself, removed again when the row leaves the page. -->
<svelte:document onclick={menu.handleDocumentClick} onkeydown={menu.handleDocumentKeydown} />

<!--
	A row's "⋯", a native `<details>` whose items are the buttons of one form,
	so it works without JavaScript: there the moves are how the queue is
	reordered. Each item posts to its own action with the entry's id. A move
	that cannot happen is drawn grey rather than left out, so the items keep
	their places. On a screen with a mouse the "⋯" shows only while the row is
	hovered or has the focus (`group-` reads the row's own state).
-->
<details class="relative ml-auto" ontoggle={menu.handleToggle}>
	<summary
		class="flex size-8 cursor-pointer list-none items-center justify-center rounded-lg text-ink-600 group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-neutral-100 max-md:size-11 [&::-webkit-details-marker]:hidden [@media(hover:hover)]:opacity-0 [[open]>&]:opacity-100"
	>
		<Ellipsis size={18} strokeWidth={1.75} aria-hidden="true" />
		<!-- `sr-only` hides the menu's name from the screen but not from a screen reader. -->
		<span class="sr-only">Options for {seatName}</span>
	</summary>

	<form
		method="post"
		use:enhance={submitAndClose}
		class="{MENU_PANEL_CLASSES} top-[calc(100%+6px)] right-0 min-w-48"
	>
		<input type="hidden" name="entryId" value={entryId} />
		{#if canSpeakNow}
			<MenuItem label="Speak now" formaction="?/speakNow" />
		{/if}
		<MenuItem label="Move up" formaction="?/moveUp" isDisabled={isFirst} />
		<MenuItem label="Move down" formaction="?/moveDown" isDisabled={isLast} />
		<MenuItem label="Move to top" formaction="?/moveToTop" isDisabled={isFirst} />
		<div role="separator" class="my-1.5 h-px bg-line"></div>
		<MenuItem label="Remove" formaction="?/remove" />
	</form>
</details>

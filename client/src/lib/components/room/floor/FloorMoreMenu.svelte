<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import type { ResolvedPathname } from '$app/types';
	import { createConsoleMenu, MENU_PANEL_CLASSES } from '$lib/console-menu';
	import MenuItem from './MenuItem.svelte';

	type Props = {
		/** The Notes page open on the speaker's seat. */
		noteHref: ResolvedPathname;
		/** Sends "Reset clock" through the chair's instant form (`$lib/chair-form.ts`). */
		onSubmit: SubmitFunction;
	};

	let { noteHref, onSubmit }: Props = $props();

	// Closes the menu on a click elsewhere, on Escape and on a press (`$lib/console-menu.ts`).
	const menu = createConsoleMenu();

	/** Fold the menu away at once and hand the press to `onSubmit`, which shows its result. */
	const submitAndClose: SubmitFunction = (input) => {
		menu.close();
		return onSubmit(input);
	};
</script>

<!-- Listeners on the document itself, removed again when the menu leaves the page. -->
<svelte:document onclick={menu.handleDocumentClick} onkeydown={menu.handleDocumentKeydown} />

<!--
	The floor's "⋯": what a chair needs now and then, kept out of the row of
	controls. A native `<details>`, so it works without JavaScript, opening
	upward like the Yield menu beside it. "Note on this speech" opens the Notes
	page on the speaker's seat, inside the console's frame.
-->
<details class="relative" ontoggle={menu.handleToggle}>
	<summary
		class="flex size-12 cursor-pointer list-none items-center justify-center rounded-control border border-line bg-surface text-ink-900 hover:bg-neutral-100 max-md:size-11 [&::-webkit-details-marker]:hidden"
	>
		<Ellipsis size={20} strokeWidth={1.75} aria-hidden="true" />
		<!-- `sr-only` hides the menu's name from the screen but not from a screen reader. -->
		<span class="sr-only">More</span>
	</summary>

	<form
		method="post"
		use:enhance={submitAndClose}
		class="{MENU_PANEL_CLASSES} right-0 bottom-[calc(100%+6px)] min-w-56 md:right-auto md:left-0"
	>
		<MenuItem label="Reset clock" formaction="?/timerReset" />
		<MenuItem label="Note on this speech" href={noteHref} />
	</form>
</details>

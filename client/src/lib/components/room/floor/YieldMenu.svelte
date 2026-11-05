<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import type { RoomSeat } from '$lib/committee-room';
	import { createConsoleMenu, MENU_PANEL_CLASSES } from '$lib/console-menu';
	import MenuItem from './MenuItem.svelte';

	type Props = {
		/** The present seats the speaker may yield to, their own left out. */
		seats: RoomSeat[];
		/** Sends the press through the chair's instant form (`$lib/chair-form.ts`). */
		onSubmit: SubmitFunction;
	};

	let { seats, onSubmit }: Props = $props();

	// Closes the menu on a click elsewhere, on Escape and on a press (`$lib/console-menu.ts`).
	const menu = createConsoleMenu();

	/** Fold the menu away at once and hand the press to `onSubmit`, which shows its result. */
	const submitAndClose: SubmitFunction = (input) => {
		menu.close();
		return onSubmit(input);
	};
</script>

<!--
	`<svelte:document>` adds these listeners to the document itself. Svelte
	removes them again when the menu leaves the page.
-->
<svelte:document onclick={menu.handleDocumentClick} onkeydown={menu.handleDocumentKeydown} />

<!--
	"Yield ▾", a native `<details>`, so it opens and closes without JavaScript.
	It opens upward, because the floor's controls sit at the bottom of the
	screen. "To the chair" ends the speech; a seat gets the time left. The
	`[&::-webkit-details-marker]:hidden` class hides the triangle Safari draws.
-->
<details class="relative" ontoggle={menu.handleToggle}>
	<summary
		class="flex h-12 cursor-pointer list-none items-center gap-2 rounded-control border border-line bg-surface px-4 font-medium text-ink-900 hover:bg-neutral-100 max-md:h-11 max-md:px-2 [&::-webkit-details-marker]:hidden"
	>
		Yield
		<ChevronDown size={18} strokeWidth={1.75} aria-hidden="true" />
	</summary>

	<form
		method="post"
		use:enhance={submitAndClose}
		class="{MENU_PANEL_CLASSES} bottom-[calc(100%+6px)] left-0 min-w-56"
	>
		<div class="max-h-80 overflow-auto">
			<MenuItem label="To the chair" meta="ends the speech" formaction="?/yieldToChair" />
			<div role="separator" class="my-1.5 h-px bg-line"></div>
			<p class="px-3 pt-2 pb-1 text-small text-ink-600">To another delegate, with the time left</p>
			<!-- The `(seat.id)` key lets Svelte reuse each item instead of rebuilding it. -->
			{#each seats as seat (seat.id)}
				<MenuItem label={seat.name} formaction="?/yieldToSeat" name="seatId" value={seat.id} />
			{/each}
		</div>
	</form>
</details>

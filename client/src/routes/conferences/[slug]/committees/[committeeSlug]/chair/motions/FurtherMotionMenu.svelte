<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import type { ResolvedPathname } from '$app/types';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import { createConsoleMenu, MENU_PANEL_CLASSES } from '$lib/console-menu';
	import MenuItem from '$lib/components/room/floor/MenuItem.svelte';

	type Props = {
		/** The motion the menu acts on. */
		motionId: string;
		/** `?motion=<id>`, which puts this motion to the vote out of order. */
		voteNowHref: ResolvedPathname;
		/** Sends "Withdraw" through the chair's instant form. */
		onSubmit: SubmitFunction;
	};

	let { motionId, voteNowHref, onSubmit }: Props = $props();

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
	A further motion's "⋯", a native `<details>`, so it opens without
	JavaScript. "Vote on this now" is a plain link to `?motion=<id>`, saying
	that this is out of order (allowed, so in a quiet tone, not a warning);
	"Withdraw" is a button of a small form posting `?/withdraw`.
-->
<details class="relative" ontoggle={menu.handleToggle}>
	<summary
		class="-mt-1 flex size-8 cursor-pointer list-none items-center justify-center rounded-lg text-ink-600 hover:bg-neutral-100 max-md:size-11 [&::-webkit-details-marker]:hidden"
	>
		<Ellipsis size={18} strokeWidth={1.75} aria-hidden="true" />
		<!-- `sr-only` hides the menu's name from the screen but not from a screen reader. -->
		<span class="sr-only">More for this motion</span>
	</summary>

	<div class="{MENU_PANEL_CLASSES} top-[calc(100%+6px)] right-0 min-w-56">
		<a
			href={voteNowHref}
			class="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 whitespace-nowrap text-ink-900 hover:bg-neutral-100 max-md:min-h-11"
		>
			<span>Vote on this now</span>
			<span class="ml-auto pl-6 text-small text-ink-600">out of order</span>
		</a>
		<form method="post" action="?/withdraw" use:enhance={submitAndClose}>
			<input type="hidden" name="motionId" value={motionId} />
			<MenuItem label="Withdraw" formaction="?/withdraw" />
		</form>
	</div>
</details>

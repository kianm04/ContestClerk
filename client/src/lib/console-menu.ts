/**
 * Closing one of the chair console's menus: the floor's Yield and "⋯" menus
 * and the "⋯" menu of each row of the queue column.
 *
 * Each menu is a native `<details>`, so it opens and closes from its own
 * `<summary>` with no JavaScript at all, and its items are the buttons of a
 * real form. What a `<details>` cannot do alone is close when the chair
 * clicks elsewhere, presses Escape or presses one of its items, which a menu
 * is expected to do; `$lib/details-menu.ts` has the first two rules.
 *
 * The menu learns its own element from the `toggle` event the browser fires
 * on a `<details>` as it opens and closes, so a component does not need
 * Svelte's `bind:this` to reach it.
 */

import { closeDetailsOnEscape, closeDetailsOnOutsideClick } from '$lib/details-menu';

/**
 * The look of every console menu's panel, which each menu places itself
 * (above its button, or below and to the right). Written out in full so
 * Tailwind can find the classes. Its items stay on one line each.
 */
export const MENU_PANEL_CLASSES =
	'absolute z-30 rounded-xl border border-line bg-surface p-1.5 whitespace-nowrap shadow-card';

/** The handlers one menu hands to its `<details>` and to the document. */
export type ConsoleMenu = {
	/** For the `<details>` element's `ontoggle`. */
	handleToggle: (event: Event) => void;
	/** For `<svelte:document onclick>`: a click outside the open menu closes it. */
	handleDocumentClick: (event: MouseEvent) => void;
	/** For `<svelte:document onkeydown>`: Escape closes the open menu and puts the focus on its button. */
	handleDocumentKeydown: (event: KeyboardEvent) => void;
	/** Close the menu, as a press on one of its items does. */
	close: () => void;
};

/** Make the closing rules for one menu. Call it once in a component's `<script>`. */
export function createConsoleMenu(): ConsoleMenu {
	// The menu's `<details>` while it is open, or null. A plain variable:
	// nothing is drawn from it.
	let openDetails: HTMLDetailsElement | null = null;

	function handleToggle(event: Event) {
		const details = event.currentTarget;

		if (!(details instanceof HTMLDetailsElement)) return;

		openDetails = details.open ? details : null;
	}

	function handleDocumentClick(event: MouseEvent) {
		closeDetailsOnOutsideClick(openDetails ?? undefined, event);
	}

	function handleDocumentKeydown(event: KeyboardEvent) {
		if (openDetails === null || event.key !== 'Escape') return;

		const details = openDetails;
		const hadFocus = details.contains(document.activeElement);
		closeDetailsOnEscape(details, event);

		// The item that had the focus is hidden now, so the focus goes back to
		// the menu's own button rather than being lost.
		if (hadFocus) details.querySelector('summary')?.focus();
	}

	function close() {
		if (openDetails !== null) openDetails.open = false;
	}

	return { handleToggle, handleDocumentClick, handleDocumentKeydown, close };
}

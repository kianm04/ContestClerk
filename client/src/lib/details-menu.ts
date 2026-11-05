/**
 * Closing rules for a menu built on a native `<details>` element.
 *
 * A `<details>` opens and closes from its own `<summary>` with no JavaScript,
 * which is why the app's menus are built on it. What it cannot do on its own
 * is notice a click that landed somewhere else on the page, or the Escape
 * key: left alone, the menu stays open until its button is pressed again.
 * `Dropdown` and `NotificationBell` listen on the document and hand each
 * event to one of the functions below, which close the menu when they apply.
 *
 * Both take the element as `undefined` as well, because the component gets it
 * from `bind:this` and that is empty until Svelte has put it on the page.
 */

/** Closes an open menu when the click landed outside it. Does nothing otherwise. */
export function closeDetailsOnOutsideClick(
	details: HTMLDetailsElement | undefined,
	event: MouseEvent
): void {
	if (!details || !details.open) {
		return;
	}

	const isInsideMenu = event.target instanceof Node && details.contains(event.target);

	if (isInsideMenu) {
		return;
	}

	details.open = false;
}

/** Closes an open menu on Escape, which is what a person expects of any menu. */
export function closeDetailsOnEscape(
	details: HTMLDetailsElement | undefined,
	event: KeyboardEvent
): void {
	if (!details || !details.open || event.key !== 'Escape') {
		return;
	}

	details.open = false;
}

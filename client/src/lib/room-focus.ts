/**
 * Where the keyboard focus goes when a press on the Room page ends the life
 * of one of its cards (`05-pages/chair/committee-room.md`, "Focus after a
 * card leaves", T160, R12).
 */

import { tick } from 'svelte';

/**
 * Once Svelte has drawn the page again, focus the first of `headingIds` the
 * page shows, so a keyboard or screen reader user is not left on a button
 * that has just vanished. The headings carry `tabindex="-1"`, which lets a
 * script focus them without adding them to the Tab order.
 *
 * `tick()` waits until Svelte has applied the changes a press made, so a card
 * the press brings in is already on the page.
 */
export async function focusHeadingAfterPress(headingIds: string[]): Promise<void> {
	await tick();

	for (const headingId of headingIds) {
		const heading = document.getElementById(headingId);

		if (heading !== null) {
			heading.focus();
			return;
		}
	}
}

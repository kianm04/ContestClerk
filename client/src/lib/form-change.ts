/**
 * Tells the form around a shadcn control that its choice changed.
 *
 * The browser's own controls fire a `change` event that bubbles up to their
 * form, which is how the conference directory's filter form hears every
 * dropdown, radio and tick box at once. shadcn's `Select`, `RadioGroup` and
 * `Checkbox` keep their choice in a hidden field instead and fire no such
 * event, so a control built on them calls this after a change.
 *
 * Nothing here talks to Supabase.
 */

import { tick } from 'svelte';

/**
 * Fire a bubbling `change` event from `element`, once Svelte has written the
 * new choice into the hidden field inside it. `tick()` waits for that write;
 * without it the form would read the field a moment too early and see the old
 * choice.
 */
export async function announceChange(element: HTMLElement): Promise<void> {
	await tick();
	element.dispatchEvent(new Event('change', { bubbles: true }));
}

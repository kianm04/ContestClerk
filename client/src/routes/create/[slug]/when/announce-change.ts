import { tick } from 'svelte';

/**
 * Tell the step form that a dropdown changed a field. The dropdowns write
 * hidden inputs, which send no `input` or `change` event of their own, so
 * the autosave on the `<form>` would never hear of it. `tick()` waits until
 * Svelte has written the new value into the page, then a `change` event is
 * sent from `element` and bubbles up to the form.
 */
export async function announceChange(element: HTMLElement | undefined): Promise<void> {
	await tick();
	element?.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * What a `Button` takes. The props live here rather than inside
 * `Button.svelte`, with every comment that explains them, so the component
 * itself stays under the 150 lines CLAUDE.md allows. `Button.svelte` declares
 * its props with this type.
 */

import type { LucideIcon } from '@lucide/svelte';
import type { ResolvedPathname } from '$app/types';
import type { ButtonSize, ButtonVariant } from '$lib/button-classes';

export type ButtonProps = {
	/** The words on the button. Verb first and specific: "Submit application". */
	label: string;
	variant: ButtonVariant;
	/** `submit` sends the form around the button; `button` only runs `onclick`. */
	type?: 'submit' | 'button';
	size?: ButtonSize;
	/** Stretches the button across whatever holds it, as the auth forms want. */
	isFullWidth?: boolean;
	/**
	 * When given, the button is really a link. Build the address with a helper
	 * from `$lib/urls.ts`; a hand-written string is refused by the type check.
	 */
	href?: ResolvedPathname;
	/** An icon component from `@lucide/svelte`, shown before the words. */
	icon?: LucideIcon;
	/**
	 * Shows the icon after the words instead, for an arrow that says where the
	 * button goes: "Save and continue →", or "View public page" with the
	 * opens-elsewhere arrow.
	 */
	isIconAfterLabel?: boolean;
	/**
	 * Draws the icon alone, with the words becoming the button's `aria-label`.
	 *
	 * The button is still called something — `label` is the one and only name
	 * it has — but nothing of it is laid out, which a visually hidden `<span>`
	 * could not promise. `Dropdown` treats its own `label` the same way. Use it
	 * where the same button repeats down a list and its words would be a wall
	 * of text; the committee editor's seat rows are what it was added for, and
	 * it needs an `icon`, or the button would have nothing to show at all.
	 */
	isLabelHidden?: boolean;
	isDisabled?: boolean;
	/**
	 * While the form is being sent. A press does nothing, and a spinner
	 * appears once the answer has taken longer than `BUSY_INDICATOR_DELAY_MS`
	 * in `$lib/button-classes.ts`, so a quick answer never flashes one (T140).
	 * It is not given the `disabled` attribute: a browser moves
	 * the keyboard focus off a button that becomes disabled, and the reader
	 * who pressed it should find the focus where they left it.
	 */
	isLoading?: boolean;
	/** Sends this one button to another form action, such as `?/delete`. */
	formaction?: string;
	/**
	 * The `id` of the form this button submits, for a button that sits outside
	 * its form. The sticky footer of a setup step (`StepFooter`) is drawn after
	 * the page's form, and its "Save and continue" still sends that form.
	 */
	form?: string;
	/**
	 * Skips the browser's own required-field check when this button submits.
	 *
	 * A form has one set of `required` fields but often several submit
	 * buttons, and a button that does not finish the form — "Back", "Add
	 * topic", "Remove" — must not be blocked by a field the reader has not
	 * reached yet. `routes/create/OrganizationStep.svelte` asks for it on its
	 * "Back" button for exactly that reason.
	 */
	skipsValidation?: boolean;
	/** Sent as `name=value` when this button submits, as each roll call answer is. */
	name?: string;
	value?: string;
	/** The chosen one of a set, for a screen reader (`aria-pressed`). Pair it with `primary`. */
	isPressed?: boolean;
	/**
	 * Focuses the button when the page loads, with or without JavaScript. Only
	 * where the reader sent themselves back and carries on, as in a roll call.
	 */
	hasAutofocus?: boolean;
	/**
	 * The key that presses this button in the chair console, as
	 * `aria-keyshortcuts` names it: "N", "Space" or "Plus" (`$lib/console-keys.ts`).
	 * It sets that attribute, which `ShortcutKeys` looks for and a screen reader
	 * announces, and shows the key over the button's corner on hover and focus
	 * (`Kbd`).
	 */
	keyShortcut?: string;
	onclick?: (event: MouseEvent) => void;
};

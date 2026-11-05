/**
 * What a `ConfirmButton` takes. The props live here rather than inside
 * `ConfirmButton.svelte`, with every comment that explains them, so the
 * component itself stays under the 150 lines CLAUDE.md allows, the way
 * `$lib/button-props.ts` holds `Button`'s. `ConfirmButton.svelte` declares its
 * props with this type.
 */

import type { LucideIcon } from '@lucide/svelte';
import type { SubmitFunction } from '@sveltejs/kit';
import type { Snippet } from 'svelte';
import type { ConfirmVariant } from '$lib/confirmation';

export type ConfirmButtonProps = {
	/** The words on the button, saying what it destroys: "Delete committee". */
	label: string;
	/** The heading of the question: "Delete this committee?" */
	confirmTitle: string;
	/** What will happen, in one sentence, so the reader can weigh it up. */
	confirmText: string;
	/** The form action that does the thing, such as `?/delete`. */
	formaction: string;
	/**
	 * The look of the button. "soft-danger" is a pale red for a button that sits
	 * beside the page's main action and must not outshout it, such as
	 * "Withdraw application". "quiet-danger" is a grey icon that turns red under
	 * the pointer, for the delete on every row of a management list. Either way
	 * the button that answers the question is the loud red "danger" one, because
	 * that press is the one that destroys.
	 */
	variant?: ConfirmVariant | 'soft-danger' | 'quiet-danger';
	/** The size of the button on the page. The dialog's own buttons stay full size. */
	size?: 'md' | 'sm' | 'dense' | 'dense-sm';
	/** An icon drawn alone on the page's button, `label` becoming its `aria-label`. */
	icon?: LucideIcon;
	/**
	 * Fields to send along with the button, shown above it.
	 *
	 * A form cannot sit inside another form, so anything the action needs has
	 * to be inside this component's own form. `/settings` puts its "type
	 * DELETE to confirm" box here.
	 */
	children?: Snippet;
	/**
	 * Show `children` inside the dialog, under the sentence, rather than above
	 * the button. The invoices table on `/manage/[slug]/fees` puts its note box
	 * there, so twenty-five rows do not each carry an empty box. A closed
	 * dialog is still part of the form, so without JavaScript an empty note is
	 * sent along.
	 */
	areFieldsInDialog?: boolean;
	/**
	 * Send the confirmed form through this instead, such as an instant form's
	 * `submit` (`$lib/instant-form.svelte.ts`), whose result the page shows
	 * at once. The dialog then closes the moment the answer is pressed.
	 */
	onSubmit?: SubmitFunction;
};

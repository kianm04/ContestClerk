/**
 * What "Mark as paid", "Waive" and "Void" on the fees page's invoices table
 * change, worked out in the browser so a row's status badge changes the
 * moment its button is pressed rather than only once the server has answered
 * (T142).
 *
 * `InvoicesSection` keeps one instant form (`createInstantForm` in
 * `$lib/instant-form.svelte.ts`) for every row's three buttons. Each press
 * keeps the row's new status as a `RowChange` (`$lib/row-changes.ts`), and the
 * section draws its rows with `rowsAfterPresses(table.rows, form.presses)`.
 */
import type { InstantSubmitInput } from '$lib/instant-form.svelte';
import { INVOICE_ACTIONS, type InvoiceAction, type OrganiserInvoiceRow } from '$lib/invoices';
import { pressedAction, pressedField, type RowChange, type RowPress } from '$lib/row-changes';

/** One press of a row's "Mark as paid", "Waive" or "Void", and the row it changes. */
export type InvoiceActionPress = RowPress<OrganiserInvoiceRow>;

/**
 * The action name a press posted to, or null when it posted to something
 * else. `pressedAction` writes the action as `?/markPaid` or, with the table's
 * filters in front of it, `?status=unpaid&/markPaid`; either way the name
 * itself is everything after the last `/`.
 */
function invoiceActionOf(action: URL): InvoiceAction | null {
	const written = pressedAction(action);
	const name = written.slice(written.lastIndexOf('/') + 1);

	return name in INVOICE_ACTIONS ? (name as InvoiceAction) : null;
}

/**
 * What a press will change: the row named by its hidden `invoiceId` moves to
 * the status the pressed action targets. Null for a press this file does not
 * recognise, which the instant form then leaves unpredicted.
 */
export function expectInvoiceActionChange(
	input: InstantSubmitInput
): RowChange<OrganiserInvoiceRow>[] | null {
	const action = invoiceActionOf(input.action);

	if (action === null) return null;

	const invoiceId = pressedField(input.formData, 'invoiceId');

	return [{ id: invoiceId, changes: { status: INVOICE_ACTIONS[action].target } }];
}

/** What did not happen when a press failed, for its toast. */
export function describeInvoiceActionFailure(press: InvoiceActionPress): string {
	const action = invoiceActionOf(press.action);

	if (action === null) return 'The invoice was not changed.';

	return `The invoice was not ${INVOICE_ACTIONS[action].doneWords}.`;
}

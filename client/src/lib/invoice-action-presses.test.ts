import { describe, expect, it } from 'vitest';
import type { InstantSubmitInput } from '$lib/instant-form.svelte';
import type { OrganiserInvoiceRow } from '$lib/invoices';
import { rowsAfterPresses } from '$lib/row-changes';
import {
	describeInvoiceActionFailure,
	expectInvoiceActionChange,
	type InvoiceActionPress
} from './invoice-action-presses';

/** An unpaid invoice with everything filled in, so each test only changes what it needs. */
function makeInvoice(overrides: Partial<OrganiserInvoiceRow> = {}): OrganiserInvoiceRow {
	return {
		id: 'invoice-1',
		number: 'ROTTERDAMMUN-2026-0001',
		payerName: 'Maria Kowalska',
		payerUserId: 'user-1',
		delegationName: null,
		seatLabel: 'UNSC · France',
		description: 'Delegate fee · Rotterdam Spring MUN 2026',
		quantity: 1,
		unitAmountCents: 6500,
		amountCents: 6500,
		currency: 'EUR',
		platformFeeCents: 0,
		status: 'unpaid',
		paidAt: null,
		paidMethod: null,
		createdAt: '2026-09-01T09:00:00Z',
		note: null,
		...overrides
	};
}

/** A press of `search` naming `invoiceId`, as a filtered table's forms write it. */
function pressInput(search: string, invoiceId: string): InstantSubmitInput {
	const formData = new FormData();
	formData.set('invoiceId', invoiceId);

	return {
		action: new URL(`http://localhost/manage/rotterdam-2026/fees${search}`),
		formData,
		// A stand-in: nothing under test ever reads the real form element, only
		// the action and the fields, and this file's tests run in plain Node,
		// which has no `document` to make a real one from.
		formElement: {} as HTMLFormElement,
		controller: new AbortController(),
		submitter: null,
		cancel: () => undefined
	};
}

/** The press as the instant form keeps it, with its expectation. */
function keptPress(input: InstantSubmitInput): InvoiceActionPress {
	return {
		id: 1,
		formData: input.formData,
		action: input.action,
		expected: expectInvoiceActionChange(input)
	};
}

describe('expectInvoiceActionChange', () => {
	it('marks the invoice paid, leaving the rest alone', () => {
		const paid = makeInvoice({ id: 'row-1' });
		const untouched = makeInvoice({ id: 'row-2' });
		const rows = [paid, untouched];

		const shown = rowsAfterPresses(rows, [keptPress(pressInput('?/markPaid', 'row-1'))]);

		expect(shown[0].status).toBe('paid');
		expect(shown[1].status).toBe('unpaid');
	});

	it('waives the invoice', () => {
		const rows = [makeInvoice({ id: 'row-1' })];

		const shown = rowsAfterPresses(rows, [keptPress(pressInput('?/waive', 'row-1'))]);

		expect(shown[0].status).toBe('waived');
	});

	it('voids the invoice', () => {
		const rows = [makeInvoice({ id: 'row-1' })];

		const shown = rowsAfterPresses(rows, [keptPress(pressInput('?/void', 'row-1'))]);

		expect(shown[0].status).toBe('void');
	});

	it('reads the action from behind a table filter', () => {
		const rows = [makeInvoice({ id: 'row-1' })];

		const shown = rowsAfterPresses(rows, [
			keptPress(pressInput('?status=unpaid&/markPaid', 'row-1'))
		]);

		expect(shown[0].status).toBe('paid');
	});
});

describe('describeInvoiceActionFailure', () => {
	it('names what did not happen for each action', () => {
		expect(describeInvoiceActionFailure(keptPress(pressInput('?/markPaid', 'row-1')))).toBe(
			'The invoice was not marked as paid.'
		);
		expect(describeInvoiceActionFailure(keptPress(pressInput('?/waive', 'row-1')))).toBe(
			'The invoice was not waived.'
		);
		expect(describeInvoiceActionFailure(keptPress(pressInput('?/void', 'row-1')))).toBe(
			'The invoice was not voided.'
		);
	});
});

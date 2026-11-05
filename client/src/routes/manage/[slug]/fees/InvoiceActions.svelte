<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import { CONTROL_CLASSES, LABEL_CLASSES } from '$lib/form-fields';
	import {
		INVOICE_ACTIONS,
		INVOICE_NOTE_MAX_LENGTH,
		availableInvoiceActions,
		type InvoiceAction,
		type InvoiceListQuery,
		type OrganiserInvoiceRow
	} from '$lib/invoices';
	import { manageFeesActionUrl } from '$lib/urls';

	type Props = {
		/** The invoice the buttons act on. */
		invoice: OrganiserInvoiceRow;
		/** The table's filters, so that the page comes back to the same rows afterwards. */
		query: InvoiceListQuery;
		/** The conference's slug, for the address each button posts to. */
		conferenceSlug: string;
		/**
		 * Handed to `ConfirmButton`, which passes it on to `use:enhance` when
		 * present. Given, the invoice's row changes status the moment a button is
		 * confirmed instead of waiting for the server (T142); a note still posts
		 * and reloads the ordinary way, since `ConfirmButton` only reads this prop
		 * for its own submit.
		 */
		onSubmit?: SubmitFunction;
	};

	let { invoice, query, conferenceSlug, onSubmit }: Props = $props();

	// Only the actions this invoice's status allows: an unpaid invoice gets all
	// three, and any other gets none. `$derived` works it out again after every action.
	const actions = $derived(availableInvoiceActions(invoice.status));

	/**
	 * Voiding is the destructive one, drawn in the quieter red a row's
	 * secondary destructive button gets, so a column of rows is not a column of
	 * red blocks (T137). The other two are the management tables' plain buttons.
	 */
	function variantOf(action: InvoiceAction): 'secondary' | 'soft-danger' {
		if (action === 'void') return 'soft-danger';
		return 'secondary';
	}
</script>

<!--
	One `ConfirmButton` per action, each with its own small form, rather than one
	menu: a form cannot sit inside another form, and each of these needs its own.
	The `(action)` key lets Svelte reuse a button rather than rebuild it; the
	action's name is already unique within one row.
	The buttons wrap, and in the table they line up on the right of the row.
-->
<div class="flex flex-wrap gap-2 md:justify-end">
	{#each actions as action (action)}
		<ConfirmButton
			label={INVOICE_ACTIONS[action].label}
			confirmTitle={INVOICE_ACTIONS[action].confirmTitle}
			confirmText={INVOICE_ACTIONS[action].confirmText}
			formaction={manageFeesActionUrl(conferenceSlug, query, action)}
			variant={variantOf(action)}
			size="dense-sm"
			areFieldsInDialog
			{onSubmit}
		>
			<input type="hidden" name="invoiceId" value={invoice.id} />

			<!--
				A bare box wrapped in its label rather than `TextField`, which gives
				every field the id `field-note`: the table and the cards draw this
				box once each for every row, and an id may belong to one element only.
			-->
			{#if INVOICE_ACTIONS[action].takesNote}
				<label class="block">
					<span class={LABEL_CLASSES}>Note for organisers (optional)</span>
					<input
						type="text"
						name="note"
						maxlength={INVOICE_NOTE_MAX_LENGTH}
						class={CONTROL_CLASSES}
					/>
				</label>
			{/if}
		</ConfirmButton>
	{/each}
</div>

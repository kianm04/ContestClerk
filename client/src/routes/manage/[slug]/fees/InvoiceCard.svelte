<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import Card from '$lib/components/Card.svelte';
	import Money from '$lib/components/Money.svelte';
	import StatusDot from '$lib/components/manage/StatusDot.svelte';
	import type { InvoiceListQuery, OrganiserInvoiceRow } from '$lib/invoices';
	import { invoicePaidDetail, invoicePayerDetail } from '$lib/invoices-tab';
	import { statusBadgeTone, statusLabel } from '$lib/status';
	import InvoiceActions from './InvoiceActions.svelte';

	type Props = {
		/** The invoice this card is about. */
		invoice: OrganiserInvoiceRow;
		/** True for the invoice another page linked to, which is outlined. */
		isHighlighted: boolean;
		/** The conference's timezone, so the paid day is the day it was there. */
		timezone: string;
		/** The table's filters, which the buttons carry through their post. */
		query: InvoiceListQuery;
		conferenceSlug: string;
		/** Passed straight through to `InvoiceActions`; see its own prop of the same name. */
		onSubmit?: SubmitFunction;
		/** May the reader settle this invoice? Without it there are no buttons. */
		canManage: boolean;
	};

	let { invoice, isHighlighted, timezone, query, conferenceSlug, onSubmit, canManage }: Props =
		$props();

	/* `$derived` works each of these out again whenever the invoice changes,
	   which is after every action on this page. */
	const statusTone = $derived(statusBadgeTone('invoice_status', invoice.status));
	const statusText = $derived(statusLabel('invoice_status', invoice.status));

	// Quiet lines under the payer, so a narrow card says what the table row
	// says across its columns.
	const payerDetail = $derived(invoicePayerDetail(invoice));
	const paidDetail = $derived(invoicePaidDetail(invoice, timezone));

	// The highlighted invoice is ringed and a void one greyed, as in the table.
	const cardClasses = $derived(
		[
			isHighlighted ? 'rounded-2xl ring-2 ring-ring' : '',
			invoice.status === 'void' ? 'opacity-60' : ''
		].join(' ')
	);
</script>

<div class={cardClasses}>
	<Card padding="tight">
		<div class="flex items-start justify-between gap-3">
			<div class="min-w-0">
				<p class="font-medium text-foreground">{invoice.payerName}</p>
				<p class="text-small text-muted-foreground tabular-nums">{invoice.number}</p>
				{#if payerDetail}
					<p class="text-small text-muted-foreground">{payerDetail}</p>
				{/if}
			</div>

			<div class="flex flex-col items-end gap-1">
				<Money amountCents={invoice.amountCents} currency={invoice.currency} />
				<StatusDot text={statusText} tone={statusTone} />
				{#if paidDetail}
					<p class="text-small text-muted-foreground">{paidDetail}</p>
				{/if}
			</div>
		</div>

		{#if canManage}
			<div class="mt-3">
				<InvoiceActions {invoice} {query} {conferenceSlug} {onSubmit} />
			</div>
		{/if}
	</Card>
</div>

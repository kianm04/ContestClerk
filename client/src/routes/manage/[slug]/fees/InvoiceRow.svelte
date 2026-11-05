<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import Money from '$lib/components/Money.svelte';
	import StatusDot from '$lib/components/manage/StatusDot.svelte';
	import { platformFeeTakenCents } from '$lib/fees';
	import { invoicePaidDetail, invoicePayerDetail } from '$lib/invoices-tab';
	import type { InvoiceListQuery, OrganiserInvoiceRow } from '$lib/invoices';
	import { statusBadgeTone, statusLabel } from '$lib/status';
	import InvoiceActions from './InvoiceActions.svelte';

	type Props = {
		/** The invoice this row is about. */
		invoice: OrganiserInvoiceRow;
		/** True for the invoice another page linked to, which is shaded. */
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
	const payerDetail = $derived(invoicePayerDetail(invoice));
	const paidDetail = $derived(invoicePaidDetail(invoice, timezone));
	// The platform keeps its fee only on a card payment, so any other invoice shows none.
	const platformFeeTaken = $derived(platformFeeTakenCents(invoice));

	// A void invoice is greyed out: it is kept for the record but nobody owes it.
	const rowClasses = $derived(
		[
			'border-b border-border align-top text-dense text-foreground',
			isHighlighted ? 'bg-accent' : '',
			invoice.status === 'void' ? 'opacity-60' : ''
		].join(' ')
	);
</script>

<!-- The number is one unbroken line, because a reference cut in half is hard to read out. -->
<tr class={rowClasses}>
	<td class="p-3 whitespace-nowrap tabular-nums">{invoice.number}</td>
	<td class="p-3">
		<p class="font-medium">{invoice.payerName}</p>
		{#if payerDetail}
			<p class="text-small text-muted-foreground">{payerDetail}</p>
		{/if}
	</td>
	<td class="p-3 text-right">
		<Money amountCents={invoice.amountCents} currency={invoice.currency} />
	</td>
	<td class="p-3"><StatusDot text={statusText} tone={statusTone} /></td>
	<td class="p-3 whitespace-nowrap">
		{paidDetail}
		{#if platformFeeTaken !== null}
			<p class="text-small text-muted-foreground">
				<Money amountCents={platformFeeTaken} currency={invoice.currency} /> platform fee
			</p>
		{/if}
	</td>
	{#if canManage}
		<td class="p-3">
			<InvoiceActions {invoice} {query} {conferenceSlug} {onSubmit} />
		</td>
	{/if}
</tr>

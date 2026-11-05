<script lang="ts">
	import Badge from '$lib/components/Badge.svelte';
	import Money from '$lib/components/Money.svelte';
	import { invoiceDueSentence, isInvoiceOverdue, type MyInvoice } from '$lib/invoices';
	import { statusBadgeTone, statusLabel } from '$lib/status';
	import { invoiceUrl } from '$lib/urls';

	type Props = {
		/** One invoice the reader pays for, their own or their delegation's. */
		invoice: MyInvoice;
		/** The moment the server drew the page, which "overdue" is measured against. */
		now: Date;
	};

	let { invoice, now }: Props = $props();

	// `$derived` works each of these out again whenever `invoice` changes.
	const conference = $derived(invoice.conference);
	const dueSentence = $derived(invoiceDueSentence(invoice.dueAt, conference.timezone));
	const dueClass = $derived(isInvoiceOverdue(invoice, now) ? 'text-danger-700' : '');
</script>

<!--
	One `<tr>` of the desktop table. It is its own component rather than markup
	inside the page, because `DataTable` renders whatever rows it is given and a
	`<tr>` cannot be shared with the phone card beside it. The same invoice is
	drawn by `InvoiceRow` under the `md` width.
-->
<tr class="border-b border-line">
	<td class="px-3 py-3 text-small whitespace-nowrap">{invoice.number}</td>
	<td class="px-3 py-3">{conference.name}</td>
	<td class="px-3 py-3 text-small text-ink-600">{invoice.description}</td>
	<td class="px-3 py-3">
		<Money amountCents={invoice.amountCents} currency={invoice.currency} />
	</td>
	<td class="px-3 py-3 text-small {dueClass}">{dueSentence ?? '—'}</td>
	<td class="px-3 py-3">
		<Badge
			tone={statusBadgeTone('invoice_status', invoice.status)}
			label={statusLabel('invoice_status', invoice.status)}
		/>
	</td>
	<td class="px-3 py-3">
		<!-- A real link, so the table works with no JavaScript. -->
		<a href={invoiceUrl(invoice.id)} class="text-small text-brand-700 hover:underline">View</a>
	</td>
</tr>

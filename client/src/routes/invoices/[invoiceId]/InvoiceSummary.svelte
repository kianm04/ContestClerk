<script lang="ts">
	import Badge from '$lib/components/Badge.svelte';
	import Card from '$lib/components/Card.svelte';
	import KeyValueList, { type KeyValueItem } from '$lib/components/KeyValueList.svelte';
	import {
		invoiceDueSentence,
		type InvoiceConference,
		type InvoiceDetails,
		type InvoiceSeat
	} from '$lib/invoices';
	import { formatMoney } from '$lib/money';
	import { statusBadgeTone, statusLabel } from '$lib/status';

	type Props = {
		invoice: InvoiceDetails;
		conference: InvoiceConference;
		/** The organisation behind the conference, which is who the money goes to. */
		organisationName: string;
		/** The seat an individual invoice was raised for. Absent on a group invoice. */
		seat?: InvoiceSeat;
	};

	let { invoice, conference, organisationName, seat }: Props = $props();

	/**
	 * The facts of the invoice, in the order `05-pages/delegate/invoice.md`
	 * lists them. A fact that does not apply is left out rather than shown empty.
	 *
	 * Amounts are formatted with `formatMoney` rather than drawn with the
	 * `Money` component, because `KeyValueList` takes plain strings.
	 */
	function summaryItems(): KeyValueItem[] {
		const items: KeyValueItem[] = [{ label: 'Description', value: invoice.description }];

		if (seat) {
			items.push({
				label: 'Seat',
				value: `${seat.seatName}, ${seat.committeeName}`,
				countryCode: seat.countryCode
			});
		}

		if (invoice.delegationName) {
			items.push({ label: 'Delegation', value: invoice.delegationName });
		}

		const unit = formatMoney(invoice.unitAmountCents, invoice.currency);

		items.push({ label: 'Quantity', value: `${invoice.quantity} × ${unit}` });
		items.push({ label: 'Total', value: formatMoney(invoice.amountCents, invoice.currency) });

		const dueSentence = invoiceDueSentence(invoice.dueAt, conference.timezone);

		if (dueSentence) {
			items.push({ label: 'Due', value: dueSentence });
		}

		items.push({ label: 'Organisation', value: organisationName });

		return items;
	}

	// `$derived` builds the list again whenever any of the props changes.
	const items = $derived(summaryItems());
</script>

<Card>
	<div class="mb-4 flex items-start justify-between gap-3">
		<p class="text-label text-ink-600 uppercase">{invoice.number}</p>

		<Badge
			tone={statusBadgeTone('invoice_status', invoice.status)}
			label={statusLabel('invoice_status', invoice.status)}
		/>
	</div>

	<KeyValueList {items} />
</Card>

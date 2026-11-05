<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Card from '$lib/components/Card.svelte';
	import Money from '$lib/components/Money.svelte';
	import {
		invoiceDueSentence,
		invoicePaidSentence,
		isInvoiceOverdue,
		type MyInvoice
	} from '$lib/invoices';
	import { statusBadgeTone, statusLabel } from '$lib/status';
	import { invoiceUrl } from '$lib/urls';

	type Props = {
		/** One invoice the reader pays for, their own or their delegation's. */
		invoice: MyInvoice;
		/** The moment the server drew the page, which "overdue" is measured against. */
		now: Date;
	};

	let { invoice, now }: Props = $props();

	// `$derived` works each of these out again whenever `invoice` changes. Every
	// date is read in the conference's own timezone, which is why the sentences
	// are built in `$lib/invoices.ts` rather than here.
	const conference = $derived(invoice.conference);
	const dueSentence = $derived(invoiceDueSentence(invoice.dueAt, conference.timezone));
	const paidSentence = $derived(invoicePaidSentence(invoice, conference.timezone, false));

	// An overdue invoice says so in the danger colour, which is what
	// `05-pages/delegate/invoices.md` asks for. Colour is never the only signal:
	// the words still say when it was due, and the badge still says "Unpaid".
	const dueClass = $derived(isInvoiceOverdue(invoice, now) ? 'text-danger-700' : 'text-ink-600');
</script>

<!-- The whole card is a link to the invoice, so the row works with no JavaScript. -->
<Card href={invoiceUrl(invoice.id)}>
	<div class="flex items-start gap-3">
		<Avatar name={conference.name} imagePath={conference.logoPath} size="sm" />

		<!-- `min-w-0` lets the middle column shrink, so a long name wraps instead of pushing the badge off the card. -->
		<div class="min-w-0 flex-1">
			<p class="text-label text-ink-600 uppercase">{invoice.number}</p>
			<!-- A real heading, so a screen reader can jump from one to the next; an `<h2>` under the page's `<h1>`. -->
			<h2 class="text-h3">{conference.name}</h2>
			<p class="text-small text-ink-600">{invoice.description}</p>

			{#if invoice.delegationName}
				<p class="text-small text-ink-600">{invoice.delegationName}</p>
			{/if}

			<p class="mt-1 flex flex-wrap items-center gap-2 text-small">
				<Money amountCents={invoice.amountCents} currency={invoice.currency} />

				{#if dueSentence}
					<span class={dueClass}>{dueSentence}</span>
				{/if}
			</p>
		</div>

		<!-- `shrink-0` keeps the badge on the card however narrow the screen is. -->
		<div class="flex shrink-0 flex-col items-end gap-1">
			<Badge
				tone={statusBadgeTone('invoice_status', invoice.status)}
				label={statusLabel('invoice_status', invoice.status)}
			/>

			{#if paidSentence}
				<span class="text-small text-ink-600">{paidSentence}</span>
			{/if}
		</div>
	</div>
</Card>

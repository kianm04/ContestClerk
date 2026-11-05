<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { CARD_PAYMENT_NOT_READY, invoiceStateSentence } from '$lib/invoices';
	import { myInvoicesUrl } from '$lib/urls';
	import InvoiceSummary from './InvoiceSummary.svelte';
	import PaymentInstructions from './PaymentInstructions.svelte';
	import type { PageProps } from './$types';

	// `data` is whatever `load` in `+page.server.ts` returned. It is read again
	// every time the URL changes. `PageProps` comes from `./$types`, the types
	// SvelteKit generates for this one route.
	let { data }: PageProps = $props();

	// `$derived` works these out again whenever `data` changes. The state
	// sentence is what an invoice that is no longer unpaid says about itself:
	// the receipt line when it was paid, and one sentence for each of the other
	// three statuses. An unpaid one has nothing to say and gets `null`.
	const conference = $derived(data.invoice.conference);
	const stateSentence = $derived(invoiceStateSentence(data.invoice, conference.timezone));
	const stateTone = $derived(data.invoice.status === 'paid' ? 'success' : 'info');
</script>

<svelte:head>
	<!-- A page only its payer can open writes its own title, rather than using
		`PageMeta`, which asks for a description for a link card. -->
	<title>Invoice {data.invoice.number} · MUNMeet</title>
</svelte:head>

<!-- Two columns at most, so the page keeps to the 880px the page file asks for. -->
<div class="mx-auto max-w-220">
	<a href={myInvoicesUrl()} class="text-small text-brand-700 hover:underline">← Invoices</a>

	<!-- `PageHeader` has no room for a picture, so the conference logo sits beside it. -->
	<div class="mt-2 mb-6 flex items-start gap-4">
		<Avatar name={conference.name} imagePath={conference.logoPath} size="md" />

		<div class="min-w-0 flex-1">
			<PageHeader eyebrow={conference.name} title="Invoice {data.invoice.number}" />
		</div>
	</div>

	<!--
		The summary comes first in the markup, so a phone stacks it above whatever
		the invoice says about paying. From the `lg` width up the two sit side by
		side.
	-->
	<div class="grid items-start gap-6 lg:grid-cols-2">
		<InvoiceSummary
			invoice={data.invoice}
			{conference}
			organisationName={data.organisationName}
			seat={data.seat ?? undefined}
		/>

		<div class="flex flex-col gap-4">
			{#if stateSentence}
				<Notice tone={stateTone}>{stateSentence}</Notice>
			{/if}

			{#if data.paymentSection === 'instructions'}
				<PaymentInstructions paymentInstructions={data.paymentInstructions} />
			{:else if data.paymentSection === 'card-not-ready'}
				<Notice tone="info">{CARD_PAYMENT_NOT_READY}</Notice>
			{/if}
		</div>
	</div>
</div>

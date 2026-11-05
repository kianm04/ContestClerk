<script lang="ts">
	import StatusDot from '$lib/components/manage/StatusDot.svelte';
	import { participantInvoiceLabel, type ParticipantInvoice } from '$lib/participants';
	import { statusBadgeTone } from '$lib/status';

	type Props = {
		/** The invoice the row stands for, or `null` when nobody has been billed. */
		invoice: ParticipantInvoice | null;
	};

	let { invoice }: Props = $props();

	/* `$derived` works these out again whenever the invoice changes. The colours
	   and words are the fees page's own, from `$lib/status`: green for paid,
	   orange for unpaid, grey for waived. */
	const tone = $derived(
		invoice === null ? 'neutral' : statusBadgeTone('invoice_status', invoice.status)
	);
	const label = $derived(participantInvoiceLabel(invoice));
</script>

<!--
	A delegation member without an invoice of their own shows the delegation's,
	and "Group invoice" under it says so.
-->
<StatusDot text={label} {tone} />
{#if invoice?.isGroupInvoice}
	<p class="text-small text-ink-600">Group invoice</p>
{/if}

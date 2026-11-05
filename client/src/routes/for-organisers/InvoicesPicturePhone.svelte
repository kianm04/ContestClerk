<script lang="ts">
	import { PHONE_INVOICE, SAMPLE_CONFERENCE_NAME } from '$lib/organiser-fees';
	import InvoicesPictureStatus from './InvoicesPictureStatus.svelte';
</script>

<!--
	A delegate's phone showing the one invoice still due, hung off the lower
	right corner of the fees card: the number, what it is for, the amount large,
	when it is due and the dark blue button that pays it. The button is drawn as
	a `<span>`, because the picture cannot be pressed.
-->
<div
	class="absolute right-0 bottom-0 flex w-[11.75rem] flex-col rounded-[1.375rem] border border-line bg-surface px-3.5 pt-2 pb-4 shadow-card"
>
	<span class="h-1 w-9 self-center rounded-full bg-line"></span>
	<span class="mt-3 text-caption text-ink-600 tabular-nums">Invoice {PHONE_INVOICE.number}</span>
	<span class="mt-0.5 text-small font-medium">{PHONE_INVOICE.purpose}</span>
	<span class="text-caption text-ink-600">{SAMPLE_CONFERENCE_NAME}</span>
	<span class="mt-2.5 text-[1.75rem]/[2.25rem] font-semibold tabular-nums">
		{PHONE_INVOICE.amount}
	</span>
	<span class="mt-1 self-start">
		<InvoicesPictureStatus status={PHONE_INVOICE.status} tone={PHONE_INVOICE.tone} />
	</span>
	<span
		class="mt-3.5 rounded-[0.375rem] bg-brand-900 px-2 py-[0.5625rem] text-center text-small font-medium whitespace-nowrap text-surface tabular-nums"
	>
		Pay {PHONE_INVOICE.amount} by card
	</span>
</div>

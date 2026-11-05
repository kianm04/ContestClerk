<script lang="ts">
	import type { InvoiceTone } from '$lib/organiser-fees';

	type Props = {
		/** The words in the pill, such as "Paid by card". */
		status: string;
		/** Which colour the pill is drawn in. */
		tone: InvoiceTone;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { status, tone }: Props = $props();

	/* Green is money in, amber is money still to come, grey is neither. Written
	   out in full, because Tailwind reads the class names out of this file and
	   cannot follow a name that is glued together while the page runs. */
	const TONE_CLASSES: Record<InvoiceTone, string> = {
		paid: 'bg-success-100 text-success-700',
		due: 'bg-warning-100 text-warning-700',
		neutral: 'bg-neutral-100 text-ink-600'
	};
</script>

<!--
	An invoice's status in the drawn fees pictures: a small pill in the pastel
	of its state, used in the table's rows and on the delegate's phone.
-->
<span
	class="inline-block rounded-full px-2.5 py-0.5 text-caption font-medium whitespace-nowrap {TONE_CLASSES[
		tone
	]}"
>
	{status}
</span>

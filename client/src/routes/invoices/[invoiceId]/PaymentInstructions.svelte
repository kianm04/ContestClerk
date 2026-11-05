<script lang="ts">
	import Landmark from '@lucide/svelte/icons/landmark';
	import ParagraphText from '$lib/components/ParagraphText.svelte';
	import Section from '$lib/components/Section.svelte';
	import { paymentInstructionsText } from '$lib/invoices';

	type Props = {
		/** The organiser's own instructions, or `null` when they wrote none. */
		paymentInstructions: string | null;
	};

	let { paymentInstructions }: Props = $props();

	// `$derived` works the text out again whenever the prop changes. A conference
	// that left the box empty gets the stand-in sentence from `$lib/invoices.ts`.
	const text = $derived(paymentInstructionsText(paymentInstructions));
</script>

<!-- A `Section` gives the card the same icon-and-title header as the other cards on the dashboards. -->
<Section title="How to pay" icon={Landmark}>
	<ParagraphText {text} />

	<p class="mt-3 text-small text-ink-600">
		Once the organisers receive your payment they will mark this invoice as paid.
	</p>
</Section>

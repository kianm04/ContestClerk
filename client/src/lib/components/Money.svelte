<script lang="ts">
	import { formatMoney } from '$lib/money';

	type Props = {
		/** Whole cents, which is how every amount is stored. 6500 is €65.00. */
		amountCents: number;
		/** A three-letter ISO 4217 code, such as `EUR`. */
		currency: string;
	};

	let { amountCents, currency }: Props = $props();

	// `$derived` formats the amount again whenever it or the currency changes.
	const amount = $derived(formatMoney(amountCents, currency));
</script>

<!-- `tabular-nums` gives every digit the same width, so a column of prices lines up. -->
<span class="whitespace-nowrap tabular-nums">{amount}</span>

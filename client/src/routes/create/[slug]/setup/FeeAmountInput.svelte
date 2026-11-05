<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { formatMoney } from '$lib/money';

	type Props = {
		value: string;
		/** The conference's currency code, such as `EUR`. */
		currency: string;
		/** `aria-describedby`: the help line, and the error when there is one. */
		describedBy: string;
		/** Edit fee draws a 251 pixel box at 17 pixels with no code after the number; Create fee the full width at 14. */
		isLarge?: boolean;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { value, currency, describedBy, isLarge = false }: Props = $props();

	// "€" for EUR: the money format with the digits taken out.
	const symbol = $derived(formatMoney(0, currency).replace(/[\d.,\s]/g, ''));
	const SIDE_CLASSES =
		'flex shrink-0 items-center justify-center bg-creation-field text-creation-ink-450';
</script>

<!-- One bordered group, 43 pixels tall: the symbol, the number, the code. Only the number is a field. -->
<div
	class={[
		'flex h-10.75 overflow-hidden rounded-md border border-creation-input-border bg-white has-focus-visible:ring-2 has-focus-visible:ring-creation-blue max-lg:h-11',
		isLarge && 'lg:w-62.75'
	]}
>
	<span
		aria-hidden="true"
		class={[
			SIDE_CLASSES,
			'border-r border-creation-input-border',
			isLarge ? 'w-11.25 fs-17' : 'w-11.5 fs-15'
		]}
	>
		{symbol}
	</span>
	<Input
		id="amount"
		name="amount"
		type="number"
		step="0.01"
		min="0"
		placeholder="0.00"
		class={[
			'h-full rounded-none border-0 bg-transparent px-4 tabular-nums focus-visible:ring-0',
			isLarge && 'fs-17!'
		]}
		aria-describedby={describedBy}
		{value}
	/>
	{#if !isLarge}
		<span class={[SIDE_CLASSES, 'w-14.25 border-l border-creation-input-border fs-14 font-medium']}>
			{currency}
		</span>
	{/if}
</div>

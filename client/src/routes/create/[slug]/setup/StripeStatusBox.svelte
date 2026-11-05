<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import Check from '@lucide/svelte/icons/check';
	import Info from '@lucide/svelte/icons/info';

	type Props = {
		isStripeConnected: boolean;
		/** The organisation's settings, where Stripe is connected. */
		stripeSettingsUrl: ResolvedPathname;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { isStripeConnected, stripeSettingsUrl }: Props = $props();
</script>

<!-- The board's 70 pixel pale blue row under the collection method: whether Stripe is ready, and a way to it. -->
<div
	class="mt-4.25 flex items-center gap-4.5 rounded-lg bg-creation-note pr-4.25 pl-4.75 max-lg:flex-wrap max-lg:py-3 lg:h-17.5"
>
	{#if isStripeConnected}
		<span
			class="flex size-9 shrink-0 items-center justify-center rounded-full bg-creation-green text-white"
		>
			<Check class="size-5" strokeWidth={3} aria-hidden="true" />
		</span>
	{:else}
		<span
			class="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-creation-blue"
		>
			<Info class="size-5" aria-hidden="true" />
		</span>
	{/if}
	<div class="min-w-0 flex-1">
		<p class="fs-17 lh-22 font-semibold text-creation-ink-950">
			{isStripeConnected ? 'Stripe connected' : 'Stripe not connected'}
		</p>
		<p class="mt-0.5 fs-15 lh-20 text-creation-ink-450">
			{isStripeConnected
				? 'Your organisation is connected to Stripe and can receive payments.'
				: 'Connect Stripe before collecting online payments. You can publish first.'}
		</p>
	</div>
	<a
		href={stripeSettingsUrl}
		class="flex h-11 shrink-0 items-center gap-2 rounded-md border border-creation-input-border bg-white px-3.5 fs-15 font-semibold text-creation-blue transition-colors duration-150 hover:bg-creation-field"
	>
		Manage Stripe
		<ArrowUpRight class="size-4" aria-hidden="true" />
	</a>
</div>

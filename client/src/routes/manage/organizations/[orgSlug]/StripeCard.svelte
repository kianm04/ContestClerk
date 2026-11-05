<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import CreditCard from '@lucide/svelte/icons/credit-card';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import Section from '$lib/components/Section.svelte';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import type { StripeConnectionState } from '$lib/organizations';
	import type { BadgeTone } from '$lib/status';

	type Props = {
		/** How far this organisation has got with Stripe Connect. */
		stripeState: StripeConnectionState;
		/** Owners and admins get the button; a plain member only reads the state. */
		isAdmin: boolean;
		/** False on a server with no Stripe secret key, such as every developer's. */
		isStripeConfigured: boolean;
	};

	// `$props()` takes the values the page passed in.
	let { stripeState, isAdmin, isStripeConfigured }: Props = $props();

	/** The badge for each state. Colour is never the only signal, so it says so too. */
	const BADGES: Record<StripeConnectionState, { tone: BadgeTone; label: string }> = {
		none: { tone: 'neutral', label: 'Not connected' },
		pending: { tone: 'warning', label: 'Setup not finished' },
		connected: { tone: 'success', label: 'Connected' }
	};

	/** The one line under the badge, saying what the state means for this organisation. */
	const DESCRIPTIONS: Record<StripeConnectionState, string> = {
		none: 'Connect a Stripe account to collect delegate fees.',
		pending: 'Stripe still needs a few details before this organisation can be paid.',
		connected: 'Delegate fees go to this organisation’s Stripe account.'
	};

	/** The button for each state: the words on it, and the action it posts to. */
	const BUTTONS: Record<StripeConnectionState, { label: string; action: string }> = {
		none: { label: 'Connect Stripe', action: '?/connectStripe' },
		pending: { label: 'Continue Stripe setup', action: '?/connectStripe' },
		connected: { label: 'Open Stripe dashboard', action: '?/openStripeDashboard' }
	};

	// `$derived` picks each of these again whenever the state changes, which is
	// after somebody has come back from Stripe and `load` has run again.
	const badge = $derived(BADGES[stripeState]);
	const description = $derived(DESCRIPTIONS[stripeState]);
	const button = $derived(BUTTONS[stripeState]);

	/*
		A plain member reads the state and presses nothing. Neither does anybody
		on a server without a Stripe key: the action would only answer "Stripe is
		not configured on this server yet", and a button that can only fail is
		worse than no button at all.
	*/
	const canPress = $derived(isAdmin && isStripeConfigured);

	/*
		Sends the form in the background and redraws the page without reloading
		it (`$lib/in-place-form.svelte.ts`). `use:enhance` in the markup hands
		the form over; without JavaScript it posts and reloads as before. Both
		actions redirect to a Stripe-hosted address on another host entirely, so
		the helper's own "is this really a move?" check always says yes and hands
		the browser on to Stripe with a normal, full navigation.
	*/
	const inPlaceForm = createInPlaceForm();
</script>

<Section
	title="Payments"
	icon={CreditCard}
	description="How this organisation gets paid by delegates."
>
	<div class="flex flex-col items-start gap-3">
		<Badge tone={badge.tone} label={badge.label} />

		<p class="text-body text-ink-600">{description}</p>

		{#if !isStripeConfigured}
			<Notice tone="info">Stripe is not set up on this server yet.</Notice>
		{/if}

		<!-- A real `<form method="post">` of its own, so it works with JavaScript
			switched off. Both actions send the browser on to Stripe itself. -->
		{#if canPress}
			<form method="post" action={button.action} use:enhance={inPlaceForm.submit}>
				<Button label={button.label} variant="primary" isLoading={inPlaceForm.isBusy} />
			</form>
		{/if}
	</div>
</Section>

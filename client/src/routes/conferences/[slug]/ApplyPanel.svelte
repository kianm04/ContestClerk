<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import { applyPanelHeadline, type ApplyPanelState, type Conference } from '$lib/conferences';
	import { statusBadgeTone, statusLabel } from '$lib/status';
	import { applicationUrl, committeeUrl, delegationUrl } from '$lib/urls';
	import TakePartChoices from './TakePartChoices.svelte';

	type Props = {
		/** Which one thing the panel says, decided on the server. */
		state: ApplyPanelState;
		conference: Conference;
		/**
		 * Where "Apply as a delegate" goes.
		 *
		 * The page above decides it rather than this panel, because a reader who
		 * is not signed in goes to the create account page first and only the
		 * page knows whether anybody is signed in.
		 */
		applyHref: ResolvedPathname;
		/**
		 * Where "Register a delegation" goes.
		 *
		 * Decided by the page above for exactly the reason `applyHref` is: the
		 * "signed out and accepting" row of `05-pages/public/conference.md` sends
		 * a reader who is not signed in through the create account page first,
		 * and only the page knows whether anybody is.
		 */
		registerDelegationHref: ResolvedPathname;
		/**
		 * The phone's bottom bar, which shows the headline, the one filled button
		 * and "Register a delegation" as a plain link under it.
		 */
		isCompact?: boolean;
	};

	let { state, conference, applyHref, registerDelegationHref, isCompact = false }: Props = $props();

	/* `$derived` works both of these out again whenever the state changes. */
	const headline = $derived(applyPanelHeadline(state));

	// Where "Go to your committee" goes, and `null` for every state but `seated`,
	// which is what keeps the button out of the other eight.
	const seatHref = $derived(
		state.kind === 'seated' ? committeeUrl(conference.slug, state.seat.committeeSlug) : null
	);
</script>

<!--
	One body, drawn once, so the bar on a phone and the panel on a wide screen can
	never drift apart. `Card` gives both of them their white box: the bar is a card
	floating at the bottom of the screen rather than a strip with a border of its
	own, which is why the page wraps it in nothing but a position and some padding.

	`isCompact` leaves out only the position paper deadline, which is the one line a
	bar has no room for and the only one a visitor can read later. The closing date
	stays, because `05-pages/public/conference.md` asks the bar for the primary
	action and the close date.
-->
<Card>
	<!-- `items-start` keeps a badge at its own width instead of stretched across
		the card; the buttons still fill the width, because they ask for `w-full`. -->
	<div class="flex flex-col items-start gap-3">
		{#if state.kind === 'open'}
			<Badge tone="success" label="Applications open" />
		{:else if state.kind === 'application'}
			<!-- An application of my own leads with its own status, worded and
				coloured by `$lib/status.ts` so that `submitted` reads "Under review"
				here exactly as it does on the application page itself. -->
			<Badge
				tone={statusBadgeTone('application_status', state.status)}
				label={statusLabel('application_status', state.status)}
			/>
		{:else if state.kind === 'delegation'}
			<!-- `05-pages/public/conference.md` hangs a link to `/delegations/[id]`
				on this sentence, so it is written out here rather than by
				`applyPanelHeadline`: only the delegation's name is the link, not the
				whole line, and a string cannot carry one. -->
			<p class="text-body">
				You are part of the <a
					href={delegationUrl(state.delegationId)}
					class="text-brand-700 hover:underline">{state.delegationName}</a
				> delegation.
			</p>
		{:else}
			<p class="text-body">{headline}</p>
		{/if}

		{#if seatHref}
			<Button label="Go to your committee" variant="primary" href={seatHref} isFullWidth />
		{/if}

		{#if state.kind === 'application'}
			<Button
				label="View your application"
				variant="primary"
				href={applicationUrl(state.applicationId)}
				isFullWidth
			/>
		{/if}

		{#if state.kind === 'open'}
			<!-- `acceptsIndividuals` and `acceptsDelegations` are what the page
				file's "accepting, one route off: only the enabled button" row asks
				for. A conference that takes delegations only leaves the apply button
				out, because `canApply` refuses an individual there and the button
				would dead-end on that refusal, and the same the other way round. A
				conference with both switched off shows the badge and the closing
				date with nothing to press. -->
			<TakePartChoices
				acceptsIndividuals={state.acceptsIndividuals}
				acceptsDelegations={state.acceptsDelegations}
				{applyHref}
				{registerDelegationHref}
				{isCompact}
			/>
		{/if}

		{#if state.kind === 'open' && state.closesOn !== null}
			<p class="text-body">Closes {state.closesOn}</p>
		{/if}

		{#if state.kind === 'open' && state.paperDueOn !== null && !isCompact}
			<p class="text-body">Position papers due {state.paperDueOn}</p>
		{/if}
	</div>
</Card>

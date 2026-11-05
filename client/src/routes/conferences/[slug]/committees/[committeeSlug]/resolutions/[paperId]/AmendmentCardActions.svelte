<script lang="ts">
	import type { AmendmentCard } from '$lib/amendment-cards';
	import { Button } from '$lib/components/ui/button';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { newAmendmentUrl, withdrawAmendmentUrl } from '$lib/urls';
	import AmendmentCardForm from './AmendmentCardForm.svelte';

	type Props = {
		card: AmendmentCard;
		conferenceSlug: string;
		committeeSlug: string;
		paperId: string;
	};

	let { card, conferenceSlug, committeeSlug, paperId }: Props = $props();

	const inPlace = createInPlaceForm();
	const choices = $derived(card.choices);
	const hasButtons = $derived(
		choices.answer !== null ||
			choices.mayMakeUnfriendly ||
			choices.maySupport ||
			choices.hasSupported ||
			choices.mayWithdraw ||
			choices.mayAmend
	);
</script>

<!--
	What the reader may do with one amendment, as the database would allow it:
	a sponsor answers whether it is friendly, its proposer stops waiting for
	them or withdraws it, another seat supports it, and a delegate amends it.
	Every one is a plain form or a link, so the card works without JavaScript.
-->
{#if hasButtons}
	<div class="mt-3 flex flex-wrap items-center gap-2">
		{#if choices.answer === 'unanswered'}
			<AmendmentCardForm
				action="acceptAmendment"
				label="Accept as friendly"
				amendmentId={card.id}
				{inPlace}
			/>
		{/if}
		{#if choices.answer !== null}
			<AmendmentCardForm
				action="declineAmendment"
				label="Decline"
				amendmentId={card.id}
				{inPlace}
			/>
		{/if}
		{#if choices.answer === 'accepted'}
			<span class="text-caption text-muted-foreground">You accepted it</span>
		{/if}
		{#if choices.mayMakeUnfriendly}
			<AmendmentCardForm
				action="makeAmendmentUnfriendly"
				label="Collect support instead"
				amendmentId={card.id}
				{inPlace}
			/>
		{/if}
		{#if choices.maySupport}
			<AmendmentCardForm
				action="supportAmendment"
				label="Support"
				amendmentId={card.id}
				{inPlace}
			/>
		{:else if choices.hasSupported}
			<span class="text-caption text-muted-foreground">You support it</span>
		{/if}
		{#if choices.mayAmend}
			<Button
				href={newAmendmentUrl(conferenceSlug, committeeSlug, paperId, card.id)}
				variant="outline"
				size="sm"
				class="max-lg:h-11"
			>
				Amend this amendment
			</Button>
		{/if}
		{#if choices.mayWithdraw}
			<Button
				href={withdrawAmendmentUrl(conferenceSlug, committeeSlug, paperId, card.sequence)}
				variant="outline"
				size="sm"
				class="max-lg:h-11"
			>
				Withdraw
			</Button>
		{/if}
	</div>
{/if}

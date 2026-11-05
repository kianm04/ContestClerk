<script lang="ts">
	import { enhance } from '$app/forms';
	import type { DaisAmendmentRow } from '$lib/amendment-queue';
	import AmendmentCardBody from '$lib/components/amendments/AmendmentCardBody.svelte';
	import { Button } from '$lib/components/ui/button';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { chairVotingUrl, ruleOutAmendmentUrl } from '$lib/urls';

	type Props = {
		row: DaisAmendmentRow;
		paperId: string;
		conferenceSlug: string;
		committeeSlug: string;
	};

	let { row, paperId, conferenceSlug, committeeSlug }: Props = $props();

	// Sends "Approve" without reloading the page once JavaScript runs; without it, a plain post.
	const inPlace = createInPlaceForm();
	const card = $derived(row.card);
</script>

<!--
	One amendment as the dais reviews it: what it says, and what the dais
	may do with it. While it waits: "Approve", or "Rule out of order", which
	opens a dialog from the address that asks why. Once approved and nothing
	amends it any more: "Put to the vote", on the voting page.
-->
<article
	id="amendment-{card.sequence}"
	aria-label={card.name}
	class={[
		'scroll-mt-24 rounded-xl border border-border bg-card px-4 pt-3.5 pb-4',
		'max-lg:rounded-none max-lg:border-x-0 max-lg:border-t-0 max-lg:px-0',
		card.parentId !== null && 'lg:ml-4'
	]}
>
	<AmendmentCardBody {card} />

	{#if row.choices.mayDecide || row.choices.mayPutToVote}
		<div class="mt-3 flex flex-wrap gap-2">
			{#if row.choices.mayDecide}
				<form method="post" action="?/approveAmendment" use:enhance={inPlace.submit}>
					<input type="hidden" name="amendment" value={card.id} />
					<Button
						type="submit"
						variant="outline"
						size="sm"
						class="max-lg:h-11"
						disabled={inPlace.isBusy}>Approve</Button
					>
				</form>
				<Button
					href={ruleOutAmendmentUrl(conferenceSlug, committeeSlug, paperId, card.sequence)}
					variant="outline"
					size="sm"
					class="max-lg:h-11">Rule out of order</Button
				>
			{:else}
				<Button
					href={chairVotingUrl(conferenceSlug, committeeSlug)}
					variant="outline"
					size="sm"
					class="max-lg:h-11">Put to the vote</Button
				>
			{/if}
		</div>
	{/if}
</article>

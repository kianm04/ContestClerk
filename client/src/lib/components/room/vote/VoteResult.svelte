<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import type { ResolvedPathname } from '$app/types';
	import type { ChairForm } from '$lib/chair-form';
	import { OUTLINED_BUTTON_CLASSES, PRIMARY_BUTTON_CLASSES } from '$lib/console-buttons';
	import { endVotingPress } from '$lib/vote-presses';
	import { countsInWords, resultTitle } from '$lib/vote-view';
	import { closedVoteCounts, type SessionVote } from '$lib/votes';
	import TallyBar from './TallyBar.svelte';
	import VoteHeading from './VoteHeading.svelte';

	type Props = {
		/** The closed vote, still the room's current one until "End voting". */
		vote: SessionVote;
		/** The same page with `?vote=new`, which draws the set-up ("Open another vote"). */
		newVoteHref: ResolvedPathname;
		/** The chair's instant form (`$lib/chair-form.ts`), which shows the press at once. */
		submitExpecting: ChairForm['submitExpecting'];
	};

	let { vote, newVoteHref, submitExpecting }: Props = $props();

	const counts = $derived(closedVoteCounts(vote));
</script>

<!--
	A closed vote's result, which stays on every screen until "End voting":
	the subject and "passes" or "fails" in the serif, the counts in words and
	the bar without its mark. "End voting" is the one filled button (P1);
	"Open another vote" is a plain link to the set-up, which only this chair sees.
-->
<section
	aria-labelledby="vote-heading"
	class="flex min-h-0 flex-1 flex-col px-8 pt-7 pb-6 max-md:p-4"
>
	<VoteHeading {vote} mark="closed" headingId="vote-heading" />
	<div class="flex flex-1 flex-col justify-center gap-3 py-6">
		<p class="font-display text-display text-balance max-md:text-display-mobile">
			{resultTitle(vote)}
		</p>
		<p class="text-[20px] leading-7 text-ink-600 tabular-nums">{countsInWords(counts)}</p>
		<div class="mt-4 max-w-[640px]">
			<TallyBar {counts} majority={vote.majority} showsMark={false} />
		</div>
	</div>
	<footer class="flex flex-wrap items-center justify-between gap-4">
		<a href={newVoteHref} class="{OUTLINED_BUTTON_CLASSES} h-11 max-md:flex-1">Open another vote</a>
		<form
			method="post"
			action="?/endVoting"
			use:enhance={submitExpecting(endVotingPress)}
			class="max-md:flex-1"
		>
			<button
				type="submit"
				class="{PRIMARY_BUTTON_CLASSES} h-14 min-w-60 text-[16px] max-md:w-full max-md:min-w-0"
			>
				End voting
			</button>
		</form>
	</footer>
</section>

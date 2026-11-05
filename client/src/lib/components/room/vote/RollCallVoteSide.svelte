<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import type { ChairForm } from '$lib/chair-form';
	import { voteResult, type VoteCounts } from '$lib/committee-room';
	import { PRIMARY_BUTTON_CLASSES } from '$lib/console-buttons';
	import { closeVotePress } from '$lib/vote-presses';
	import { closeVoteLabel, toCallText, type CancelVoteLinks } from '$lib/vote-view';
	import { totalVotes, type OpenVote } from '$lib/votes';
	import CancelVoteControl from './CancelVoteControl.svelte';
	import TallyBar from './TallyBar.svelte';

	type Props = {
		/** The roll call vote being called. */
		vote: OpenVote;
		/** Its answers added up, with answers still on their way. */
		counts: VoteCounts;
		/** How many present seats have not answered yet. */
		toCallCount: number;
		/** What "Cancel vote" needs to ask in place. */
		cancelLinks: CancelVoteLinks;
		/** The chair's instant form (`$lib/chair-form.ts`), which shows each press at once. */
		submitExpecting: ChairForm['submitExpecting'];
	};

	let { vote, counts, toCallCount, cancelLinks, submitExpecting }: Props = $props();

	const hasAnswers = $derived(totalVotes(counts) > 0);

	/** The tally's three numbers, in the order the buttons answer. */
	const columns = $derived([
		{ label: 'Yes', count: counts.for },
		{ label: 'No', count: counts.against },
		{ label: 'Abstain', count: counts.abstain }
	]);

	/** "Close vote": closed with the answers so far; a seat that never answered is not voting. */
	function handleClosePress() {
		if (!hasAnswers) return null;

		return closeVotePress(vote.id, counts, voteResult(counts, vote.majority), new Date());
	}
</script>

<!--
	The right column of a roll call vote: the counts so far, how many are left
	to call, the bar, "Close vote" (the one filled button, usable once one seat
	has answered) and "Cancel vote" under it. Below 861px it follows the list.
-->
<aside
	aria-label="Tally"
	class="flex flex-col gap-4 border-l border-line px-6 pt-7 pb-5 max-[860px]:border-t max-[860px]:border-l-0 max-md:p-4"
>
	<dl class="grid grid-cols-3 gap-2">
		<!-- The `(column.label)` key lets Svelte reuse each count instead of rebuilding it. -->
		{#each columns as column (column.label)}
			<div class="flex flex-col-reverse">
				<dt class="text-small text-ink-600">{column.label}</dt>
				<dd class="text-h1 tabular-nums">{column.count}</dd>
			</div>
		{/each}
	</dl>
	<p class="text-small text-ink-600 tabular-nums">{toCallText(toCallCount)}</p>
	<TallyBar {counts} majority={vote.majority} showsMark />
	<div class="mt-auto flex flex-col items-center gap-2 pt-4">
		<form
			method="post"
			action="?/closeVote"
			use:enhance={submitExpecting(handleClosePress)}
			class="w-full"
		>
			<input type="hidden" name="voteId" value={vote.id} />
			<button type="submit" disabled={!hasAnswers} class="{PRIMARY_BUTTON_CLASSES} h-14 w-full">
				{closeVoteLabel(counts, vote.majority)}
			</button>
		</form>
		<CancelVoteControl voteId={vote.id} links={cancelLinks} {submitExpecting} />
	</div>
</aside>

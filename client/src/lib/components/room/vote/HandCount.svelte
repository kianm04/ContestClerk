<script lang="ts">
	import { onMount } from 'svelte';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import type { ChairForm, ChairSubmitInput } from '$lib/chair-form';
	import { voteResult } from '$lib/committee-room';
	import { PRIMARY_BUTTON_CLASSES } from '$lib/console-buttons';
	import { closeVotePress, countVotePress } from '$lib/vote-presses';
	import {
		closeVoteLabel,
		draftCounts,
		handCountDraftOf,
		handCountWords,
		isSavableCount,
		type CancelVoteLinks,
		type HandCountDraft
	} from '$lib/vote-view';
	import { readShowOfHands, totalVotes, type OpenVote } from '$lib/votes';
	import CancelVoteControl from './CancelVoteControl.svelte';
	import HandCountLegend from './HandCountLegend.svelte';
	import HandCountSteppers from './HandCountSteppers.svelte';
	import TallyBar from './TallyBar.svelte';
	import VoteHeading from './VoteHeading.svelte';

	type Props = {
		/** The open vote, counted by a show of hands, with the presses on their way laid on top. */
		vote: OpenVote;
		/** The seats present, which the hands together may not pass. */
		presentCount: number;
		/** What "Cancel vote" needs to ask in place. */
		cancelLinks: CancelVoteLinks;
		/** The chair's instant form (`$lib/chair-form.ts`), which shows each press at once. */
		submitExpecting: ChairForm['submitExpecting'];
	};

	let { vote, presentCount, cancelLinks, submitExpecting }: Props = $props();

	/** The `id`s of the two forms, which buttons and code elsewhere on the view send. */
	const CLOSE_FORM_ID = 'vote-close-form';
	const COUNT_FORM_ID = 'vote-count-form';

	/*
		The hands as the chair counts them. A `$derived` can be assigned to: it
		starts from the saved counts, and each − or + or typed number changes it
		at once. It follows three plain numbers, not `vote`, which every reading of
		the room replaces, so a typed count stays until a saved one differs.
	*/
	const saved = $derived(handCountDraftOf(vote));
	const savedFor = $derived(saved.for);
	const savedAgainst = $derived(saved.against);
	const savedAbstain = $derived(saved.abstain);
	let draft = $derived({ for: savedFor, against: savedAgainst, abstain: savedAbstain });
	const counts = $derived(draftCounts(draft));
	const hasVotes = $derived(totalVotes(counts) > 0);

	// Whether the script runs: without it nothing follows the typed numbers, so
	// "Close vote" stays usable and plain. `onMount` only runs in the browser.
	let isScriptRunning = $state(false);
	onMount(() => {
		isScriptRunning = true;
	});

	/**
	 * One count changed. It is saved at once (`?/countVote`), so the projector
	 * follows the count, unless it is not a number yet or adds up to more
	 * hands than delegates present, which the server would refuse.
	 */
	function handleCountChange(side: keyof HandCountDraft, value: number | null) {
		draft = { ...draft, [side]: value };

		if (!isSavableCount(draft, presentCount)) return;

		const countForm = document.getElementById(COUNT_FORM_ID);
		if (countForm instanceof HTMLFormElement) countForm.requestSubmit();
	}

	/** A count press carries the three counts as they stand now, and shows them saved at once. */
	function handleCountPress(input: ChairSubmitInput) {
		input.formData.set('votesFor', String(counts.for));
		input.formData.set('votesAgainst', String(counts.against));
		input.formData.set('votesAbstain', String(counts.abstain));

		return countVotePress(vote.id, counts);
	}

	/** "Close vote": closed with the typed counts, unless the server is sure to refuse them. */
	function handleClosePress(input: ChairSubmitInput) {
		const typed = readShowOfHands(input.formData);

		if (typed === null || totalVotes(typed) === 0 || totalVotes(typed) > presentCount) return null;

		return closeVotePress(vote.id, typed, voteResult(typed, vote.majority), new Date());
	}

	const closeLabel = $derived(
		isScriptRunning ? closeVoteLabel(counts, vote.majority) : 'Close vote'
	);
</script>

<!--
	An open vote counted by a show of hands. The three number fields are the
	"Close vote" form's own, so a chair without JavaScript types the counts and
	closes; the button sits in the footer and names its form with `form`. The
	hidden form saves each change of the count as it is made.
-->
<section
	aria-labelledby="vote-heading"
	class="flex min-h-0 flex-1 flex-col px-8 pt-7 pb-6 max-md:p-4"
>
	<VoteHeading {vote} mark="open" headingId="vote-heading" />
	<form
		id={CLOSE_FORM_ID}
		method="post"
		action="?/closeVote"
		use:enhance={submitExpecting(handleClosePress)}
		class="flex flex-1 flex-col justify-center gap-7 py-6"
	>
		<input type="hidden" name="voteId" value={vote.id} />
		<HandCountSteppers {draft} onChange={handleCountChange} />
		<div>
			<TallyBar {counts} majority={vote.majority} showsMark />
			<HandCountLegend {counts} />
		</div>
		<!-- `aria-live` reads the sentence out again whenever the count changes it. -->
		<p aria-live="polite" class="text-[20px] leading-7 font-semibold">
			{handCountWords(counts, vote.majority)}
		</p>
	</form>
	<footer class="flex flex-wrap items-center justify-between gap-4">
		<CancelVoteControl voteId={vote.id} links={cancelLinks} {submitExpecting} />
		<button
			type="submit"
			form={CLOSE_FORM_ID}
			disabled={isScriptRunning && !hasVotes}
			class="{PRIMARY_BUTTON_CLASSES} h-14 min-w-60 text-[16px] max-md:flex-1"
		>
			{closeLabel}
		</button>
	</footer>
	<form
		id={COUNT_FORM_ID}
		method="post"
		action="?/countVote"
		use:enhance={submitExpecting(handleCountPress)}
		hidden
	>
		<input type="hidden" name="voteId" value={vote.id} />
	</form>
</section>

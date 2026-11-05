<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import type { ChairForm } from '$lib/chair-form';
	import { QUIET_BUTTON_CLASSES } from '$lib/console-buttons';
	import { focusHeadingAfterPress } from '$lib/room-focus';
	import { cancelVotePress } from '$lib/vote-presses';
	import type { CancelVoteLinks } from '$lib/vote-view';

	type Props = {
		/** The open vote that "Cancel vote" deletes. */
		voteId: string;
		/** Whether the question is asked at once, and the two pages it is asked on without JavaScript. */
		links: CancelVoteLinks;
		/** The chair's instant form (`$lib/chair-form.ts`), which shows the press at once. */
		submitExpecting: ChairForm['submitExpecting'];
	};

	let { voteId, links, submitExpecting }: Props = $props();

	/** The two places the focus moves between, as the question is asked and put away. */
	const ASK_ID = 'cancel-vote-ask';
	const KEEP_ID = 'cancel-vote-keep';

	/*
		Whether the question is showing. A `$derived` can be assigned to: it
		starts from the address (`?cancel=confirm`) and then follows the chair's
		presses, until the address changes again. `links` is a new object each
		time the room is read again, so `isConfirmingInAddress` sits between
		them: it passes a change on only when the address's answer changes, and
		a realtime reload does not put the question away under the chair.
	*/
	const isConfirmingInAddress = $derived(links.isConfirming);
	let isAsking = $derived(isConfirmingInAddress);

	/** With JavaScript, "Cancel vote" asks in place instead of following its link. */
	function handleAsk(event: MouseEvent) {
		event.preventDefault();
		isAsking = true;
		focusHeadingAfterPress([KEEP_ID]);
	}

	/** "Keep voting" puts the question away, with the focus back on "Cancel vote". */
	function handleKeep(event: MouseEvent) {
		event.preventDefault();
		isAsking = false;
		focusHeadingAfterPress([ASK_ID]);
	}
</script>

<!--
	"Cancel vote" as a quiet button. Pressed, it turns in place into the
	question, never a dialog, the way End asks in the mode bar. Both its
	buttons are links too, to the page with or without `?cancel=confirm`, so
	the question is asked and put away without JavaScript as well.
-->
{#if isAsking}
	<form
		method="post"
		action="?/cancelVote"
		use:enhance={submitExpecting(() => cancelVotePress(voteId))}
		class="flex flex-wrap items-center gap-x-3 gap-y-2"
	>
		<input type="hidden" name="voteId" value={voteId} />
		<p class="font-medium">Cancel this vote? Nothing will be recorded.</p>
		<button
			type="submit"
			class="h-11 rounded-control bg-danger-700 px-4 font-medium text-surface hover:bg-danger-700/90"
		>
			Cancel vote
		</button>
		<a id={KEEP_ID} href={links.keepHref} onclick={handleKeep} class={QUIET_BUTTON_CLASSES}>
			Keep voting
		</a>
	</form>
{:else}
	<a id={ASK_ID} href={links.confirmHref} onclick={handleAsk} class={QUIET_BUTTON_CLASSES}>
		Cancel vote
	</a>
{/if}

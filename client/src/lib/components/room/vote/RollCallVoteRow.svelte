<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Check from '@lucide/svelte/icons/check';
	import type { RoomSeat } from '$lib/committee-room';
	import { KEY_SHORTCUTS } from '$lib/console-keys';
	import {
		ROLL_CALL_ANSWER_LABELS,
		VOTE_CHOICES,
		VOTE_REFUSALS,
		type VoteChoice
	} from '$lib/votes';
	import SeatFlag from '../floor/SeatFlag.svelte';

	type Props = {
		seat: RoomSeat;
		/** The vote the buttons answer. */
		voteId: string;
		/** The seat's answer so far, with an answer just pressed already in it, or null. */
		choice: VoteChoice | null;
		/** Marked "present and voting" at roll call, so it may not abstain. */
		isPresentAndVoting: boolean;
		/** The ▸ is on this row: its buttons answer Y, N and A. */
		isMarked: boolean;
		/** The row pressed last without JavaScript (`?seat=`), whose answer gets the focus back. */
		hasFocus: boolean;
		/** Sends both of the row's forms through the chair's instant form. */
		onSubmit: SubmitFunction;
	};

	let { seat, voteId, choice, isPresentAndVoting, isMarked, hasFocus, onSubmit }: Props = $props();

	/** The key each answer declares on the marked row, which the console's keys press. */
	const ANSWER_KEYS: Record<VoteChoice, string> = {
		for: KEY_SHORTCUTS.yes,
		against: KEY_SHORTCUTS.no,
		abstain: KEY_SHORTCUTS.abstain
	};

	// The button the focus lands on when this row gets it back: the answer
	// given, or Yes once "Clear" has taken the answer away.
	const focusedAnswer = $derived(hasFocus ? (choice ?? 'for') : null);

	const ANSWER_CLASSES =
		'h-9 rounded-lg border border-line bg-surface px-3 text-small font-medium hover:bg-neutral-100 aria-pressed:border-brand-500 aria-pressed:bg-brand-100 aria-pressed:text-brand-900 disabled:text-ink-400 disabled:hover:bg-surface max-md:h-11';
</script>

<!--
	One seat of a roll call vote: the ▸ when it is being called, its flag and
	name, its three answers, and ✓ with "Clear" once it has answered. The
	answers are submit buttons that all send `choice`, each with its own value;
	"Clear" is a form of its own. On a phone the answers go under the name.
-->
<li
	data-seat-id={seat.id}
	aria-current={isMarked ? 'true' : undefined}
	class="grid h-[52px] grid-cols-[16px_20px_minmax(0,200px)_minmax(0,1fr)_auto] items-center gap-3 border-b border-line max-md:h-auto max-md:grid-cols-[16px_20px_minmax(0,1fr)_auto] max-md:gap-y-2 max-md:py-2 {isMarked
		? 'bg-brand-50'
		: ''}"
>
	<span aria-hidden="true" class="text-xs text-brand-700 {isMarked ? '' : 'invisible'}">▸</span>
	<SeatFlag {seat} size="row" />
	<span class="truncate">{seat.name}</span>
	<form
		method="post"
		action="?/castRollCall"
		aria-label="Vote of {seat.name}"
		use:enhance={onSubmit}
		class="flex flex-wrap gap-1.5 max-md:col-[2/-1] max-md:row-start-2"
	>
		<input type="hidden" name="voteId" value={voteId} />
		<input type="hidden" name="seatId" value={seat.id} />
		<!-- A list of plain strings has nothing but its position to be keyed by. -->
		{#each VOTE_CHOICES as answer, index (index)}
			{#if answer === 'abstain' && isPresentAndVoting}
				<!-- A disabled button shows no tooltip of its own, so the span around it does. -->
				<span title={VOTE_REFUSALS.cannotAbstain}>
					<button type="button" disabled class={ANSWER_CLASSES}>Abstain</button>
				</span>
			{:else}
				<!-- `autofocus` puts the focus back on this row's answer after a reload without JavaScript. -->
				<!-- svelte-ignore a11y_autofocus -->
				<button
					type="submit"
					name="choice"
					value={answer}
					aria-pressed={answer === choice}
					aria-keyshortcuts={isMarked ? ANSWER_KEYS[answer] : undefined}
					autofocus={answer === focusedAnswer}
					class={ANSWER_CLASSES}
				>
					{ROLL_CALL_ANSWER_LABELS[answer]}
				</button>
			{/if}
		{/each}
	</form>
	<div class="flex items-center justify-end gap-2">
		{#if choice !== null}
			<Check size={18} strokeWidth={2} role="img" aria-label="Answered" class="text-success-700" />
			<form method="post" action="?/clearRollCall" use:enhance={onSubmit}>
				<input type="hidden" name="voteId" value={voteId} />
				<input type="hidden" name="seatId" value={seat.id} />
				<button
					type="submit"
					class="min-h-11 text-small font-medium text-ink-600 hover:text-ink-900"
				>
					Clear
				</button>
			</form>
		{/if}
	</div>
</li>

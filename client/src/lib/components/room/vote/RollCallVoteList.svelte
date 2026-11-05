<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import { tick } from 'svelte';
	import type { RoomSeat } from '$lib/committee-room';
	import {
		movedMarkedSeatId,
		rollCallVoteKeyAction,
		startingMarkedSeatId
	} from '$lib/roll-call-vote-keys';
	import type { OpenVote, VoteChoice } from '$lib/votes';
	import RollCallVoteRow from './RollCallVoteRow.svelte';
	import VoteHeading from './VoteHeading.svelte';

	type Props = {
		/** The roll call vote being called. */
		vote: OpenVote;
		/** Each seat's answer so far, keyed by seat id, with answers still on their way. */
		entries: Record<string, VoteChoice>;
		/** The seats present, in alphabetical order, one row each. */
		seats: RoomSeat[];
		/** The seats marked "present and voting", whose Abstain is disabled. */
		presentAndVotingSeatIds: string[];
		/** The row pressed last without JavaScript (`?seat=`). */
		focusedSeatId: string | null;
		/** Sends a row's press through the chair's instant form. */
		onSubmit: SubmitFunction;
	};

	let { vote, entries, seats, presentAndVotingSeatIds, focusedSeatId, onSubmit }: Props = $props();

	const seatIds = $derived(seats.map((seat) => seat.id));

	/** Where the ▸ starts (`$lib/roll-call-vote-keys.ts`), read once as the list appears. */
	function startingMarker(): string | null {
		return startingMarkedSeatId(seatIds, entries, focusedSeatId);
	}

	// `$state` redraws what reads it: the seat the ▸ is on, which presses and ↑ ↓ move.
	let markedSeatId: string | null = $state(startingMarker());

	/** A row's forms: an answer moves the ▸ to the next seat, then goes through the instant form. */
	function submitRow(seatId: string): SubmitFunction {
		return (input) => {
			if (input.action.search === '?/castRollCall') {
				markedSeatId = movedMarkedSeatId(seatIds, seatId, 1);
			}

			return onSubmit(input);
		};
	}

	/** Once drawn again, the focus goes to the marked row's answer, or its Yes. */
	async function focusMarkedRow(list: HTMLElement) {
		await tick();

		const row = list.querySelector(`[data-seat-id="${markedSeatId}"]`);
		const chosen = row?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
		const first = row?.querySelector<HTMLButtonElement>('button[name="choice"]');
		(chosen ?? first)?.focus();
	}

	/*
		The list's own keys, heard while the focus is inside it, so they work
		even with the console's shortcuts switched off: ↑ and ↓ move the ▸, and
		Y, N and A press the marked row's answer, which moves the ▸ on. A key
		handled here is not pressed again by the console (`preventDefault`).
	*/
	function handleKeydown(event: KeyboardEvent & { currentTarget: HTMLElement }) {
		if (event.ctrlKey || event.metaKey || event.altKey) return;

		const action = rollCallVoteKeyAction(event.key);

		if (action === null) return;

		event.preventDefault();
		const list = event.currentTarget;

		if (action.kind === 'move') {
			markedSeatId = movedMarkedSeatId(seatIds, markedSeatId, action.step);
		} else {
			const answer = `[data-seat-id="${markedSeatId}"] button[value="${action.choice}"]`;
			list.querySelector<HTMLButtonElement>(`${answer}:not(:disabled)`)?.click();
		}

		focusMarkedRow(list);
	}
</script>

<!--
	The left column of a roll call vote: the heading, how the roll is read, and
	one row per present seat. The key handler is on the list, so it is written
	once; the list itself never takes the focus, its buttons do.
-->
<section aria-labelledby="vote-heading" class="flex min-h-0 flex-col px-8 pt-7 pb-6 max-md:p-4">
	<VoteHeading {vote} mark={null} headingId="vote-heading" />
	<p class="mt-1 text-small text-ink-600">From the top · keys Y, N, A</p>
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<ul aria-label="Seats voting" onkeydown={handleKeydown} class="mt-4 min-h-0 flex-1 overflow-auto">
		<!-- The `(seat.id)` key keeps each row, and the button focused in it, across reloads. -->
		{#each seats as seat (seat.id)}
			<RollCallVoteRow
				{seat}
				voteId={vote.id}
				choice={entries[seat.id] ?? null}
				isPresentAndVoting={presentAndVotingSeatIds.includes(seat.id)}
				isMarked={seat.id === markedSeatId}
				hasFocus={seat.id === focusedSeatId}
				onSubmit={submitRow(seat.id)}
			/>
		{/each}
	</ul>
</section>

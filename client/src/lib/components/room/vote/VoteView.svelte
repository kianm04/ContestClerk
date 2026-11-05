<script lang="ts">
	import { roomFrameAfterPresses, sharedChairForm } from '$lib/chair-form';
	import { entriesAfterPresses } from '$lib/roll-call-vote-preview';
	import {
		hasRollCallAfterPresses,
		latestAttendanceAfterPresses,
		sharedRollCallForm
	} from '$lib/roll-call-preview';
	import { chairPageUrl, chairRollCallFromUrl, chairVoteViewUrl } from '$lib/urls';
	import { votesAfterPresses } from '$lib/vote-presses';
	import { voteAttendance, voteScreen, type VoteViewFrame } from '$lib/vote-view';
	import {
		countEntries,
		emptyVoteForm,
		unvotedCount,
		type VoteFormErrors,
		type VoteFormValues,
		type VoteViewData
	} from '$lib/votes';
	import HandCount from './HandCount.svelte';
	import RollCallVoteList from './RollCallVoteList.svelte';
	import RollCallVoteSide from './RollCallVoteSide.svelte';
	import VoteHistory from './VoteHistory.svelte';
	import VoteResult from './VoteResult.svelte';
	import VoteStartForm from './VoteStartForm.svelte';

	type Props = {
		/** What `readVoteView` in `$lib/server/vote-view.ts` read: the room's vote and the closed ones. */
		view: VoteViewData;
		/** The chair layout's data: the room, the seats and the latest roll call. */
		frame: VoteViewFrame;
		/** What a refused "Open vote" sent back, so the set-up keeps what was typed; null otherwise. */
		refusedValues: VoteFormValues | null;
		refusedErrors: VoteFormErrors;
		/** The page drawing the view, `chair/voting` or `chair` while the room votes. */
		page: 'chair' | 'voting';
	};

	let { view, frame, refusedValues, refusedErrors, page }: Props = $props();

	// The chair layout's instant forms (`$lib/chair-form.ts`, `$lib/roll-call-preview.ts`).
	// The view is drawn with the presses still on their way laid on top, so each
	// one shows the moment it is made.
	const chairForm = sharedChairForm();
	const rollCallForm = sharedRollCallForm();

	const { committeeState } = $derived(roomFrameAfterPresses(frame, chairForm.presses));
	const seatIds = $derived(frame.seats.map((seat) => seat.id));
	const attendance = $derived(
		latestAttendanceAfterPresses(
			frame.attendance,
			frame.latestRollCallId,
			rollCallForm.presses,
			seatIds
		) ?? {}
	);
	const hasRollCall = $derived(
		hasRollCallAfterPresses(frame.latestRollCallId, rollCallForm.presses)
	);
	const room = $derived(voteAttendance(frame.seats, attendance));

	// The room's vote and history with the presses on top; the vote shows only
	// while the room still points at it, which "End voting" stops.
	const shown = $derived(
		votesAfterPresses({ currentVote: view.vote, closedVotes: view.closedVotes }, chairForm.presses)
	);
	const vote = $derived(
		shown.currentVote?.id === committeeState.currentVoteId ? shown.currentVote : null
	);
	const isRoomVoting = $derived(committeeState.mode === 'voting');
	const screen = $derived(
		voteScreen({ currentVote: vote, isRoomVoting, isNewVoteShown: view.isNewVoteShown })
	);
	// A roll call vote's answers so far, the ones just pressed included.
	const entries = $derived(
		vote ? entriesAfterPresses(vote.entries, vote.id, chairForm.presses) : {}
	);
	const votingSeatIds = $derived(room.votingSeats.map((seat) => seat.id));

	// The view's links, to this page with a question in its address or without.
	const conferenceSlug = $derived(frame.conference.slug);
	const committeeSlug = $derived(frame.committee.slug);
	const cancelLinks = $derived({
		isConfirming: view.isCancelConfirming,
		confirmHref: chairVoteViewUrl(conferenceSlug, committeeSlug, page, 'cancel=confirm'),
		keepHref: chairPageUrl(conferenceSlug, committeeSlug, page)
	});
</script>

<!--
	The Vote view, which `chair/voting` draws and `chair` draws whenever the
	room is voting, so both look the same. It draws one of four things
	(`voteScreen`): the set-up, an open vote counted by hands or by roll call,
	or a closed vote's result, which stays until "End voting".
-->
<div class="flex min-h-0 flex-1 flex-col">
	{#if screen === 'handCount' && vote}
		<HandCount
			{vote}
			presentCount={room.presentCount}
			{cancelLinks}
			submitExpecting={chairForm.submitExpecting}
		/>
	{:else if screen === 'rollCall' && vote}
		<!-- Two columns from 861px: the list, and the tally at least 320px wide beside it. -->
		<div
			class="grid min-h-0 flex-1 grid-cols-1 min-[861px]:grid-cols-[minmax(0,1fr)_clamp(320px,38%,480px)] min-[861px]:grid-rows-[minmax(0,1fr)]"
		>
			<RollCallVoteList
				{vote}
				{entries}
				seats={room.votingSeats}
				presentAndVotingSeatIds={room.presentAndVotingSeatIds}
				focusedSeatId={view.focusedSeatId}
				onSubmit={chairForm.submit}
			/>
			<RollCallVoteSide
				{vote}
				counts={countEntries(entries)}
				toCallCount={unvotedCount(votingSeatIds, entries)}
				{cancelLinks}
				submitExpecting={chairForm.submitExpecting}
			/>
		</div>
	{:else if screen === 'result' && vote}
		<VoteResult
			{vote}
			newVoteHref={chairVoteViewUrl(conferenceSlug, committeeSlug, page, 'vote=new')}
			submitExpecting={chairForm.submitExpecting}
		/>
	{:else}
		<div class="flex w-full max-w-[760px] flex-col gap-6 px-8 py-10 max-md:px-4 max-md:py-5">
			<VoteStartForm
				values={refusedValues ?? emptyVoteForm(view.subjects)}
				errors={refusedErrors}
				subjects={view.subjects}
				{room}
				{hasRollCall}
				{isRoomVoting}
				rollCallHref={chairRollCallFromUrl(conferenceSlug, committeeSlug, page)}
				submitExpecting={chairForm.submitExpecting}
			/>
			{#if shown.closedVotes.length > 0}
				<VoteHistory votes={shown.closedVotes} timeZone={frame.conference.timezone} />
			{/if}
		</div>
	{/if}
</div>

<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import type { ResolvedPathname } from '$app/types';
	import {
		NEW_ROW_ID_FIELD,
		newRowId,
		type ChairForm,
		type ChairSubmitInput
	} from '$lib/chair-form';
	import { endVotingPress, openVotePress } from '$lib/vote-presses';
	import type { VoteAttendance } from '$lib/vote-view';
	import {
		readVoteForm,
		type VoteFormErrors,
		type VoteFormValues,
		type VoteSubject
	} from '$lib/votes';
	import VoteStartChoices from './VoteStartChoices.svelte';
	import VoteStartFoot from './VoteStartFoot.svelte';
	import VoteSubjectField from './VoteSubjectField.svelte';

	type Props = {
		/** What the form shows: empty at first, or what a refused "Open vote" sent back. */
		values: VoteFormValues;
		/** The message under each field the server refused. */
		errors: VoteFormErrors;
		/** What may be voted on, listed in "On" (`voteSubjects` in `$lib/paper-votes.ts`). */
		subjects: VoteSubject[];
		/** Who is in the room, from the latest roll call. */
		room: VoteAttendance;
		/** Without a roll call "Open vote" waits, and says so. */
		hasRollCall: boolean;
		/** The room is voting with no vote open, after "Close debate" or a closed vote: "End voting" shows. */
		isRoomVoting: boolean;
		/** The roll call view, opened from this page. */
		rollCallHref: ResolvedPathname;
		/** The chair's instant form (`$lib/chair-form.ts`), which shows each press at once. */
		submitExpecting: ChairForm['submitExpecting'];
	};

	let {
		values,
		errors,
		subjects,
		room,
		hasRollCall,
		isRoomVoting,
		rollCallHref,
		submitExpecting
	}: Props = $props();

	/** The hidden form "End voting" sends, since a form cannot sit inside another. */
	const END_VOTING_FORM_ID = 'vote-end-voting-form';

	/*
		The type, majority and method chosen. A `$derived` can be assigned to:
		it starts from `values` and then follows what the chair picks, so the
		foot can put the chosen majority into words.
	*/
	let choices = $derived({ kind: values.kind, majority: values.majority, method: values.method });

	function handleChoiceChange(name: 'kind' | 'majority' | 'method', value: string) {
		choices = { ...choices, [name]: value };
	}

	/** "Open vote": the vote opens at once, under an id this browser chose and the server keeps. */
	function handleOpenPress(input: ChairSubmitInput) {
		const { input: voteInput } = readVoteForm(input.formData, subjects);

		if (voteInput === null) return null;

		const newVoteId = newRowId();
		input.formData.set(NEW_ROW_ID_FIELD, newVoteId);

		return openVotePress(voteInput, newVoteId, new Date());
	}
</script>

<!--
	"Open a vote", inline on the view, never a dialog: what it is on, then the
	type, the majority and the method as rows of segments (radio buttons, so
	the choice is sent without JavaScript), and the room's attendance line at
	the foot beside "Open vote", the one filled button. After "Close debate"
	passed, the cursor waits in the typed subject (`autofocus`), and "On"
	lists the drafts to vote on.
-->
<form
	method="post"
	action="?/openVote"
	autocomplete="off"
	use:enhance={submitExpecting(handleOpenPress)}
	class="flex flex-col gap-5"
>
	<h2 class="font-display text-h1">Open a vote</h2>
	<div class="mt-1 flex flex-col gap-4">
		<VoteSubjectField {subjects} {values} {errors} {isRoomVoting} />
		<VoteStartChoices {choices} {errors} onChange={handleChoiceChange} />
	</div>
	<VoteStartFoot
		{room}
		majority={choices.majority}
		{hasRollCall}
		{rollCallHref}
		endVotingFormId={isRoomVoting ? END_VOTING_FORM_ID : null}
	/>
</form>
{#if isRoomVoting}
	<form
		id={END_VOTING_FORM_ID}
		method="post"
		action="?/endVoting"
		use:enhance={submitExpecting(endVotingPress)}
		hidden
	></form>
{/if}

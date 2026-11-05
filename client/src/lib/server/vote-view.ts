/**
 * The Vote view's data and its form actions (`specs/05-pages/chair/voting.md`):
 * open a vote, save the hands as they are counted, answer a roll call vote
 * seat by seat, close, cancel, and end voting.
 *
 * Files under `$lib/server` only ever run on the server. `chair/voting` draws
 * the view always and `chair` while the room votes, so both pages call the one
 * reader, `readVoteView`, and spread the one factory, `voteActions`, into their
 * own `actions`, saying where to send the chair back to. The rows themselves
 * are written by `./votes.ts`; the rules and the words are in `$lib/votes.ts`.
 */

import { fail } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	isSessionRunning,
	type ChairRoomFrame,
	type CommitteeSession,
	type CommitteeStateView
} from '$lib/chair-room';
import { countPresent, voteResult } from '$lib/committee-room';
import type { Flash } from '$lib/flash';
import { NEW_ROW_ID_FIELD, readNewRowId } from '$lib/new-row-id';
import { chairRoomUrl } from '$lib/urls';
import {
	VOTE_REFUSALS,
	castRefusal,
	countEntries,
	readShowOfHands,
	readVoteChoice,
	readVoteForm,
	totalVotes,
	type OpenVote,
	type VoteFormErrors,
	type VoteFormValues,
	type VoteViewData
} from '$lib/votes';
import {
	openChairRoom,
	refuseChairAction,
	returnTo,
	type ChairRequestEvent,
	type ReturnAddress
} from '$lib/server/chair-floor-actions';
import { listVoteSubjects } from '$lib/server/paper-votes';
// Renamed on import: the actions below are called `openVote`, `closeVote`
// and `cancelVote` too, and a different local name keeps the action and the
// function that writes its row from reading as the same thing.
import {
	cancelVote as cancelVoteRow,
	clearRollCallChoice,
	closeVote as closeVoteRow,
	endVoting,
	getCurrentVote,
	getVotes,
	openVote as openVoteRow,
	recordRollCallChoice,
	saveHandCount
} from '$lib/server/votes';

/** The part of the chair layout's data the reader needs. */
type VoteViewRoom = {
	/** The committee, whose introduced drafts the vote form lists. */
	committeeId: string;
	committeeState: Pick<CommitteeStateView, 'currentVoteId'>;
	currentSession: CommitteeSession | null;
};

/**
 * What the Vote view draws besides the frame: the room's current vote, open
 * or closed, with its roll call answers, and the session's closed votes. Read
 * from the address: `?vote=new` (the set-up while a result is on show),
 * `?cancel=confirm` (Cancel vote's question without JavaScript) and
 * `?seat=<id>` (the roll call row whose answer gets the focus back). Null
 * while no session runs, when there is nothing to vote in. The form's list
 * of what may be voted on is read with them (`listVoteSubjects`).
 */
export async function readVoteView(
	supabase: SupabaseClient,
	room: VoteViewRoom,
	url: URL
): Promise<VoteViewData | null> {
	const session = room.currentSession;

	if (session === null || !isSessionRunning(session)) return null;

	const [votes, subjects] = await Promise.all([
		getVotes(supabase, session.id, room.committeeState.currentVoteId),
		listVoteSubjects(supabase, room.committeeId, session.id)
	]);

	return {
		vote: votes.currentVote,
		closedVotes: votes.closedVotes,
		isNewVoteShown: url.searchParams.get('vote') === 'new',
		isCancelConfirming: url.searchParams.get('cancel') === 'confirm',
		focusedSeatId: url.searchParams.get('seat'),
		subjects
	};
}

/**
 * Refuse the open-a-vote form, drawing it again with what was typed. `errors`
 * go under the fields; `message`, when there is one, is shown as a toast.
 */
function refuseVoteForm(
	values: VoteFormValues,
	errors: VoteFormErrors,
	message: string | null = null
) {
	const flash: Flash | null = message ? { tone: 'error', message } : null;

	return fail(400, { values, errors, flash });
}

/** `address` with `?seat=<id>` added, so the row pressed gets the focus back without JavaScript. */
function withSeat(address: string, seatId: string): string {
	const joiner = address.includes('?') ? '&' : '?';

	return `${address}${joiner}${new URLSearchParams({ seat: seatId })}`;
}

/**
 * The room's current vote when it is the one the form names and still open,
 * or the sentence to refuse with.
 */
async function findOpenVote(
	event: ChairRequestEvent,
	frame: ChairRoomFrame,
	formData: FormData
): Promise<{ vote: OpenVote } | { refusal: string }> {
	if (!isSessionRunning(frame.currentSession)) return { refusal: VOTE_REFUSALS.noSession };

	const voteId = String(formData.get('voteId') ?? '');
	const currentVoteId = frame.committeeState.currentVoteId;
	const vote = await getCurrentVote(event.locals.supabase, currentVoteId);

	if (vote === null || vote.id !== voteId || vote.status !== 'open') {
		return { refusal: VOTE_REFUSALS.notOpen };
	}

	return { vote };
}

/**
 * The view's actions, sending the chair back to `returnAddress` once each has
 * worked. Their names say they are the vote's (`openVote`, not `open`),
 * because `chair` spreads them beside the floor's, the queue's and its own
 * actions, where a bare "open" or "close" would not say what it opens. "Cancel vote" and "End voting" change what the room is doing, so
 * they take the chair who pressed them to `chair`, the live room, from
 * wherever they were (`committee-room.md`, "Viewing is not the same as going live").
 */
export function voteActions(returnAddress: ReturnAddress) {
	/** The live room, where a press that changes the room's mode lands. */
	function liveRoom(event: ChairRequestEvent): string {
		return chairRoomUrl(event.params.slug, event.params.committeeSlug);
	}

	return {
		openVote: async (event: ChairRequestEvent) => {
			const { committee, frame } = await openChairRoom(event);
			const formData = await event.request.formData();
			const session = frame.currentSession;
			const state = frame.committeeState;
			// The list the form offered, read again, so a paper voted on meanwhile is refused.
			const subjects =
				session !== null && isSessionRunning(session)
					? await listVoteSubjects(event.locals.supabase, committee.id, session.id)
					: [];
			const { values, errors, input } = readVoteForm(formData, subjects);

			if (session === null || !isSessionRunning(session)) {
				return refuseVoteForm(values, {}, VOTE_REFUSALS.noSession);
			}
			if (frame.latestRollCallId === null) {
				return refuseVoteForm(values, {}, VOTE_REFUSALS.noRollCall);
			}
			if (state.mode === 'suspended') return refuseVoteForm(values, {}, VOTE_REFUSALS.suspended);

			// A closed vote still on show is not in the way: the new one replaces it.
			const current = await getCurrentVote(event.locals.supabase, state.currentVoteId);

			if (current?.status === 'open') return refuseVoteForm(values, {}, VOTE_REFUSALS.voteOpen);
			if (input === null) return refuseVoteForm(values, errors);

			const voteId = readNewRowId(formData.get(NEW_ROW_ID_FIELD));
			const supabase = event.locals.supabase;
			const refusal = await openVoteRow(
				supabase,
				committee.id,
				session.id,
				input,
				new Date(),
				voteId
			);

			if (refusal !== null) return refuseVoteForm(values, {}, refusal);

			returnTo(event, returnAddress(event, frame));
		},

		countVote: async (event: ChairRequestEvent) => {
			const { frame } = await openChairRoom(event);
			const formData = await event.request.formData();
			const counts = readShowOfHands(formData);

			if (counts === null) return refuseChairAction(VOTE_REFUSALS.voteCounts);
			if (totalVotes(counts) > countPresent(frame.attendance)) {
				return refuseChairAction(VOTE_REFUSALS.tooManyVotes);
			}

			const found = await findOpenVote(event, frame, formData);

			if ('refusal' in found) return refuseChairAction(found.refusal);
			if (found.vote.method !== 'show_of_hands') {
				return refuseChairAction(VOTE_REFUSALS.notShowOfHands);
			}

			const wasSaved = await saveHandCount(event.locals.supabase, found.vote.id, counts);

			if (!wasSaved) return refuseChairAction(VOTE_REFUSALS.notOpen);

			returnTo(event, returnAddress(event, frame));
		},

		castRollCall: async (event: ChairRequestEvent) => {
			const { frame } = await openChairRoom(event);
			const formData = await event.request.formData();
			const found = await findOpenVote(event, frame, formData);

			if ('refusal' in found) return refuseChairAction(found.refusal);
			if (found.vote.method !== 'roll_call') return refuseChairAction(VOTE_REFUSALS.notRollCall);

			const choice = readVoteChoice(formData.get('choice'));

			if (choice === null) return refuseChairAction(VOTE_REFUSALS.choice);

			// The latest roll call decides who may vote, and who may not abstain.
			const seatId = String(formData.get('seatId') ?? '');
			const refusal = castRefusal(frame.attendance[seatId], choice);

			if (refusal !== null) return refuseChairAction(refusal);

			await recordRollCallChoice(event.locals.supabase, found.vote.id, seatId, choice);

			returnTo(event, withSeat(returnAddress(event, frame), seatId));
		},

		clearRollCall: async (event: ChairRequestEvent) => {
			const { frame } = await openChairRoom(event);
			const formData = await event.request.formData();
			const found = await findOpenVote(event, frame, formData);

			if ('refusal' in found) return refuseChairAction(found.refusal);

			// The seat has to be one of the room's before the id reaches the
			// database: the delete is scoped by its policy either way, but an id
			// that is not a uuid would be answered with an error, not a refusal.
			const seatId = String(formData.get('seatId') ?? '');

			if (!frame.seats.some((seat) => seat.id === seatId)) {
				return refuseChairAction(VOTE_REFUSALS.seat);
			}

			await clearRollCallChoice(event.locals.supabase, found.vote.id, seatId);

			returnTo(event, withSeat(returnAddress(event, frame), seatId));
		},

		closeVote: async (event: ChairRequestEvent) => {
			const { frame } = await openChairRoom(event);
			const formData = await event.request.formData();
			const found = await findOpenVote(event, frame, formData);

			if ('refusal' in found) return refuseChairAction(found.refusal);

			const { vote } = found;
			// A roll call vote is counted from the seats' answers, and a seat that
			// never answered is not voting. A show of hands is what the chair typed.
			let counts = countEntries(vote.entries);

			if (vote.method === 'show_of_hands') {
				const typed = readShowOfHands(formData);

				if (typed === null) return refuseChairAction(VOTE_REFUSALS.voteCounts);
				if (totalVotes(typed) > countPresent(frame.attendance)) {
					return refuseChairAction(VOTE_REFUSALS.tooManyVotes);
				}

				counts = typed;
			}

			if (totalVotes(counts) === 0) return refuseChairAction(VOTE_REFUSALS.notCounted);

			const hasPassed = voteResult(counts, vote.majority);
			const supabase = event.locals.supabase;
			const wasClosed = await closeVoteRow(supabase, vote.id, counts, hasPassed, new Date());

			if (!wasClosed) return refuseChairAction(VOTE_REFUSALS.notOpen);

			// No toast: the result fills the view, on every screen, until "End voting".
			returnTo(event, returnAddress(event, frame));
		},

		cancelVote: async (event: ChairRequestEvent) => {
			const { committee, frame } = await openChairRoom(event);
			const formData = await event.request.formData();
			const found = await findOpenVote(event, frame, formData);

			if ('refusal' in found) return refuseChairAction(found.refusal);

			const wasCancelled = await cancelVoteRow(event.locals.supabase, committee.id, found.vote.id);

			if (!wasCancelled) return refuseChairAction(VOTE_REFUSALS.notOpen);

			returnTo(event, liveRoom(event));
		},

		endVoting: async (event: ChairRequestEvent) => {
			const { committee, frame } = await openChairRoom(event);
			const state = frame.committeeState;
			const current = await getCurrentVote(event.locals.supabase, state.currentVoteId);

			if (current?.status === 'open') return refuseChairAction(VOTE_REFUSALS.stillOpen);
			if (state.mode !== 'voting') return refuseChairAction(VOTE_REFUSALS.notVoting);

			await endVoting(event.locals.supabase, committee.id);

			returnTo(event, liveRoom(event));
		}
	};
}

/**
 * A roll call vote as it will be once the server has saved the answers just
 * pressed, worked out in the browser so the rows and the tally change at once
 * (T140). The presses come from the chair layout's shared instant form
 * (`$lib/chair-form.ts`, T141), so presses of other kinds are passed over.
 *
 * The prediction is certain: it does what the `castRollCall` and
 * `clearRollCall` actions of the Voting page do, in the order pressed.
 */
import type { InstantPress } from '$lib/instant-form.svelte';
import { readVoteChoice, type VoteChoice } from '$lib/votes';

/** `entries` of the vote `voteId` with the presses on it applied, oldest first. */
export function entriesAfterPresses(
	entries: Record<string, VoteChoice>,
	voteId: string,
	presses: InstantPress<unknown>[]
): Record<string, VoteChoice> {
	const answers = { ...entries };

	for (const press of presses) {
		if (press.formData.get('voteId') !== voteId) continue;

		const seatId = String(press.formData.get('seatId') ?? '');

		if (press.action.search === '?/clearRollCall') delete answers[seatId];

		if (press.action.search === '?/castRollCall') {
			const choice = readVoteChoice(press.formData.get('choice'));

			if (seatId !== '' && choice !== null) answers[seatId] = choice;
		}
	}

	return answers;
}

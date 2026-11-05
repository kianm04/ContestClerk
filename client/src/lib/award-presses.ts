/**
 * What the awards page's "Propose" and "Withdraw" buttons are expected to
 * change, worked out in the browser at the moment of the press (T141).
 * Mirrors `$lib/server/award-changes.ts`'s `proposeAward` and `deleteAward`,
 * so the screen shows what the database will hold.
 *
 * Rewording an existing proposal ("Edit") is not part of this: it keeps the
 * older form that waits for the server before changing the screen
 * (`AwardProposalForm.svelte`), and `$lib/chair-form.ts`'s `FAILURES` table
 * has no `awards?/update` entry.
 */
import { checkAwardForm, type AwardFormValues } from '$lib/award-form';
import type { Award, AwardSeat } from '$lib/awards';
import type { ChairExpectation } from '$lib/chair-form';

/**
 * "Propose": the award as the form checked it, added under `newAwardId` (the
 * id the browser chose, which the server saves the row under). Null when the
 * form is invalid, or the seat already has an award of that kind, either of
 * which the server would refuse; the screen then leaves it to the server's
 * answer rather than guessing wrong.
 */
export function proposeAwardPress(
	values: AwardFormValues,
	seats: AwardSeat[],
	existingAwards: Award[],
	committeeId: string,
	newAwardId: string,
	proposedBy: string
): ChairExpectation | null {
	const checked = checkAwardForm(values, seats);

	if ('problem' in checked) return null;

	const isDuplicate = existingAwards.some(
		(award) => award.seatId === checked.award.seatId && award.kind === checked.award.kind
	);

	if (isDuplicate) return null;

	const seat = seats.find((candidate) => candidate.id === checked.award.seatId);

	const added: Award = {
		id: newAwardId,
		committeeId,
		seatId: checked.award.seatId,
		seatName: checked.award.seatName,
		countryCode: seat?.countryCode ?? null,
		holderName: seat?.delegateName ?? null,
		isSeatEmpty: false,
		kind: checked.award.kind,
		title: checked.award.title,
		status: 'proposed',
		createdBy: proposedBy,
		// Not known in the browser, and nothing on this page shows a proposal's
		// own proposer, so this is an honest "not known" rather than a guess.
		proposerName: null
	};

	return { awards: [{ id: newAwardId, added }] };
}

/** "Withdraw": the proposal is taken off the list. */
export function withdrawAwardPress(awardId: string): ChairExpectation {
	return { awards: [{ id: awardId, isDeleted: true }] };
}

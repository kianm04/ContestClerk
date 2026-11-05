/**
 * The dais's side of amendments (`docs/committee-papers.md`, step 7): one
 * queue across every introduced draft, in the order the dais takes them,
 * and on a draft's review page each amendment approved, ruled out of order
 * or put to the vote, any amendment to it first.
 *
 * `reorder_amendments` numbers the queue and `decide_amendment` decides;
 * these plain functions only sort what the pages show and read what their
 * forms send, so the browser and the server both use them.
 */

import type { AmendmentCard } from '$lib/amendment-cards';
import { paperKindAndNumber } from '$lib/committee-papers';
import { isAmendmentWaiting, type PaperAmendment } from '$lib/paper-amendments';

/** An amendment in the dais's queue, with the draft it amends. */
export type QueuedAmendment = PaperAmendment & {
	paper: { id: string; title: string; topicNumber: number | null; sequence: number | null };
};

/** The amendments waiting for the dais, in the order it will take them. */
export function queuedAmendments<Amendment extends PaperAmendment>(
	amendments: Amendment[]
): Amendment[] {
	return amendments
		.filter((amendment) => amendment.status === 'with_the_dais')
		.sort((first, second) => (first.queuePosition ?? 0) - (second.queuePosition ?? 0));
}

/**
 * A queued amendment's meta line on the dais's list: the draft it amends,
 * who proposed it and whether it is friendly. "Draft resolution 1.1 ·
 * Germany · Friendly".
 */
export function queuedAmendmentMetaLine(
	amendment: Pick<PaperAmendment, 'proposerName' | 'isFriendly'> & {
		paper: { topicNumber: number | null; sequence: number | null };
	}
): string {
	return [
		paperKindAndNumber({ kind: 'draft_resolution', ...amendment.paper }),
		amendment.proposerName,
		amendment.isFriendly ? 'Friendly' : 'Unfriendly'
	]
		.filter((fact) => fact !== null)
		.join(' · ');
}

/** Which way a "Move up" or "Move down" button moves an amendment in the queue. */
export type QueueMove = 'up' | 'down';

/** The direction a form sent, or `null` for anything else. */
export function readQueueMove(form: FormData): QueueMove | null {
	const direction = form.get('direction');

	return direction === 'up' || direction === 'down' ? direction : null;
}

/**
 * The queue's ids with one amendment swapped with its neighbour, as
 * `reorder_amendments` takes them, or `null` when it cannot move that way
 * (the first cannot move up, the last cannot move down).
 */
export function movedQueue(
	queueIds: string[],
	amendmentId: string,
	move: QueueMove
): string[] | null {
	const from = queueIds.indexOf(amendmentId);
	const to = move === 'up' ? from - 1 : from + 1;

	if (from === -1 || to < 0 || to >= queueIds.length) return null;

	const moved = [...queueIds];
	[moved[from], moved[to]] = [moved[to], moved[from]];

	return moved;
}

/** The waiting amendments to this one, which the dais deals with first. */
export function pendingChildren<Amendment extends PaperAmendment>(
	amendment: Amendment,
	amendments: Amendment[]
): Amendment[] {
	return amendments.filter(
		(child) => child.parentAmendmentId === amendment.id && isAmendmentWaiting(child.status)
	);
}

/**
 * One draft's amendments in the order the dais works through them: those
 * still waiting first, each amendment to an amendment just before the
 * amendment it changes, as it is voted on first; then those that have
 * ended, by number.
 */
export function reviewOrder<Amendment extends PaperAmendment>(
	amendments: Amendment[]
): Amendment[] {
	const bySequence = [...amendments].sort((first, second) => first.sequence - second.sequence);
	const waiting = bySequence.filter((amendment) => isAmendmentWaiting(amendment.status));
	const ended = bySequence.filter((amendment) => !isAmendmentWaiting(amendment.status));
	const waitingIds = new Set(waiting.map((amendment) => amendment.id));
	// An amendment to an amendment comes in under its parent, unless its parent has ended.
	const topWaiting = waiting.filter(
		(amendment) =>
			amendment.parentAmendmentId === null || !waitingIds.has(amendment.parentAmendmentId)
	);

	return [
		...topWaiting.flatMap((amendment) => [...pendingChildren(amendment, waiting), amendment]),
		...ended
	];
}

/** What the dais may do with one amendment on the review page. */
export type DaisChoices = {
	/** "Approve" and "Rule out of order", while it waits for the dais. */
	mayDecide: boolean;
	/** "Put to the vote", for an approved amendment none of whose own amendments still wait. */
	mayPutToVote: boolean;
};

export function daisChoices<Amendment extends PaperAmendment>(
	amendment: Amendment,
	amendments: Amendment[]
): DaisChoices {
	return {
		mayDecide: amendment.status === 'with_the_dais',
		mayPutToVote:
			amendment.status === 'approved' && pendingChildren(amendment, amendments).length === 0
	};
}

/** One amendment on the dais's review of a draft, with what the dais may do with it. */
export type DaisAmendmentRow = { card: AmendmentCard; choices: DaisChoices };

/**
 * A draft's amendment cards in the order the dais works through them
 * (`reviewOrder`), each with the dais's choices.
 */
export function daisAmendmentRows(cards: AmendmentCard[]): DaisAmendmentRow[] {
	const amendments = cards.map((card) => card.amendment);
	const cardsById = new Map(cards.map((card) => [card.id, card]));

	return reviewOrder(amendments).flatMap((amendment) => {
		const card = cardsById.get(amendment.id);

		return card === undefined ? [] : [{ card, choices: daisChoices(amendment, amendments) }];
	});
}

/** The longest a ruling may be, as `decide_amendment` checks. */
export const RULING_MAX_LENGTH = 2000;

/** The sentence for a ruling left empty or too long, the database's own. */
export const RULING_REFUSAL = 'Say in at most 2,000 characters why the amendment is out of order.';

/** The ruling typed into "Rule out of order", or `null` when it is empty or too long. */
export function readRuling(form: FormData): string | null {
	const ruling = form.get('ruling');
	if (typeof ruling !== 'string') return null;

	const trimmed = ruling.trim();

	return trimmed === '' || trimmed.length > RULING_MAX_LENGTH ? null : trimmed;
}

/**
 * The amendment an address names by its number, such as `?ruleOut=3`, for
 * the dialog that opens over the page without JavaScript; `null` when the
 * address names none, or one not on the draft.
 */
export function addressedAmendment<Amendment extends PaperAmendment>(
	searchParams: URLSearchParams,
	name: string,
	amendments: Amendment[]
): Amendment | null {
	const sequence = Number(searchParams.get(name));

	return amendments.find((amendment) => amendment.sequence === sequence) ?? null;
}

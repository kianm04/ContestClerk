/**
 * The roll call vote's marker and keys (`specs/05-pages/chair/voting.md`,
 * "Components" and "Keys"): the ▸ marks the seat being called, Y, N and A
 * answer it Yes, No or Abstain and move the marker to the next seat, and ↑
 * and ↓ move the marker. The list asks here what a key means and where the
 * marker goes, then does it, so the rules can be read and tested on their own.
 *
 * Until S15 the roll is read from the top, in the list's own order.
 */

import type { VoteChoice } from '$lib/votes';

/** What one key asks for in the list: move the marker, or answer the marked seat. */
export type RollCallVoteKeyAction =
	{ kind: 'move'; step: 1 | -1 } | { kind: 'answer'; choice: VoteChoice };

/** The letter keys, lower case, and the answer each presses. */
const ANSWER_KEYS: Record<string, VoteChoice> = {
	y: 'for',
	n: 'against',
	a: 'abstain'
};

/**
 * What `key` (`KeyboardEvent.key`) does in the list, or null for every other
 * key. "y" and "Y" mean the same.
 */
export function rollCallVoteKeyAction(key: string): RollCallVoteKeyAction | null {
	if (key === 'ArrowDown') return { kind: 'move', step: 1 };
	if (key === 'ArrowUp') return { kind: 'move', step: -1 };

	const choice = ANSWER_KEYS[key.toLowerCase()];

	return choice ? { kind: 'answer', choice } : null;
}

/**
 * The seat the marker starts on: the one the address names (`?seat=`, the
 * row last pressed without JavaScript), else the first seat that has not
 * answered, else the first seat. Null for an empty list.
 */
export function startingMarkedSeatId(
	seatIds: string[],
	entries: Record<string, VoteChoice>,
	focusedSeatId: string | null
): string | null {
	if (focusedSeatId !== null && seatIds.includes(focusedSeatId)) return focusedSeatId;

	const firstUnanswered = seatIds.find((seatId) => entries[seatId] === undefined);

	return firstUnanswered ?? seatIds[0] ?? null;
}

/**
 * The seat the marker moves to from `seatId` by `step`, staying put at
 * either end of the list. A marker on a seat no longer listed starts again
 * at the top.
 */
export function movedMarkedSeatId(
	seatIds: string[],
	seatId: string | null,
	step: 1 | -1
): string | null {
	const index = seatId === null ? -1 : seatIds.indexOf(seatId);

	if (index === -1) return seatIds[0] ?? null;

	const movedIndex = Math.min(seatIds.length - 1, Math.max(0, index + step));

	return seatIds[movedIndex];
}

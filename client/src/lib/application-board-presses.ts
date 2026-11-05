/**
 * What each of the applications board's three write actions — "Waitlist",
 * "Accept N applications" and "Mark N as not accepted" — changes, worked out
 * in the browser so the screen updates the moment the button is pressed
 * rather than waiting for the server (T142).
 *
 * The table view and the board's own decision panel each keep one instant
 * form (`createInstantForm` in `$lib/instant-form.svelte.ts`) for these three
 * actions, and draw their rows with `rowsAfterPresses(rows, form.presses)`
 * from `$lib/row-changes.ts`.
 *
 * "Accept…" and "Reject…" only open a panel to choose a seat or write a note,
 * and the free seats they offer come from the server, so those two stay on
 * the slower `createInPlaceForm` from `$lib/in-place-form.svelte.ts`; this
 * file has nothing to say about them.
 */
import type { SeatGroup } from '$lib/allocation';
import { findFreeSeat } from '$lib/application-review';
import type { OrganiserApplicationRow } from '$lib/applications';
import type { InstantSubmitInput } from '$lib/instant-form.svelte';
import { pressedAction, pressedField, type RowChange, type RowPress } from '$lib/row-changes';

/** One press of a write action, and the row changes it is expected to make. */
export type ApplicationBoardPress = RowPress<OrganiserApplicationRow>;

/** The three action names this file recognises. */
type ApplicationBoardActionName = 'bulkWaitlist' | 'bulkReject' | 'bulkAccept';

const BOARD_ACTION_NAMES: ApplicationBoardActionName[] = [
	'bulkWaitlist',
	'bulkReject',
	'bulkAccept'
];

/**
 * The action name a press posted to, or null when it posted to something
 * else, such as "Accept…" or "Reject…" opening their panel. `pressedAction`
 * writes the action as `?/bulkWaitlist` or, with the board's own filters in
 * front of it, `?status=submitted&/bulkWaitlist`; either way the name itself
 * is everything after the last `/`.
 */
function boardActionOf(action: URL): ApplicationBoardActionName | null {
	const written = pressedAction(action);
	const name = written.slice(written.lastIndexOf('/') + 1);

	return BOARD_ACTION_NAMES.includes(name as ApplicationBoardActionName)
		? (name as ApplicationBoardActionName)
		: null;
}

/** True when `action` posts to one of this file's three write actions, rather than opening a panel. */
export function isApplicationBoardWriteAction(action: URL): boolean {
	return boardActionOf(action) !== null;
}

/**
 * The applications ticked on a bulk form, each one named only once.
 *
 * The table and the phone cards draw the same rows twice, so a ticked
 * application's hidden checkbox arrives twice; a `Set` keeps the first time
 * each id was seen, the same way the server's own `readTickedIds` does.
 */
function uniqueTickedIds(formData: FormData): string[] {
	const submitted = formData.getAll('ids').map((value) => String(value));

	return [...new Set(submitted)];
}

/**
 * Each ticked applicant's own free-seat suggestions, keyed by their id, the
 * way `form.selected` and `form.suggestions` pair them up by position.
 *
 * Building this once and handing it to `expectApplicationBoardChange` keeps
 * that function from needing to know how the accept panel pairs its two
 * arrays up.
 */
export function seatGroupsByApplicationId(
	selected: OrganiserApplicationRow[],
	suggestions: SeatGroup[][]
): Map<string, SeatGroup[]> {
	const groupsById = new Map<string, SeatGroup[]>();

	selected.forEach((application, index) => {
		groupsById.set(application.id, suggestions[index] ?? []);
	});

	return groupsById;
}

/**
 * What a press of "Waitlist", "Accept N applications" or "Mark N as not
 * accepted" will change, given the free seats offered to each ticked
 * applicant when the press is "Accept N applications". Null for a press this
 * file does not recognise, or one it cannot predict, which the instant form
 * then leaves unpredicted so the page falls back to the server's own answer.
 *
 * An accept is only predicted when every ticked applicant's chosen seat is
 * one of the free seats the panel offered them: the same thing the server
 * checks with `validateBulkSeatChoices` before it writes anything, so a press
 * this function cannot predict is one the server is also about to refuse.
 */
export function expectApplicationBoardChange(
	input: InstantSubmitInput,
	seatGroupsById: Map<string, SeatGroup[]>
): RowChange<OrganiserApplicationRow>[] | null {
	const action = boardActionOf(input.action);
	const ids = uniqueTickedIds(input.formData);

	if (action === null || ids.length === 0) return null;

	if (action === 'bulkWaitlist') {
		return ids.map((id) => ({ id, changes: { status: 'waitlisted' } }));
	}

	if (action === 'bulkReject') {
		return ids.map((id) => ({ id, changes: { status: 'rejected' } }));
	}

	const changes: RowChange<OrganiserApplicationRow>[] = [];

	for (const id of ids) {
		const seatId = pressedField(input.formData, `seat:${id}`);
		const groups = seatGroupsById.get(id) ?? [];
		const choice = findFreeSeat(groups, seatId);

		if (choice === null) return null;

		changes.push({
			id,
			changes: { status: 'accepted', seatLabel: `${choice.committeeLabel} · ${choice.seat.name}` }
		});
	}

	return changes;
}

/** "was" for one application, "were" for more than one. */
function wasOrWere(count: number): string {
	return count === 1 ? 'was' : 'were';
}

/** "The application" for one, "The 6 applications" for more than one. */
function applicationsSubject(count: number): string {
	return count === 1 ? 'The application' : `The ${count} applications`;
}

/** What did not happen when a press failed, for its toast. */
export function describeApplicationBoardFailure(press: ApplicationBoardPress): string {
	const count = uniqueTickedIds(press.formData).length;
	const subject = applicationsSubject(count);
	const verb = wasOrWere(count);
	const action = boardActionOf(press.action);

	if (action === 'bulkWaitlist') return `${subject} ${verb} not waitlisted.`;
	if (action === 'bulkReject') return `${subject} ${verb} not marked as not accepted.`;
	if (action === 'bulkAccept') return `${subject} ${verb} not accepted.`;

	return `${subject} ${verb} not changed.`;
}

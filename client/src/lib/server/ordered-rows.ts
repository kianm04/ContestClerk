/**
 * Putting one row of an organiser's ordered list at a new place, which is what
 * a drop of a dragged row saves (T132): the committees of a conference, the
 * seats of a committee, the custom questions of the application form and the
 * fees. The arrow buttons on the same rows still swap a row with its
 * neighbour through each topic's own `move…` function.
 *
 * The four tables keep their order the same way, in a `position` column where
 * lower comes first and `id` breaks a tie, so one function serves them all.
 * The arithmetic is `positionsAfterDrop` in `$lib/drag-order.ts`.
 *
 * Files under `$lib/server` only ever run on the server. Pages pass in
 * `locals.supabase`, the client that knows who is signed in, so Row Level
 * Security decides whose rows can be read and moved: an organiser of another
 * conference sees no rows at all.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { positionsAfterDrop, type RowPosition } from '$lib/drag-order';

/** One ordered list: the table its rows are in, and what the rows belong to. */
export type OrderedList = {
	table: 'committees' | 'seats' | 'application_questions' | 'fees';
	/** The column naming what the list belongs to: the conference, or the committee for seats. */
	ownerColumn: 'conference_id' | 'committee_id';
	/** The id of that conference or committee. */
	ownerId: string;
};

/** Every row of the list with its position, in the order the pages draw them. */
async function readRowPositions(
	supabase: SupabaseClient,
	list: OrderedList
): Promise<RowPosition[]> {
	const { data, error } = await supabase
		.from(list.table)
		.select('id, position')
		.eq(list.ownerColumn, list.ownerId)
		.order('position', { ascending: true })
		.order('id', { ascending: true })
		.overrideTypes<RowPosition[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the order of the list: ${error.message}`);
	}

	return data ?? [];
}

/** Write one row's new position. */
async function writeRowPosition(
	supabase: SupabaseClient,
	list: OrderedList,
	row: RowPosition
): Promise<void> {
	const { error } = await supabase
		.from(list.table)
		.update({ position: row.position })
		.eq('id', row.id)
		.eq(list.ownerColumn, list.ownerId);

	if (error) {
		throw new Error(`Could not save the new order: ${error.message}`);
	}
}

/**
 * Put the row `rowId` at `toIndex` (counting from 0) of its list, with the rows
 * in between closing up, and answer whether the row was in that list. `false`
 * means it was not, or no longer is, and nothing was written. A place past the
 * end of the list means last.
 *
 * Only rows whose position changes are written. None of the writes needs
 * another's answer, so they all start at once.
 */
export async function placeOrderedRow(
	supabase: SupabaseClient,
	list: OrderedList,
	rowId: string,
	toIndex: number
): Promise<boolean> {
	const rows = await readRowPositions(supabase, list);
	const isInList = rows.some((row) => row.id === rowId);

	if (!isInList) {
		return false;
	}

	const changed = positionsAfterDrop(rows, rowId, toIndex);
	await Promise.all(changed.map((row) => writeRowPosition(supabase, list, row)));

	return true;
}

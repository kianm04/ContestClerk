/**
 * What an instant form's press does to the rows of a list, and the list as it
 * will be once the server has saved it (T141, T142).
 *
 * A component hands `form.submitExpecting(...)` to `use:enhance` and says, at
 * the moment of the press, which rows the press changes: fields it sets on a
 * row, a row it takes away, or a row it adds. The page then draws its rows
 * with `rowsAfterPresses(rows, form.presses)`, so the result shows before the
 * server answers. The form itself is `createInstantForm` in
 * `$lib/instant-form.svelte.ts`.
 *
 * Every change says what a row will be, never "one more": laid over rows that
 * already hold it, it changes nothing, so nothing flickers when the saved rows
 * arrive before the answer does.
 */
import type { InstantPress, InstantSubmitInput } from '$lib/instant-form.svelte';

/**
 * What a press does to one row of a list, by the row's id: `added` is a new
 * row, `changes` are fields set on it, and `isDeleted` takes it away.
 */
export type RowChange<Row extends { id: string }> = {
	id: string;
	added?: Row;
	changes?: Partial<Row>;
	isDeleted?: boolean;
};

/**
 * The part of a press that working out its changes reads: where it posted and
 * the fields it sent. `use:enhance` hands over more, but asking for only this
 * lets the unit tests build a press without a page.
 */
export type PressedForm = Pick<InstantSubmitInput, 'action' | 'formData'>;

/** An instant press whose note is the rows it changes. */
export type RowPress<Row extends { id: string }> = InstantPress<RowChange<Row>[]>;

/**
 * `rows` with `changes` laid on top, in order. A row that is already there is
 * not added again: that is the saved row, which realtime brought in before the
 * press was answered. A change to a row that is not there is left out.
 */
export function rowsAfterChanges<Row extends { id: string }>(
	rows: Row[],
	changes: RowChange<Row>[]
): Row[] {
	let shown = [...rows];

	for (const change of changes) {
		if (change.isDeleted) {
			shown = shown.filter((row) => row.id !== change.id);
			continue;
		}

		const index = shown.findIndex((row) => row.id === change.id);

		if (index === -1) {
			if (change.added) shown.push(change.added);
			continue;
		}

		if (change.changes) shown[index] = { ...shown[index], ...change.changes };
	}

	return shown;
}

/**
 * `rows` with the changes of every press still on its way laid on top, oldest
 * press first. A press that said nothing about the rows leaves them alone.
 */
export function rowsAfterPresses<Row extends { id: string }>(
	rows: Row[],
	presses: RowPress<Row>[]
): Row[] {
	const changes: RowChange<Row>[] = [];

	for (const press of presses) {
		if (press.expected !== null) changes.push(...press.expected);
	}

	return rowsAfterChanges(rows, changes);
}

/**
 * The action a press posted to, written the way a form writes it: `?/delete`.
 * A page with a filter in its address puts that first, as in
 * `?status=submitted&/delete`, and SvelteKit reads the action from the one
 * query key that starts with a slash, so this does the same.
 */
export function pressedAction(action: URL): string {
	for (const key of action.searchParams.keys()) {
		if (key.startsWith('/')) return `?${key}`;
	}

	return action.search;
}

/** One text field of a press, or an empty string when it was not sent. */
export function pressedField(formData: FormData, name: string): string {
	const value = formData.get(name);

	return typeof value === 'string' ? value : '';
}

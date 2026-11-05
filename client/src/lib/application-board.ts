/**
 * The organiser's applications as a board (T135): one column per state, and
 * what dragging an application from one column to another means. No Svelte
 * here, so every rule can be read and tested on its own.
 *
 * A drop does not have a server action of its own. It posts to the same action
 * the bulk bar's button would, with the one application as the ticked row, so
 * the rules, the confirmations and the notices are the bulk bar's exactly:
 * Waitlist decides at once, and Accept… and Reject… first open the seat panel
 * or the note panel above the board.
 */
import {
	nextStatuses,
	type ApplicationListQuery,
	type ListedApplicationStatus,
	type OrganiserApplicationRow
} from '$lib/applications';

/**
 * The columns, left to right: the queue, then the three states an organiser
 * moves an application into. Withdrawn is left out, because only the applicant
 * can withdraw, so nothing can be dropped there; its tab still lists them.
 */
export const APPLICATION_BOARD_STATUSES: ListedApplicationStatus[] = [
	'submitted',
	'waitlisted',
	'accepted',
	'rejected'
];

/** The id of the hidden form a drop is posted through. */
export const APPLICATION_DROP_FORM_ID = 'application-drop-form';

/** The id of the panel a drop onto Accepted or Not accepted opens, so it can be scrolled to. */
export const APPLICATION_BOARD_PANEL_ID = 'application-board-panel';

/** One column of the board. */
export type ApplicationBoardColumn = {
	status: ListedApplicationStatus;
	/** The first page of this state's applications, filtered and sorted like the table. */
	rows: OrganiserApplicationRow[];
	/** How many applications are in this state altogether, which may be more than `rows`. */
	total: number;
};

/** The bulk bar's action that a drop onto a column posts to. */
export type ApplicationDropAction = 'bulkWaitlist' | 'chooseAccept' | 'chooseReject';

/** Which action each column that takes a drop posts to. */
const DROP_ACTIONS: Partial<Record<ListedApplicationStatus, ApplicationDropAction>> = {
	waitlisted: 'bulkWaitlist',
	accepted: 'chooseAccept',
	rejected: 'chooseReject'
};

/** An application shown in another column than the one the database has it in, for now. */
export type ApplicationBoardMove = {
	application: OrganiserApplicationRow;
	to: ListedApplicationStatus;
};

/**
 * What dropping an application in state `from` onto the column `to` posts to,
 * or null when that column does not take it.
 *
 * The statuses an organiser may choose come from `nextStatuses`, the status
 * machine of `06-features/applications.md`. An accepted application is never
 * dragged: taking back an acceptance frees a seat, and that is the review
 * page's "Revoke", which the bulk bar does not do either.
 */
export function applicationDropAction(
	from: ListedApplicationStatus,
	to: ListedApplicationStatus
): ApplicationDropAction | null {
	if (from === 'accepted') return null;
	if (!nextStatuses(from, 'organiser').includes(to)) return null;

	return DROP_ACTIONS[to] ?? null;
}

/** Can this application be picked up at all? Only when some column would take it. */
export function isDraggableApplication(status: ListedApplicationStatus): boolean {
	return APPLICATION_BOARD_STATUSES.some((to) => applicationDropAction(status, to) !== null);
}

/**
 * The query a drop and its panel post with: the application's own state as the
 * tab, on the first page.
 *
 * The accept and reject actions find the ticked rows again by reading the tab
 * in the address, and a column is the first page of its state's tab, so this is
 * the tab the dragged card was drawn from. It keeps the view, so the redirect
 * after the decision comes back to the board.
 */
export function boardColumnQuery(
	query: ApplicationListQuery,
	status: ListedApplicationStatus
): ApplicationListQuery {
	return { ...query, status, page: 1, view: 'board' };
}

/**
 * The moves an open panel stands for: each application it names, shown in
 * the column the panel would move it to until the organiser presses its button
 * or leaves it.
 */
export function panelMoves(
	panel: 'accept' | 'reject' | null,
	selected: OrganiserApplicationRow[]
): ApplicationBoardMove[] {
	if (panel === null) return [];

	const to: ListedApplicationStatus = panel === 'accept' ? 'accepted' : 'rejected';

	return selected.map((application) => ({ application, to }));
}

/** One column with one move applied: the card taken out, or put at the top. */
function applyMove(
	column: ApplicationBoardColumn,
	move: ApplicationBoardMove
): ApplicationBoardColumn {
	const withoutCard = column.rows.filter((row) => row.id !== move.application.id);
	const hadCard = withoutCard.length !== column.rows.length;

	if (column.status === move.to && !hadCard) {
		return { ...column, rows: [move.application, ...withoutCard], total: column.total + 1 };
	}

	if (column.status !== move.to && hadCard) {
		return { ...column, rows: withoutCard, total: column.total - 1 };
	}

	return column;
}

/**
 * The board as it will be once these moves have landed, so a drop shows at
 * once. The moved card goes to the top of its new column. When the server has
 * answered, `load` draws the board again from the database and this is
 * dropped.
 */
export function showBoardMoves(
	columns: ApplicationBoardColumn[],
	moves: ApplicationBoardMove[]
): ApplicationBoardColumn[] {
	return moves.reduce((shown, move) => shown.map((column) => applyMove(column, move)), columns);
}

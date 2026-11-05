/**
 * The columns of the organiser's applications board (T135), read from the
 * database. Files under `$lib/server` only ever run on the server.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	APPLICATION_BOARD_STATUSES,
	boardColumnQuery,
	type ApplicationBoardColumn
} from '$lib/application-board';
import type { ApplicationListQuery } from '$lib/applications';
import { listApplications } from '$lib/server/application-table';

/**
 * Every column of the board: the first page of each state's tab, searched,
 * filtered and sorted exactly as the table would be, and how many that state
 * holds altogether.
 *
 * It is the table's own query once per column, so the board can never show an
 * application the table would not, and a column stops at one page of 25 the
 * way a tab does. The column links to its tab for the rest.
 */
export async function listApplicationBoard(
	supabase: SupabaseClient,
	conferenceId: string,
	query: ApplicationListQuery
): Promise<ApplicationBoardColumn[]> {
	// The columns do not need each other's answers, so they are read side by side.
	const pages = await Promise.all(
		APPLICATION_BOARD_STATUSES.map((status) =>
			listApplications(supabase, conferenceId, boardColumnQuery(query, status))
		)
	);

	return APPLICATION_BOARD_STATUSES.map((status, index) => ({
		status,
		rows: pages[index].rows,
		total: pages[index].total
	}));
}

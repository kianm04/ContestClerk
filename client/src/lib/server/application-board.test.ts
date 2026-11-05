import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_APPLICATION_LIST_QUERY } from '$lib/applications';

// The table's query is stood in for: what it asks the database has its own
// tests in `application-table.test.ts`. These are about which pages the board
// asks it for.
vi.mock('$lib/server/application-table', () => ({ listApplications: vi.fn() }));

import { listApplicationBoard } from './application-board';
import { listApplications } from '$lib/server/application-table';

/** The Supabase client, which is only handed on. */
const SUPABASE = {} as never;

const CONFERENCE_ID = 'conference-1';

beforeEach(() => {
	vi.mocked(listApplications).mockReset();
	// Each state answers with an empty page and a total that says which state it was.
	vi.mocked(listApplications).mockImplementation(async (_supabase, _conferenceId, query) => ({
		rows: [],
		total: query.status.length
	}));
});

describe('listApplicationBoard', () => {
	it('reads the first page of each column state with the filters kept', async () => {
		const query = {
			...EMPTY_APPLICATION_LIST_QUERY,
			q: 'anna',
			country: 'PL',
			sort: 'name' as const,
			page: 4,
			view: 'board' as const
		};

		await listApplicationBoard(SUPABASE, CONFERENCE_ID, query);

		const asked = vi.mocked(listApplications).mock.calls.map((call) => call[2]);

		expect(asked.map((columnQuery) => columnQuery.status)).toEqual([
			'submitted',
			'waitlisted',
			'accepted',
			'rejected'
		]);

		for (const columnQuery of asked) {
			expect(columnQuery).toMatchObject({ q: 'anna', country: 'PL', sort: 'name', page: 1 });
		}
	});

	it('answers one column per state, in order, with its rows and its total', async () => {
		const columns = await listApplicationBoard(
			SUPABASE,
			CONFERENCE_ID,
			EMPTY_APPLICATION_LIST_QUERY
		);

		expect(columns).toEqual([
			{ status: 'submitted', rows: [], total: 'submitted'.length },
			{ status: 'waitlisted', rows: [], total: 'waitlisted'.length },
			{ status: 'accepted', rows: [], total: 'accepted'.length },
			{ status: 'rejected', rows: [], total: 'rejected'.length }
		]);
	});
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Conference } from '$lib/conferences';
import { SAMPLE_CONFERENCE } from '$lib/styleguide-samples';
import { listConferencesByIds } from './conferences';
import { readChecklistCounts } from './manage';
import { loadSetupProgress, loadSidebarCount, loadSwitcherConferences } from './manage-layout';
import { readManageableConferenceIds } from './my-permissions';

// The conference lists and the checklist counts have their own tests, so they
// are replaced with stand-ins here; `vi.mock` swaps a module for the one the
// factory returns before this file imports it.
vi.mock('./conferences', () => ({
	listConferencesByIds: vi.fn(async () => [])
}));
vi.mock('./my-permissions', () => ({
	readManageableConferenceIds: vi.fn(async () => new Set<string>())
}));
vi.mock('./manage', () => ({ readChecklistCounts: vi.fn(async () => ({})) }));

/** A published conference from 12 to 15 February 2027, applications open until 1 December. */
const CONFERENCE: Conference = {
	...SAMPLE_CONFERENCE,
	id: 'conference-1',
	applicationsOpenAt: '2026-09-01T09:00:00Z',
	applicationsCloseAt: '2026-12-01T09:00:00Z'
};

/** What one table answers: rows for a list, a number for a count. */
type Answer = { data?: unknown[]; count?: number };

/**
 * A client that answers each table with what `answers` holds for it, and
 * writes down every filter it was given, so a test can see what was asked.
 */
function makeStandIn(answers: Record<string, Answer> = {}) {
	const filters: string[] = [];

	function from(table: string) {
		const answer = { data: [], count: 0, ...answers[table], error: null };

		const query = {
			select: () => query,
			eq: (column: string, value: unknown) => {
				filters.push(`${table}.${column}=${value}`);
				return query;
			},
			is: (column: string, value: unknown) => {
				filters.push(`${table}.${column} is ${value}`);
				return query;
			},
			overrideTypes: () => Promise.resolve(answer),
			// `await` on the query itself asks for `then`, which answers the read.
			then: (resolve: (value: typeof answer) => void) => resolve(answer)
		};

		return query;
	}

	/**
	 * `rpc` calls a function in the database. It is answered like a table named
	 * after the function, and the call is written down among the filters so a
	 * test can see which function was asked, and what.
	 */
	function rpc(name: string, functionArguments: Record<string, unknown>) {
		filters.push(`rpc:${name}(${JSON.stringify(functionArguments)})`);

		return from(name);
	}

	const supabase = { from, rpc } as unknown as SupabaseClient;

	return { supabase, filters };
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('loadSetupProgress', () => {
	it('reads nothing for a conference that is no longer a draft', async () => {
		const { supabase, filters } = makeStandIn();

		const progress = await loadSetupProgress(supabase, CONFERENCE, new Date('2026-10-02'));

		expect(progress).toBeNull();
		expect(filters).toEqual([]);
		expect(readChecklistCounts).not.toHaveBeenCalled();
	});

	it('ticks Committees and Fees from the counts, and Team from the invitations', async () => {
		vi.mocked(readChecklistCounts).mockResolvedValueOnce({
			'conference-1': {
				committeeCount: 2,
				committeesWithoutAvailableSeatsCount: 0,
				onlyCommitteeWithoutSeatsId: null,
				feeCount: 1,
				collectsPaymentsManually: false
			}
		});
		const { supabase } = makeStandIn({ conference_staff: { count: 0 }, invites: { count: 1 } });
		const draft: Conference = { ...CONFERENCE, status: 'draft' };

		const progress = await loadSetupProgress(supabase, draft, new Date('2026-10-02'));

		expect(progress).toMatchObject({ committees: true, fees: true, team: true });
	});

	it('leaves Team undone while nobody is on the team or invited', async () => {
		const { supabase } = makeStandIn({ conference_staff: { count: 0 }, invites: { count: 0 } });
		const draft: Conference = { ...CONFERENCE, status: 'draft' };

		const progress = await loadSetupProgress(supabase, draft, new Date('2026-10-02'));

		expect(progress?.team).toBe(false);
		expect(progress?.committees).toBe(false);
	});
});

describe('loadSidebarCount', () => {
	it('counts the applications waiting while applications are open', async () => {
		const { supabase, filters } = makeStandIn({ applications: { count: 4 } });

		const count = await loadSidebarCount(supabase, CONFERENCE, new Date('2026-10-02'));

		expect(count).toEqual({ link: 'applications', value: 4 });
		expect(filters).toContain('applications.status=submitted');
	});

	it('counts the free seats once applications have closed', async () => {
		const { supabase, filters } = makeStandIn({ seats: { count: 12 } });

		const count = await loadSidebarCount(supabase, CONFERENCE, new Date('2027-01-10'));

		expect(count).toEqual({ link: 'allocation', value: 12 });
		expect(filters).toContain('seats.committees.conference_id=conference-1');
		expect(filters).toContain('seats.user_id is null');
	});

	it('counts nothing while the conference is on', async () => {
		const { supabase, filters } = makeStandIn();

		const count = await loadSidebarCount(supabase, CONFERENCE, new Date('2027-02-13T12:00:00Z'));

		expect(count).toBeNull();
		expect(filters).toEqual([]);
	});

	it('counts the proposed awards once it is over', async () => {
		const { supabase, filters } = makeStandIn({ awards: { count: 3 } });

		const count = await loadSidebarCount(supabase, CONFERENCE, new Date('2027-03-01'));

		expect(count).toEqual({ link: 'awards', value: 3 });
		expect(filters).toContain('awards.status=proposed');
	});
});

describe('loadSwitcherConferences', () => {
	it('offers the conferences the reader may manage, leaving out archived ones, soonest first', async () => {
		const later: Conference = {
			...CONFERENCE,
			id: 'later',
			slug: 'later',
			startDate: '2027-06-01'
		};
		const sooner: Conference = {
			...CONFERENCE,
			id: 'sooner',
			slug: 'sooner',
			startDate: '2026-11-01'
		};
		const archived: Conference = { ...CONFERENCE, id: 'old', slug: 'old', status: 'archived' };
		vi.mocked(readManageableConferenceIds).mockResolvedValueOnce(
			new Set(['later', 'sooner', 'old'])
		);
		vi.mocked(listConferencesByIds).mockResolvedValueOnce([later, archived, sooner]);
		const { supabase } = makeStandIn();

		const conferences = await loadSwitcherConferences(supabase);

		expect(conferences.map((conference) => conference.slug)).toEqual(['sooner', 'later']);
		// Only the conferences whose management area opens for the reader: a
		// plain organisation member without a role on one would meet a 404.
		expect(listConferencesByIds).toHaveBeenCalledWith(supabase, ['later', 'sooner', 'old']);
	});
});

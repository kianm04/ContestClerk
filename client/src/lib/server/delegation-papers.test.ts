import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	findDelegationPaper,
	listDelegationPapers,
	readCommitteeTopics,
	readDelegationSharing,
	readPaperSharing
} from './delegation-papers';

// What `delegation_papers` answers whom, and what the drafts' policies allow,
// is tested against the database in `tests/db/delegation-paper-drafts.test.ts`.
// These tests are about how this module asks and how it reads the answers.
vi.mock('$lib/server/delegations', () => ({ getMyDelegationFor: vi.fn() }));

import { getMyDelegationFor } from '$lib/server/delegations';

/** One row of `delegation_papers`, as the database answers it. */
const ROW = {
	seat_id: 'seat-france',
	seat_name: 'France',
	country_code: 'FR',
	committee_id: 'committee-1',
	committee_name: 'Security Council',
	committee_slug: 'unsc',
	holder_id: 'rachel',
	holder_name: null,
	paper_kind: null,
	review_status: null,
	review_comment: null,
	draft_updated_by: 'tom',
	draft_updated_by_name: 'Tom Price',
	draft_updated_at: '2099-01-10T11:55:00Z',
	word_count: 4
};

/** What a stand-in query answers with, by table, and the function's rows. */
type StandInAnswers = {
	rpcRows?: unknown[];
	tables?: Record<string, unknown>;
};

/** A stand-in Supabase client that writes down every table and filter it was asked for. */
function createStandIn(answers: StandInAnswers = {}) {
	const calls: { table: string; filters: [string, unknown][] }[] = [];
	const rpc = vi.fn(async () => ({ data: answers.rpcRows ?? [], error: null }));

	function from(table: string) {
		const call = { table, filters: [] as [string, unknown][] };
		calls.push(call);
		const answer = async () => ({ data: answers.tables?.[table] ?? null, error: null });

		// Every step hands the builder back, which is what lets the module chain them.
		const builder = {
			select: () => builder,
			eq: (column: string, value: unknown) => {
				call.filters.push([column, value]);
				return builder;
			},
			in: (column: string, value: unknown) => {
				call.filters.push([column, value]);
				return builder;
			},
			order: () => builder,
			maybeSingle: () => builder,
			overrideTypes: answer
		};

		return builder;
	}

	return { supabase: { from, rpc } as unknown as SupabaseClient, calls, rpc };
}

beforeEach(() => {
	vi.mocked(getMyDelegationFor).mockReset();
});

describe('listDelegationPapers', () => {
	it('asks `delegation_papers` and names a member whose name cannot be read', async () => {
		const { supabase, rpc } = createStandIn({ rpcRows: [ROW] });

		const papers = await listDelegationPapers(supabase, 'delegation-1');

		expect(rpc).toHaveBeenCalledWith('delegation_papers', {
			target_delegation_id: 'delegation-1'
		});
		expect(papers).toEqual([
			{
				seatId: 'seat-france',
				seatName: 'France',
				countryCode: 'FR',
				committeeName: 'Security Council',
				committeeSlug: 'unsc',
				holderId: 'rachel',
				holderName: 'A member',
				paperKind: null,
				reviewStatus: null,
				reviewComment: null,
				lastEditedById: 'tom',
				lastEditedByName: 'Tom Price',
				lastEditedAt: '2099-01-10T11:55:00Z',
				wordCount: 4
			}
		]);
	});

	it('finds one seat in the list, or nothing for a seat no member holds', async () => {
		const { supabase } = createStandIn({ rpcRows: [ROW] });

		expect((await findDelegationPaper(supabase, 'delegation-1', 'seat-france'))?.seatId).toBe(
			'seat-france'
		);
		expect(await findDelegationPaper(supabase, 'delegation-1', 'seat-brazil')).toBeNull();
	});
});

describe('readCommitteeTopics', () => {
	it("reads the committee's topics at this conference, or none", async () => {
		const { supabase, calls } = createStandIn({ tables: { committees: { topics: ['Arms'] } } });

		expect(await readCommitteeTopics(supabase, 'unsc', 'conference-1')).toEqual(['Arms']);
		expect(calls[0].filters).toEqual([
			['conference_id', 'conference-1'],
			['slug', 'unsc']
		]);
		expect(await readCommitteeTopics(createStandIn().supabase, 'unsc', 'conference-1')).toEqual([]);
	});
});

describe('readDelegationSharing and readPaperSharing', () => {
	const tables = {
		delegation_members: [{ user_id: 'rachel' }, { user_id: 'tom' }],
		profiles: [
			{ id: 'rachel', full_name: 'Rachel Morgan' },
			{ id: 'tom', full_name: 'Tom Price' }
		]
	};

	it('names everybody in the delegation', async () => {
		const { supabase, calls } = createStandIn({ tables });

		const sharing = await readDelegationSharing(supabase, { id: 'delegation-1', name: 'StA' });

		expect(sharing).toEqual({
			delegationName: 'StA',
			members: [
				{ id: 'rachel', name: 'Rachel Morgan' },
				{ id: 'tom', name: 'Tom Price' }
			]
		});
		expect(calls[1].filters).toEqual([['id', ['rachel', 'tom']]]);
	});

	it("reads the delegate's delegation at the conference, or null for one writing alone", async () => {
		const { supabase } = createStandIn({ tables });
		vi.mocked(getMyDelegationFor).mockResolvedValueOnce(null);

		expect(await readPaperSharing(supabase, 'conference-1', 'rachel')).toBeNull();

		vi.mocked(getMyDelegationFor).mockResolvedValueOnce({
			id: 'delegation-1',
			name: 'StA'
		} as unknown as Awaited<ReturnType<typeof getMyDelegationFor>>);

		expect((await readPaperSharing(supabase, 'conference-1', 'rachel'))?.members).toHaveLength(2);
		expect(getMyDelegationFor).toHaveBeenCalledWith(supabase, 'conference-1', 'rachel');
	});
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommitteeStateView } from '$lib/chair-room';
import {
	cancelOpenVotes,
	cancelVote,
	clearRollCallChoice,
	closeVote,
	endVoting,
	getCurrentVote,
	getVotes,
	openVote,
	recordRollCallChoice,
	saveHandCount
} from './votes';

// Nothing here talks to a database. The stand-in client below writes down each
// query the functions make and answers them in turn with fixed rows. The
// shared room writes in `./committee-room` are stood in for too, so these
// tests check what reaches `committee_state`. Row Level Security is tested in
// `tests/db/`, and the whole page runs against a real database in
// `tests/e2e/voting.spec.ts`.
// The two cleared groups of columns are stood in for by one column each, which
// is enough to see that they reach `committee_state`.
vi.mock('./committee-room', () => ({
	CLEARED_CAUCUS_CLOCK: { caucus_total_seconds: null },
	CLEARED_SUSPENSION: { suspended_at: null },
	finishSpeechInProgress: vi.fn(),
	readCommitteeState: vi.fn(),
	readGeneralSpeakersListId: vi.fn(),
	timerColumns: vi.fn(() => ({ timer_total_seconds: null })),
	updateCommitteeState: vi.fn()
}));

import {
	finishSpeechInProgress,
	readCommitteeState,
	readGeneralSpeakersListId,
	updateCommitteeState
} from './committee-room';

/** An answer to one query, in the shape the real client gives one. */
type Answer = { data: unknown; error: { code?: string; message: string } | null };

/** What one query asked for. */
type RecordedQuery = {
	table: string;
	eq: [string, unknown][];
	written: Record<string, unknown> | null;
	writeKind: 'insert' | 'update' | 'upsert' | 'delete' | null;
	upsertOptions: unknown;
};

/** One step of a query. Every step hands the builder back, and awaiting it gives the answer. */
type QueryBuilder = {
	then: (resolve: (answer: Answer) => void) => void;
	select: () => QueryBuilder;
	insert: (row: Record<string, unknown>) => QueryBuilder;
	update: (columns: Record<string, unknown>) => QueryBuilder;
	upsert: (row: Record<string, unknown>, options: unknown) => QueryBuilder;
	delete: () => QueryBuilder;
	eq: (column: string, value: unknown) => QueryBuilder;
	order: () => QueryBuilder;
	single: () => QueryBuilder;
	maybeSingle: () => QueryBuilder;
	overrideTypes: () => QueryBuilder;
};

/** A stand-in Supabase client whose queries answer `answers`, one each, in order. */
function createStandIn(answers: Answer[]) {
	const queries: RecordedQuery[] = [];

	function startQuery(table: string): QueryBuilder {
		const record: RecordedQuery = {
			table,
			eq: [],
			written: null,
			writeKind: null,
			upsertOptions: null
		};
		const answer = answers[queries.length] ?? { data: null, error: null };
		queries.push(record);

		const builder: QueryBuilder = {
			then: (resolve) => resolve(answer),
			select: () => builder,
			insert: (row) => {
				record.writeKind = 'insert';
				record.written = row;
				return builder;
			},
			update: (columns) => {
				record.writeKind = 'update';
				record.written = columns;
				return builder;
			},
			upsert: (row, options) => {
				record.writeKind = 'upsert';
				record.written = row;
				record.upsertOptions = options;
				return builder;
			},
			delete: () => {
				record.writeKind = 'delete';
				return builder;
			},
			eq: (column, value) => {
				record.eq.push([column, value]);
				return builder;
			},
			order: () => builder,
			single: () => builder,
			maybeSingle: () => builder,
			overrideTypes: () => builder
		};

		return builder;
	}

	const supabase = { from: startQuery } as unknown as SupabaseClient;

	return { supabase, queries };
}

const NOW = new Date('2026-01-01T10:00:00.000Z');

/** A vote row as the database returns it. */
function voteRow(id: string, status: 'open' | 'closed') {
	return {
		id,
		subject: 'Draft Resolution 1.1',
		kind: 'substantive',
		method: 'roll_call',
		majority: 'simple',
		status,
		votes_for: status === 'closed' ? 9 : null,
		votes_against: status === 'closed' ? 3 : null,
		votes_abstain: status === 'closed' ? 1 : null,
		passed: status === 'closed' ? true : null,
		opened_at: '2026-01-01T09:00:00.000Z',
		closed_at: status === 'closed' ? '2026-01-01T09:05:00.000Z' : null
	};
}

/** The room while France speaks on the General Speakers' List, as `readCommitteeState` reads it. */
const FRANCE_SPEAKING: CommitteeStateView = {
	currentSessionId: 'session-1',
	mode: 'formal_debate',
	currentMotionId: null,
	activeSpeakersListId: 'list-gsl',
	currentSpeakerEntryId: 'entry-fr',
	currentVoteId: null,
	agendaTopic: null,
	timer: { totalSeconds: 60, endsAt: '2026-01-01T10:00:20.000Z', pausedRemainingSeconds: null }
};

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(readGeneralSpeakersListId).mockResolvedValue('list-gsl');
	vi.mocked(readCommitteeState).mockResolvedValue(FRANCE_SPEAKING);
});

describe('getVotes', () => {
	it("reads every vote of the session and the current vote's answers", async () => {
		const { supabase, queries } = createStandIn([
			{ data: [voteRow('vote-2', 'open'), voteRow('vote-1', 'closed')], error: null },
			{ data: [{ seat_id: 'seat-br', choice: 'for' }], error: null }
		]);

		const votes = await getVotes(supabase, 'session-1', 'vote-2');

		expect(queries[0]).toMatchObject({ table: 'votes', eq: [['session_id', 'session-1']] });
		expect(queries[1]).toMatchObject({ table: 'vote_entries', eq: [['vote_id', 'vote-2']] });
		expect(votes.currentVote).toMatchObject({
			id: 'vote-2',
			kind: 'substantive',
			entries: { 'seat-br': 'for' }
		});
		expect(votes.closedVotes).toHaveLength(1);
		expect(votes.closedVotes[0]).toMatchObject({ id: 'vote-1', votesFor: 9, passed: true });
	});

	it('keeps a closed vote current while the room still points at it (S10)', async () => {
		const { supabase } = createStandIn([
			{ data: [voteRow('vote-1', 'closed')], error: null },
			{ data: [], error: null }
		]);

		const votes = await getVotes(supabase, 'session-1', 'vote-1');

		expect(votes.currentVote).toMatchObject({ id: 'vote-1', status: 'closed' });
		expect(votes.closedVotes.map((vote) => vote.id)).toEqual(['vote-1']);
	});

	it('has no current vote when the room points at none', async () => {
		const { supabase, queries } = createStandIn([
			{ data: [voteRow('vote-2', 'open')], error: null }
		]);

		const votes = await getVotes(supabase, 'session-1', null);

		expect(votes.currentVote).toBeNull();
		expect(queries).toHaveLength(1);
	});

	it('throws when the query fails', async () => {
		const { supabase } = createStandIn([{ data: null, error: { message: 'down' } }]);

		await expect(getVotes(supabase, 'session-1', null)).rejects.toThrow('down');
	});
});

describe('getCurrentVote', () => {
	it('reads the vote the room points at, open or closed, with its answers', async () => {
		const { supabase, queries } = createStandIn([
			{ data: voteRow('vote-1', 'closed'), error: null },
			{ data: [{ seat_id: 'seat-fr', choice: 'for' }], error: null }
		]);

		const vote = await getCurrentVote(supabase, 'vote-1');

		expect(queries[0]).toMatchObject({ table: 'votes', eq: [['id', 'vote-1']] });
		expect(vote).toMatchObject({ id: 'vote-1', status: 'closed', entries: { 'seat-fr': 'for' } });
	});

	it('reads nothing for no vote, and is null for a vote that has gone', async () => {
		const noVote = createStandIn([]);
		const gone = createStandIn([{ data: null, error: null }]);

		expect(await getCurrentVote(noVote.supabase, null)).toBeNull();
		expect(noVote.queries).toHaveLength(0);
		expect(await getCurrentVote(gone.supabase, 'vote-1')).toBeNull();
	});
});

describe('openVote', () => {
	it('writes the vote and puts the room into voting on the General Speakers’ List', async () => {
		const { supabase, queries } = createStandIn([{ data: { id: 'vote-3' }, error: null }]);

		await openVote(
			supabase,
			'committee-1',
			'session-1',
			{
				subject: 'Draft Resolution 1.1',
				kind: 'procedural',
				majority: 'two_thirds',
				method: 'roll_call'
			},
			NOW
		);

		expect(queries[0].written).toEqual({
			committee_id: 'committee-1',
			session_id: 'session-1',
			kind: 'procedural',
			subject: 'Draft Resolution 1.1',
			method: 'roll_call',
			majority: 'two_thirds',
			status: 'open',
			opened_at: NOW.toISOString()
		});
		expect(readGeneralSpeakersListId).toHaveBeenCalledWith(supabase, 'session-1');
		expect(updateCommitteeState).toHaveBeenCalledWith(supabase, 'committee-1', {
			mode: 'voting',
			current_vote_id: 'vote-3',
			current_motion_id: null,
			active_speakers_list_id: 'list-gsl',
			current_speaker_entry_id: null,
			timer_total_seconds: null,
			caucus_total_seconds: null,
			suspended_at: null
		});
	});

	it('ends the speech in progress, with its time, before the room moves to voting', async () => {
		const { supabase } = createStandIn([{ data: { id: 'vote-3' }, error: null }]);
		const input = {
			subject: 'DR 1.1',
			kind: 'substantive',
			majority: 'simple',
			method: 'show_of_hands'
		} as const;

		await openVote(supabase, 'committee-1', 'session-1', input, NOW);

		expect(readCommitteeState).toHaveBeenCalledWith(supabase, 'committee-1');
		expect(finishSpeechInProgress).toHaveBeenCalledWith(supabase, FRANCE_SPEAKING, NOW);

		const finishedAt = vi.mocked(finishSpeechInProgress).mock.invocationCallOrder[0];
		const roomWrittenAt = vi.mocked(updateCommitteeState).mock.invocationCallOrder[0];
		expect(finishedAt).toBeLessThan(roomWrittenAt);
	});

	it('saves it under the id the browser chose, so the row shown and the row saved are the same', async () => {
		const { supabase, queries } = createStandIn([{ data: { id: 'vote-chosen' }, error: null }]);

		await openVote(
			supabase,
			'committee-1',
			'session-1',
			{
				subject: 'Draft Resolution 1.1',
				kind: 'substantive',
				majority: 'two_thirds',
				method: 'roll_call'
			},
			NOW,
			'vote-chosen'
		);

		expect(queries[0].written).toMatchObject({ id: 'vote-chosen' });
	});

	it('ties a vote picked from the list to its paper', async () => {
		const { supabase, queries } = createStandIn([{ data: { id: 'vote-3' }, error: null }]);
		const input = {
			paperId: 'paper-1',
			subject: 'Draft resolution 1.1',
			kind: 'substantive',
			majority: 'simple',
			method: 'show_of_hands'
		} as const;

		expect(await openVote(supabase, 'committee-1', 'session-1', input, NOW)).toBeNull();
		expect(queries[0].written).toMatchObject({ paper_id: 'paper-1' });
	});

	it('ties a vote on an amendment to the amendment, not its draft', async () => {
		const { supabase, queries } = createStandIn([{ data: { id: 'vote-4' }, error: null }]);
		const input = {
			amendmentId: 'amendment-2',
			subject: 'Amendment 2 to Draft resolution 1.1',
			kind: 'substantive',
			majority: 'simple',
			method: 'show_of_hands'
		} as const;

		expect(await openVote(supabase, 'committee-1', 'session-1', input, NOW)).toBeNull();
		expect(queries[0].written).toMatchObject({ amendment_id: 'amendment-2' });
		expect(queries[0].written).not.toHaveProperty('paper_id');
	});

	it('answers the database’s sentence, and leaves the room alone, when it refuses the paper', async () => {
		const sentence = 'Close the open vote on this draft first.';
		const { supabase } = createStandIn([
			{ data: null, error: { code: '22023', message: sentence } }
		]);
		const input = {
			paperId: 'paper-1',
			subject: 'Draft resolution 1.1',
			kind: 'substantive',
			majority: 'simple',
			method: 'show_of_hands'
		} as const;

		expect(await openVote(supabase, 'committee-1', 'session-1', input, NOW)).toBe(sentence);
		expect(updateCommitteeState).not.toHaveBeenCalled();
	});

	it('throws, and leaves the room alone, when the vote cannot be written', async () => {
		const { supabase } = createStandIn([{ data: null, error: { message: 'refused' } }]);
		const input = {
			subject: 'DR 1.1',
			kind: 'substantive',
			majority: 'simple',
			method: 'show_of_hands'
		} as const;

		await expect(openVote(supabase, 'committee-1', 'session-1', input, NOW)).rejects.toThrow(
			'refused'
		);
		expect(finishSpeechInProgress).not.toHaveBeenCalled();
		expect(updateCommitteeState).not.toHaveBeenCalled();
	});
});

describe('roll call answers', () => {
	it('replaces a seat’s answer and clears it again', async () => {
		const { supabase, queries } = createStandIn([]);

		await recordRollCallChoice(supabase, 'vote-1', 'seat-br', 'against');
		await clearRollCallChoice(supabase, 'vote-1', 'seat-br');

		expect(queries[0]).toMatchObject({
			table: 'vote_entries',
			writeKind: 'upsert',
			written: { vote_id: 'vote-1', seat_id: 'seat-br', choice: 'against' },
			upsertOptions: { onConflict: 'vote_id,seat_id' }
		});
		expect(queries[1]).toMatchObject({
			table: 'vote_entries',
			writeKind: 'delete',
			eq: [
				['vote_id', 'vote-1'],
				['seat_id', 'seat-br']
			]
		});
	});
});

describe('saveHandCount', () => {
	it('writes the running count of an open show of hands only', async () => {
		const { supabase, queries } = createStandIn([{ data: [{ id: 'vote-1' }], error: null }]);

		expect(await saveHandCount(supabase, 'vote-1', { for: 4, against: 1, abstain: 1 })).toBe(true);
		expect(queries[0]).toMatchObject({
			table: 'votes',
			writeKind: 'update',
			written: { votes_for: 4, votes_against: 1, votes_abstain: 1 },
			eq: [
				['id', 'vote-1'],
				['status', 'open'],
				['method', 'show_of_hands']
			]
		});
	});

	it('answers false when the vote is no longer open', async () => {
		const { supabase } = createStandIn([{ data: [], error: null }]);

		expect(await saveHandCount(supabase, 'vote-1', { for: 1, against: 0, abstain: 0 })).toBe(false);
	});
});

describe('endVoting', () => {
	it('returns the room to formal debate with no vote current, clearing a suspension', async () => {
		await endVoting({} as SupabaseClient, 'committee-1');

		expect(updateCommitteeState).toHaveBeenCalledWith({}, 'committee-1', {
			mode: 'formal_debate',
			current_vote_id: null,
			suspended_at: null
		});
	});
});

describe('closeVote', () => {
	it('closes only a vote still open, and leaves the room in voting on it', async () => {
		const { supabase, queries } = createStandIn([{ data: [{ id: 'vote-1' }], error: null }]);
		const counts = { for: 9, against: 3, abstain: 1 };

		expect(await closeVote(supabase, 'vote-1', counts, true, NOW)).toBe(true);
		expect(queries[0].written).toEqual({
			votes_for: 9,
			votes_against: 3,
			votes_abstain: 1,
			passed: true,
			status: 'closed',
			closed_at: NOW.toISOString()
		});
		expect(queries[0].eq).toEqual([
			['id', 'vote-1'],
			['status', 'open']
		]);
		// The room keeps showing the result until "End voting" (S10).
		expect(updateCommitteeState).not.toHaveBeenCalled();
	});

	it('answers false when the vote was already closed', async () => {
		const { supabase } = createStandIn([{ data: [], error: null }]);
		const counts = { for: 1, against: 1, abstain: 0 };

		expect(await closeVote(supabase, 'vote-1', counts, false, NOW)).toBe(false);
	});
});

describe('cancelVote', () => {
	it('deletes an open vote and returns the room to formal debate', async () => {
		const { supabase, queries } = createStandIn([{ data: [{ id: 'vote-1' }], error: null }]);

		expect(await cancelVote(supabase, 'committee-1', 'vote-1')).toBe(true);
		expect(queries[0]).toMatchObject({
			table: 'votes',
			writeKind: 'delete',
			eq: [
				['id', 'vote-1'],
				['status', 'open']
			]
		});
		// The suspension is cleared with it, which the database insists on outside a
		// suspended room.
		expect(updateCommitteeState).toHaveBeenCalledWith(supabase, 'committee-1', {
			mode: 'formal_debate',
			current_vote_id: null,
			suspended_at: null
		});
	});

	it('answers false when the vote had already gone', async () => {
		const { supabase } = createStandIn([{ data: [], error: null }]);

		expect(await cancelVote(supabase, 'committee-1', 'vote-1')).toBe(false);
		expect(updateCommitteeState).not.toHaveBeenCalled();
	});
});

describe('cancelOpenVotes', () => {
	it('deletes every vote of the session that is still open, and leaves the room to its caller', async () => {
		const { supabase, queries } = createStandIn([{ data: null, error: null }]);

		await cancelOpenVotes(supabase, 'session-1');

		expect(queries).toEqual([
			{
				table: 'votes',
				eq: [
					['session_id', 'session-1'],
					['status', 'open']
				],
				written: null,
				writeKind: 'delete',
				upsertOptions: null
			}
		]);
		expect(updateCommitteeState).not.toHaveBeenCalled();
	});

	it('throws when the votes cannot be deleted', async () => {
		const { supabase } = createStandIn([{ data: null, error: { message: 'refused' } }]);

		await expect(cancelOpenVotes(supabase, 'session-1')).rejects.toThrow('refused');
	});
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommitteeSession, CommitteeStateView } from '$lib/chair-room';
import type { ScheduleEvent } from '$lib/schedule';

// The reads this module gathers are stood in for: each has its own tests next
// to it. What is tested here is which of them each screen asks for, in which
// state, and what is made of the answers. `readIsQuickSession` asks the
// database itself, through the small stand-in client below.
vi.mock('$lib/server/schedule', () => ({ listScheduleEvents: vi.fn() }));
vi.mock('$lib/server/paper-reviews', () => ({ listPaperSeats: vi.fn() }));
vi.mock('$lib/server/committee-sessions', () => ({ readSessionRecord: vi.fn() }));
vi.mock('$lib/server/committee-room', () => ({
	getCommitteeRoom: vi.fn(),
	readSuspensionReason: vi.fn()
}));

import { getCommitteeRoom, readSuspensionReason } from '$lib/server/committee-room';
import { readSessionRecord } from '$lib/server/committee-sessions';
import { listPaperSeats } from '$lib/server/paper-reviews';
import { listScheduleEvents } from '$lib/server/schedule';
import { readIsQuickSession, readLobbyFacts, readSuspendedRoom } from './room-screens';

/** A client whose one query answers `kind` for the conference, and writes down what it asked. */
function kindClient(answer: { data: unknown; error: { message: string } | null }) {
	const asked: [string, unknown][] = [];
	const builder = {
		select: () => builder,
		eq: (column: string, value: unknown) => {
			asked.push([column, value]);
			return builder;
		},
		maybeSingle: () => builder,
		overrideTypes: async () => answer
	};

	return { supabase: { from: () => builder } as unknown as SupabaseClient, asked };
}

const ENDED: CommitteeSession = {
	id: 'session-1',
	name: 'Session 1',
	status: 'ended',
	startedAt: '2026-01-01T09:00:00Z',
	endedAt: '2026-01-01T11:00:00Z'
};

const RECORD = {
	sessionId: 'session-1',
	speechCount: 4,
	decidedMotionCount: 1,
	passedMotionCount: 1,
	votes: []
};

/** An event for everyone, after the moment the tests read at. */
const LUNCH: ScheduleEvent = {
	id: 'lunch',
	conferenceId: 'conference-1',
	title: 'Lunch',
	description: null,
	location: null,
	startsAt: '2026-01-01T12:00:00.000Z',
	endsAt: '2026-01-01T13:00:00.000Z',
	audience: 'everyone',
	committeeId: null,
	committeeAbbreviation: null
};

const NOW = new Date('2026-01-01T11:30:00Z');

beforeEach(() => {
	vi.mocked(listScheduleEvents).mockResolvedValue([LUNCH]);
	vi.mocked(listPaperSeats).mockResolvedValue([{}, {}] as Awaited<
		ReturnType<typeof listPaperSeats>
	>);
	vi.mocked(readSessionRecord).mockResolvedValue(RECORD);
	vi.mocked(listPaperSeats).mockClear();
	vi.mocked(readSessionRecord).mockClear();
});

describe('readIsQuickSession', () => {
	it('says yes for a conference of the quick session kind (D7)', async () => {
		const { supabase, asked } = kindClient({ data: { kind: 'quick_session' }, error: null });

		expect(await readIsQuickSession(supabase, 'conference-1')).toBe(true);
		expect(asked).toEqual([['id', 'conference-1']]);
	});

	it('says no for any other conference, or one it cannot see', async () => {
		const conference = kindClient({ data: { kind: 'conference' }, error: null });
		const unseen = kindClient({ data: null, error: null });

		expect(await readIsQuickSession(conference.supabase, 'conference-1')).toBe(false);
		expect(await readIsQuickSession(unseen.supabase, 'conference-1')).toBe(false);
	});

	it('throws when the conference cannot be read', async () => {
		const { supabase } = kindClient({ data: null, error: { message: 'boom' } });

		await expect(readIsQuickSession(supabase, 'conference-1')).rejects.toThrow(/boom/);
	});
});

describe('readLobbyFacts', () => {
	const reading = {
		conferenceId: 'conference-1',
		committeeId: 'committee-1',
		sessions: [ENDED],
		isSessionRunning: false,
		now: NOW
	};

	it('reads the seats with a delegate, the last record, the next event and the kind while no session runs', async () => {
		const { supabase } = kindClient({ data: { kind: 'conference' }, error: null });

		const facts = await readLobbyFacts(supabase, reading);

		expect(facts).toEqual({
			filledSeatCount: 2,
			lastSessionRecord: RECORD,
			nextScheduleEvent: LUNCH,
			isQuickSession: false
		});
		expect(listPaperSeats).toHaveBeenCalledWith(supabase, 'conference-1', 'committee-1');
		expect(readSessionRecord).toHaveBeenCalledWith(supabase, 'session-1');
	});

	it('reads only what the ended screen needs at once while a session runs', async () => {
		const { supabase } = kindClient({ data: { kind: 'quick_session' }, error: null });

		const facts = await readLobbyFacts(supabase, { ...reading, isSessionRunning: true });

		expect(listPaperSeats).not.toHaveBeenCalled();
		expect(readSessionRecord).not.toHaveBeenCalled();
		expect(facts.nextScheduleEvent).toBe(LUNCH);
		expect(facts.isQuickSession).toBe(true);
		expect(facts.lastSessionRecord).toBeNull();
	});

	it('reads no record before any session has ended', async () => {
		const { supabase } = kindClient({ data: { kind: 'conference' }, error: null });

		const facts = await readLobbyFacts(supabase, { ...reading, sessions: [] });

		expect(readSessionRecord).not.toHaveBeenCalled();
		expect(facts.lastSessionRecord).toBeNull();
	});
});

describe('readSuspendedRoom', () => {
	const SUSPENDED: CommitteeStateView = {
		currentSessionId: 'session-2',
		mode: 'suspended',
		currentMotionId: null,
		activeSpeakersListId: 'list-1',
		currentSpeakerEntryId: null,
		currentVoteId: 'vote-1',
		agendaTopic: null,
		timer: { totalSeconds: null, endsAt: null, pausedRemainingSeconds: null },
		suspendedAt: '2026-01-01T12:00:00.000Z',
		suspendedUntil: null,
		modeBeforeSuspension: 'voting'
	};

	beforeEach(() => {
		vi.mocked(getCommitteeRoom).mockResolvedValue({
			speakersList: null,
			speakers: [],
			currentVote: { id: 'vote-1', subject: 'Draft Resolution 1.1', status: 'open' },
			recentMotions: []
		});
		vi.mocked(readSuspensionReason).mockResolvedValue('for lunch');
		vi.mocked(readSuspensionReason).mockClear();
	});

	it('reads the list, the vote and the reason the room was suspended for', async () => {
		const supabase = {} as SupabaseClient;

		const room = await readSuspendedRoom(supabase, SUSPENDED, []);

		expect(room).toEqual({
			speakers: [],
			voteSubject: 'Draft Resolution 1.1',
			reason: 'for lunch'
		});
		expect(readSuspensionReason).toHaveBeenCalledWith(
			supabase,
			'session-2',
			'2026-01-01T12:00:00.000Z'
		);
	});

	it('asks for no reason when the room does not say when it was suspended', async () => {
		const room = await readSuspendedRoom(
			{} as SupabaseClient,
			{ ...SUSPENDED, suspendedAt: null },
			[]
		);

		expect(readSuspensionReason).not.toHaveBeenCalled();
		expect(room.reason).toBeNull();
	});
});

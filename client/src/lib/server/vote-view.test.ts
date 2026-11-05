import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChairRoomFrame, CommitteeSession } from '$lib/chair-room';
import type { OpenVote } from '$lib/votes';
import type { ChairRequestEvent } from './chair-floor-actions';
import { readVoteView, voteActions } from './vote-view';

// The reader and the factory on their own, the way the live room (`chair`)
// will use them: with its own return address. Every refusal of every action
// is tested through `chair/voting`, which spreads the same factory
// (`chair/voting/page.server.test.ts`). The gate, the room and the writes are
// stood in for.
vi.mock('./access', () => ({ requireCommitteePermission: vi.fn() }));
vi.mock('./committee-room', () => ({ getChairRoomFrame: vi.fn() }));
vi.mock('./flash', () => ({ setFlash: vi.fn() }));
vi.mock('./paper-votes', () => ({ listVoteSubjects: vi.fn() }));
vi.mock('./votes', () => ({
	cancelVote: vi.fn(),
	clearRollCallChoice: vi.fn(),
	closeVote: vi.fn(),
	endVoting: vi.fn(),
	getCurrentVote: vi.fn(),
	getVotes: vi.fn(),
	openVote: vi.fn(),
	recordRollCallChoice: vi.fn(),
	saveHandCount: vi.fn()
}));

import { requireCommitteePermission } from './access';
import { getChairRoomFrame } from './committee-room';
import { listVoteSubjects } from './paper-votes';
import {
	clearRollCallChoice,
	getCurrentVote,
	getVotes,
	openVote,
	recordRollCallChoice
} from './votes';

const SUPABASE = {} as SupabaseClient;

const RUNNING: CommitteeSession = {
	id: 'session-1',
	name: 'Session 1',
	status: 'in_progress',
	startedAt: '2026-01-01T09:00:00.000Z',
	endedAt: null
};

/** The room's open roll call vote. */
const VOTE: OpenVote = {
	id: 'vote-1',
	subject: 'Draft Resolution 1.1',
	kind: 'substantive',
	method: 'roll_call',
	majority: 'simple',
	status: 'open',
	votesFor: null,
	votesAgainst: null,
	votesAbstain: null,
	passed: null,
	openedAt: '2026-01-01T10:00:00.000Z',
	closedAt: null,
	entries: {}
};

/** The room voting on vote-1, with Brazil present. */
const FRAME: ChairRoomFrame = {
	committeeState: {
		currentSessionId: 'session-1',
		mode: 'voting',
		currentMotionId: null,
		activeSpeakersListId: 'gsl-1',
		currentSpeakerEntryId: null,
		currentVoteId: 'vote-1',
		agendaTopic: null,
		timer: { totalSeconds: null, endsAt: null, pausedRemainingSeconds: null }
	},
	sessions: [RUNNING],
	currentSession: RUNNING,
	currentMotion: null,
	seats: [{ id: 'seat-br', name: 'Brazil', countryCode: 'BR' }],
	attendance: { 'seat-br': 'present' },
	latestRollCallId: 'roll-1'
};

/** The room's frame as the readers are given it, with its committee. */
const ROOM = { ...FRAME, committeeId: 'committee-1' };

/** An introduced draft the vote form lists once debate is closed. */
const DRAFT = { id: 'paper-1', name: 'Draft resolution 1.1', title: 'Human control' };

/** A post from the live room, carrying `fields`. */
function eventOf(fields: Record<string, string>): ChairRequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) formData.set(name, value);

	return {
		params: { slug: 'mun', committeeSlug: 'unsc' },
		url: new URL('http://localhost/conferences/mun/committees/unsc/chair'),
		locals: { supabase: SUPABASE },
		cookies: {},
		request: { formData: async () => formData }
	} as unknown as ChairRequestEvent;
}

/** Run an action expected to redirect, and give back where it was going. */
async function redirectOf(run: () => unknown): Promise<string> {
	try {
		await run();
	} catch (thrown) {
		return (thrown as { location: string }).location;
	}

	throw new Error('Nothing redirected.');
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(requireCommitteePermission).mockResolvedValue({
		user: { id: 'user-1', email: 'amira@example.com' },
		conference: {} as Awaited<ReturnType<typeof requireCommitteePermission>>['conference'],
		committee: {} as Awaited<ReturnType<typeof requireCommitteePermission>>['committee']
	});
	vi.mocked(getChairRoomFrame).mockResolvedValue(FRAME);
	vi.mocked(getCurrentVote).mockResolvedValue(VOTE);
	vi.mocked(listVoteSubjects).mockResolvedValue([DRAFT]);
	vi.mocked(openVote).mockResolvedValue(null);
});

describe('readVoteView', () => {
	it('reads the room’s vote and the closed ones, and the questions in the address', async () => {
		vi.mocked(getVotes).mockResolvedValue({ currentVote: VOTE, closedVotes: [] });
		const url = new URL('http://localhost/chair?cancel=confirm&seat=seat-br');

		const view = await readVoteView(SUPABASE, ROOM, url);

		expect(getVotes).toHaveBeenCalledWith(SUPABASE, 'session-1', 'vote-1');
		expect(listVoteSubjects).toHaveBeenCalledWith(SUPABASE, 'committee-1', 'session-1');
		expect(view).toEqual({
			vote: VOTE,
			closedVotes: [],
			isNewVoteShown: false,
			isCancelConfirming: true,
			focusedSeatId: 'seat-br',
			subjects: [DRAFT]
		});
	});

	it('reads nothing while no session runs', async () => {
		const ended = { ...RUNNING, status: 'ended' as const };

		expect(
			await readVoteView(SUPABASE, { ...ROOM, currentSession: null }, new URL('http://x/'))
		).toBeNull();
		expect(
			await readVoteView(SUPABASE, { ...ROOM, currentSession: ended }, new URL('http://x/'))
		).toBeNull();
		expect(getVotes).not.toHaveBeenCalled();
	});
});

describe('voteActions', () => {
	/** The live room's own return address, as `chair` will give it. */
	const actions = voteActions(() => '/conferences/mun/committees/unsc/chair');

	it('sends the chair back to the page that spread the actions', async () => {
		vi.mocked(getCurrentVote).mockResolvedValue({ ...VOTE, status: 'closed' });

		const location = await redirectOf(() =>
			actions.openVote(
				eventOf({ subject: 'DR 1.2', kind: 'procedural', majority: 'simple', method: 'roll_call' })
			)
		);

		expect(location).toBe('/conferences/mun/committees/unsc/chair');
	});

	it('names the row pressed in the return address, after any question already in it', async () => {
		const withQuestion = voteActions(() => '/conferences/mun/committees/unsc/chair?vote=new');

		const location = await redirectOf(() =>
			withQuestion.castRollCall(eventOf({ voteId: 'vote-1', seatId: 'seat-br', choice: 'for' }))
		);

		expect(recordRollCallChoice).toHaveBeenCalledWith(SUPABASE, 'vote-1', 'seat-br', 'for');
		expect(location).toBe('/conferences/mun/committees/unsc/chair?vote=new&seat=seat-br');
	});

	it("takes a seat's answer off once the seat is one of the room's", async () => {
		const location = await redirectOf(() =>
			actions.clearRollCall(eventOf({ voteId: 'vote-1', seatId: 'seat-br' }))
		);

		expect(clearRollCallChoice).toHaveBeenCalledWith(SUPABASE, 'vote-1', 'seat-br');
		expect(location).toBe('/conferences/mun/committees/unsc/chair?seat=seat-br');
	});

	it('refuses clearing the answer of a seat that is not in the room, before the database hears of it', async () => {
		const refused = await actions.clearRollCall(
			eventOf({ voteId: 'vote-1', seatId: 'not-even-an-id' })
		);

		expect(refused).toMatchObject({
			status: 400,
			data: { flash: { tone: 'error', message: 'That seat is not in this committee.' } }
		});
		expect(clearRollCallChoice).not.toHaveBeenCalled();
	});
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChairCommittee, ChairRoomFrame, SpeakersListSummary } from '$lib/chair-room';
import type { RoomSeat } from '$lib/committee-room';
import type { Conference } from '$lib/conferences';
import type { GslEntry } from '$lib/gsl-floor';
import type { SessionMotion } from '$lib/motions';
import type { ScheduleEvent } from '$lib/schedule';
import type { OpenVote } from '$lib/votes';

// The reads the chair pages already use are stood in for, so these tests are
// about how the watching pages put them together. Each one has its own tests
// next to its module, and both pages run against a real database in
// `tests/e2e/committee-live.spec.ts` and `committee-display.spec.ts`.
vi.mock('./committee-room', () => ({
	getChairRoomFrame: vi.fn(),
	readSuspensionReason: vi.fn()
}));
vi.mock('./active-list', () => ({ readListWithEntries: vi.fn() }));
vi.mock('./motions', () => ({ listMotions: vi.fn() }));
vi.mock('./votes', () => ({ getCurrentVote: vi.fn() }));
vi.mock('./room-screens', () => ({ readIsQuickSession: vi.fn() }));
vi.mock('./schedule', () => ({ listScheduleEvents: vi.fn() }));

import { readListWithEntries } from './active-list';
import { getChairRoomFrame, readSuspensionReason } from './committee-room';
import { listMotions } from './motions';
import { readIsQuickSession } from './room-screens';
import { listScheduleEvents } from './schedule';
import { getCurrentVote } from './votes';
import { loadCommitteeRoom, loadWatchedRoom } from './committee-live';

const SEAT_FR: RoomSeat = { id: 'seat-fr', name: 'France', countryCode: 'FR', delegateName: null };
const SEAT_GH: RoomSeat = { id: 'seat-gh', name: 'Ghana', countryCode: 'GH', delegateName: null };

const SPEAKERS: GslEntry[] = [
	{ id: 'entry-1', position: 0, status: 'waiting', seat: SEAT_FR, spokeSeconds: null }
];

const SPEAKERS_LIST: SpeakersListSummary = {
	id: 'list-1',
	name: 'Single speaker',
	speakingTimeSeconds: 60,
	isOpen: true
};

const MOTION: SessionMotion = {
	id: 'motion-1',
	kind: 'moderated_caucus',
	status: 'proposed',
	topic: 'Climate finance',
	totalTimeSeconds: 600,
	speakingTimeSeconds: 60,
	proposedBy: SEAT_GH,
	votesFor: null,
	votesAgainst: null,
	decidedAt: null,
	createdAt: '2026-01-01T09:00:00.000Z',
	startedWithoutVote: false
};

const VOTE: OpenVote = {
	id: 'vote-1',
	subject: 'Draft Resolution 1.1',
	kind: 'substantive',
	method: 'roll_call',
	majority: 'simple',
	status: 'closed',
	votesFor: 0,
	votesAgainst: 1,
	votesAbstain: 0,
	passed: false,
	openedAt: '2026-01-01T09:30:00.000Z',
	closedAt: '2026-01-01T09:40:00.000Z',
	entries: { 'seat-fr': 'against' }
};

const COMMITTEE: ChairCommittee = {
	id: 'committee-1',
	slug: 'unsc',
	name: 'Security Council',
	abbreviation: 'UNSC',
	room: 'Room 1',
	defaultSpeakingTimeSeconds: 60,
	topics: ['Climate finance']
};

/** `requireRoomWatcher` reads a whole `Conference`; only what the pages need is handed on. */
const CONFERENCE = {
	id: 'conference-1',
	slug: 'thimun-2027',
	name: 'THIMUN 2027',
	timezone: 'Europe/Amsterdam',
	endDate: '2026-09-27'
} as Conference;

/** An event for the whole conference, starting two hours after the visit below. */
const LUNCH: ScheduleEvent = {
	id: 'event-1',
	conferenceId: 'conference-1',
	title: 'Lunch',
	description: null,
	location: 'Hall',
	startsAt: '2026-09-26T12:00:00.000Z',
	endsAt: '2026-09-26T13:00:00.000Z',
	audience: 'everyone',
	committeeId: null,
	committeeAbbreviation: null
};

/** The room frame, voting in a session with a roll call that found Ghana absent. */
function makeFrame(overrides: Partial<ChairRoomFrame> = {}): ChairRoomFrame {
	return {
		committeeState: {
			currentSessionId: 'session-1',
			mode: 'voting',
			currentMotionId: null,
			activeSpeakersListId: 'list-1',
			currentSpeakerEntryId: null,
			currentVoteId: 'vote-1',
			agendaTopic: null,
			timer: { totalSeconds: null, endsAt: null, pausedRemainingSeconds: null }
		},
		sessions: [],
		currentSession: {
			id: 'session-1',
			name: 'Session 1',
			status: 'in_progress',
			startedAt: null,
			endedAt: null
		},
		currentMotion: null,
		seats: [SEAT_FR, SEAT_GH],
		attendance: { 'seat-fr': 'present', 'seat-gh': 'absent' },
		latestRollCallId: 'roll-call-1',
		...overrides
	};
}

/**
 * A stand-in client for the two queries this file makes itself: the reader's
 * seat, answered `seatId`, and whether anyone in the session has been called,
 * answered by `hasSpoken`. Every filter is written down in `filters`.
 */
function createStandIn(seatId: string | null, hasSpoken = false) {
	const filters: [string, unknown][] = [];
	const builder = {
		select: () => builder,
		eq: (column: string, value: unknown) => {
			filters.push([column, value]);
			return builder;
		},
		in: () => builder,
		limit: () => builder,
		maybeSingle: () => Promise.resolve({ data: seatId ? { id: seatId } : null, error: null }),
		overrideTypes: () =>
			Promise.resolve({ data: hasSpoken ? [{ id: 'entry-1' }] : [], error: null })
	};
	const supabase = { from: vi.fn(() => builder) } as unknown as SupabaseClient;

	return { supabase, filters };
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(getChairRoomFrame).mockResolvedValue(makeFrame());
	vi.mocked(readListWithEntries).mockResolvedValue({
		speakersList: SPEAKERS_LIST,
		speakers: SPEAKERS,
		purpose: 'Right of reply'
	});
	vi.mocked(listMotions).mockResolvedValue([MOTION]);
	vi.mocked(getCurrentVote).mockResolvedValue(VOTE);
	vi.mocked(readSuspensionReason).mockResolvedValue('for lunch');
	vi.mocked(readIsQuickSession).mockResolvedValue(false);
	vi.mocked(listScheduleEvents).mockResolvedValue([LUNCH]);
});

describe('loadCommitteeRoom', () => {
	it("puts the room together with the reader's own seat and answer", async () => {
		const { supabase, filters } = createStandIn('seat-fr', true);

		const room = await loadCommitteeRoom(supabase, 'committee-1', 'user-1');

		expect(filters).toEqual(
			expect.arrayContaining([
				['committee_id', 'committee-1'],
				['user_id', 'user-1'],
				['list.session_id', 'session-1']
			])
		);
		expect(readListWithEntries).toHaveBeenCalledWith(supabase, 'list-1', [SEAT_FR, SEAT_GH]);
		expect(listMotions).toHaveBeenCalledWith(supabase, 'session-1');
		expect(getCurrentVote).toHaveBeenCalledWith(supabase, 'vote-1');
		expect(room).toMatchObject({
			speakersList: SPEAKERS_LIST,
			speakers: SPEAKERS,
			listPurpose: 'Right of reply',
			floorMotion: MOTION,
			currentVote: VOTE,
			mySeatId: 'seat-fr',
			myChoice: 'against',
			presentCount: 1,
			attendance: { 'seat-fr': 'present', 'seat-gh': 'absent' },
			hasAnyoneSpoken: true,
			suspensionReason: null
		});
		// The room is not suspended, so there is no reason to read.
		expect(readSuspensionReason).not.toHaveBeenCalled();
	});

	it('has no seat or answer for staff watching', async () => {
		const { supabase } = createStandIn(null);

		const room = await loadCommitteeRoom(supabase, 'committee-1', 'user-1');

		expect(room.mySeatId).toBeNull();
		expect(room.myChoice).toBeNull();
		expect(room.hasAnyoneSpoken).toBe(false);
	});

	it('counts nobody present before the first roll call, and reads nothing of a session between sessions', async () => {
		vi.mocked(getChairRoomFrame).mockResolvedValue(
			makeFrame({ currentSession: null, latestRollCallId: null, attendance: {} })
		);
		const { supabase } = createStandIn('seat-fr', true);

		const room = await loadCommitteeRoom(supabase, 'committee-1', 'user-1');

		expect(room.presentCount).toBeNull();
		expect(room.floorMotion).toBeNull();
		expect(room.hasAnyoneSpoken).toBe(false);
		expect(listMotions).not.toHaveBeenCalled();
	});

	it('reads no list while the room has none', async () => {
		const frame = makeFrame();
		frame.committeeState.activeSpeakersListId = null;
		vi.mocked(getChairRoomFrame).mockResolvedValue(frame);
		const { supabase } = createStandIn('seat-fr');

		const room = await loadCommitteeRoom(supabase, 'committee-1', 'user-1');

		expect(readListWithEntries).not.toHaveBeenCalled();
		expect(room).toMatchObject({ speakersList: null, speakers: [], listPurpose: null });
	});

	it('reads why a suspended room stopped, from the motion that suspended it', async () => {
		const frame = makeFrame();
		frame.committeeState.mode = 'suspended';
		frame.committeeState.suspendedAt = '2026-01-01T11:00:00.000Z';
		vi.mocked(getChairRoomFrame).mockResolvedValue(frame);
		const { supabase } = createStandIn('seat-fr');

		const room = await loadCommitteeRoom(supabase, 'committee-1', 'user-1');

		expect(readSuspensionReason).toHaveBeenCalledWith(
			supabase,
			'session-1',
			'2026-01-01T11:00:00.000Z'
		);
		expect(room.suspensionReason).toBe('for lunch');
	});
});

describe('loadWatchedRoom', () => {
	it('hands both pages the room, the conference, the next event and the time', async () => {
		const { supabase } = createStandIn('seat-fr');
		// Only `Date` is faked, so the answer's `serverTime` is known in advance.
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-09-26T10:00:00.000Z'));

		const page = await loadWatchedRoom(supabase, CONFERENCE, COMMITTEE, 'user-1');
		vi.useRealTimers();

		expect(listScheduleEvents).toHaveBeenCalledWith(supabase, 'conference-1');
		expect(readIsQuickSession).toHaveBeenCalledWith(supabase, 'conference-1');
		expect(page).toMatchObject({
			conference: {
				slug: 'thimun-2027',
				name: 'THIMUN 2027',
				timezone: 'Europe/Amsterdam',
				endDate: '2026-09-27',
				isQuickSession: false
			},
			committee: COMMITTEE,
			mySeatId: 'seat-fr',
			nextScheduleEvent: LUNCH,
			today: '2026-09-26',
			serverTime: '2026-09-26T10:00:00.000Z'
		});
	});
});

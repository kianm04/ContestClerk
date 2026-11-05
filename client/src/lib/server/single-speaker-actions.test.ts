import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChairCommittee, ChairRoomFrame } from '$lib/chair-room';
import type { ChairRequestEvent } from './chair-floor-actions';
import { SINGLE_SPEAKER_REFUSALS, singleSpeakerActions } from './single-speaker-actions';

// The gate and the room are stood in for: these tests are about what "Return
// to GSL" promises the pages that spread it. The whole view runs against a
// real database in `tests/e2e/chair-single-speaker.spec.ts`.
vi.mock('$lib/server/access', () => ({ requireCommitteePermission: vi.fn() }));

vi.mock('$lib/server/committee-room', () => ({
	getActiveSpeakersList: vi.fn(),
	getChairRoomFrame: vi.fn(),
	setRoomMode: vi.fn(),
	timerColumns: vi.fn(),
	updateCommitteeState: vi.fn()
}));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

import { requireCommitteePermission } from '$lib/server/access';
import { getChairRoomFrame, setRoomMode } from '$lib/server/committee-room';

const SUPABASE = {};

const COMMITTEE: ChairCommittee = {
	id: 'committee-1',
	slug: 'unsc',
	name: 'Security Council',
	abbreviation: 'UNSC',
	room: null,
	defaultSpeakingTimeSeconds: 60,
	topics: []
};

/** A single speaker on the floor of their own list. */
const SINGLE_FRAME: ChairRoomFrame = {
	committeeState: {
		currentSessionId: 'session-1',
		mode: 'single_speaker',
		currentMotionId: null,
		activeSpeakersListId: 'single-1',
		currentSpeakerEntryId: 'entry-sg',
		currentVoteId: null,
		agendaTopic: null,
		timer: { totalSeconds: 60, endsAt: null, pausedRemainingSeconds: 42 }
	},
	sessions: [],
	currentSession: {
		id: 'session-1',
		name: 'Session 1',
		status: 'in_progress',
		startedAt: '2026-01-01T09:00:00.000Z',
		endedAt: null
	},
	currentMotion: null,
	seats: [],
	attendance: {},
	latestRollCallId: null
};

/** A post from `chair/single`, or from the live strip on another view. */
function makeEvent(): ChairRequestEvent {
	return {
		params: { slug: 'thimun-2027', committeeSlug: 'unsc' },
		url: new URL('http://localhost/conferences/thimun-2027/committees/unsc/chair/single'),
		locals: { supabase: SUPABASE },
		cookies: {},
		request: { formData: async () => new FormData() }
	} as unknown as ChairRequestEvent;
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(requireCommitteePermission).mockResolvedValue({
		user: { id: 'user-1', email: 'amira@example.com' },
		conference: {} as Awaited<ReturnType<typeof requireCommitteePermission>>['conference'],
		committee: COMMITTEE
	});
	vi.mocked(getChairRoomFrame).mockResolvedValue(SINGLE_FRAME);
});

describe('returnToGsl', () => {
	it('returns the room to the General Speakers’ List and takes the chair to the live room', async () => {
		let thrown: unknown = null;

		try {
			await singleSpeakerActions().returnToGsl(makeEvent());
		} catch (redirect) {
			thrown = redirect;
		}

		expect(setRoomMode).toHaveBeenCalledWith(
			SUPABASE,
			COMMITTEE.id,
			SINGLE_FRAME.committeeState,
			'formal_debate'
		);
		expect(thrown).toEqual(
			expect.objectContaining({
				status: 303,
				location: '/conferences/thimun-2027/committees/unsc/chair'
			})
		);
	});

	it('refuses while no single speaker has the floor', async () => {
		vi.mocked(getChairRoomFrame).mockResolvedValue({
			...SINGLE_FRAME,
			committeeState: { ...SINGLE_FRAME.committeeState, mode: 'moderated_caucus' }
		});

		const result = (await singleSpeakerActions().returnToGsl(makeEvent())) as {
			status: number;
			data: { flash: { message: string } };
		};

		expect(result.status).toBe(400);
		expect(result.data.flash.message).toBe(SINGLE_SPEAKER_REFUSALS.noSingleSpeaker);
		expect(SINGLE_SPEAKER_REFUSALS.noSingleSpeaker).toBe('No single speaker has the floor.');
		expect(setRoomMode).not.toHaveBeenCalled();
	});
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommitteeSession, CommitteeStateView } from '$lib/chair-room';
import { CLEARED_TIMER, type CommitteeMode } from '$lib/committee-room';

// Each view's reader has its own tests next to it. What is tested here is
// which of them `chair` asks for in which mode, and that the answers come
// back under the names the page reads.
vi.mock('$lib/server/gsl-view', () => ({ readGslList: vi.fn() }));
vi.mock('$lib/server/caucus-view', () => ({ readModView: vi.fn(), readUnmodView: vi.fn() }));
vi.mock('$lib/server/single-speaker-view', () => ({ readSingleSpeakerView: vi.fn() }));
vi.mock('$lib/server/vote-view', () => ({ readVoteView: vi.fn() }));

import { readModView, readUnmodView } from '$lib/server/caucus-view';
import { readGslList } from '$lib/server/gsl-view';
import { readSingleSpeakerView } from '$lib/server/single-speaker-view';
import { readVoteView } from '$lib/server/vote-view';
import { readLiveRoomViews, type LiveRoomFrame } from './live-room-views';

/** The client is only handed on to the readers, which are stood in for. */
const SUPABASE = {} as SupabaseClient;

const URL_SHOWN = new URL('http://localhost/conferences/mun/committees/unsc/chair?vote=new');

const RUNNING: CommitteeSession = {
	id: 'session-1',
	name: 'Session 1',
	status: 'in_progress',
	startedAt: '2026-01-01T09:00:00Z',
	endedAt: null
};

const GSL = {
	speakersList: {
		id: 'gsl',
		name: 'General Speakers’ List',
		speakingTimeSeconds: 90,
		isOpen: true
	},
	speakers: []
};

/** The room in `mode`, and the mode it was suspended from when it is suspended. */
function frameIn(mode: CommitteeMode, modeBeforeSuspension: CommitteeMode | null = null) {
	const committeeState: CommitteeStateView = {
		mode,
		modeBeforeSuspension,
		currentSessionId: RUNNING.id,
		activeSpeakersListId: 'gsl',
		currentMotionId: null,
		currentSpeakerEntryId: null,
		currentVoteId: null,
		agendaTopic: null,
		timer: CLEARED_TIMER
	};
	const frame: LiveRoomFrame = {
		committeeId: 'committee-1',
		committeeState,
		currentSession: RUNNING,
		seats: []
	};

	return frame;
}

beforeEach(() => {
	vi.resetAllMocks();
	vi.mocked(readGslList).mockResolvedValue(GSL);
	vi.mocked(readModView).mockResolvedValue(null);
	vi.mocked(readSingleSpeakerView).mockResolvedValue(null);
});

describe('readLiveRoomViews', () => {
	it('reads nothing while no session runs', async () => {
		const frame = { ...frameIn('idle'), currentSession: null };

		const views = await readLiveRoomViews(SUPABASE, frame, URL_SHOWN);

		expect(views).toEqual({ gsl: null, mod: null, unmod: null, single: null, voteView: null });
		expect(readGslList).not.toHaveBeenCalled();
	});

	it('reads the General Speakers’ List in every mode, and asks the Mod and Single readers too', async () => {
		const frame = frameIn('formal_debate');

		const views = await readLiveRoomViews(SUPABASE, frame, URL_SHOWN);

		expect(views.gsl).toEqual(GSL);
		expect(readGslList).toHaveBeenCalledWith(SUPABASE, 'session-1', []);
		// Both answer null by themselves outside their own mode.
		expect(readModView).toHaveBeenCalledWith(SUPABASE, frame);
		expect(readSingleSpeakerView).toHaveBeenCalledWith(SUPABASE, frame);
		expect(readUnmodView).not.toHaveBeenCalled();
		expect(readVoteView).not.toHaveBeenCalled();
	});

	it('reads the Unmod view while an unmoderated caucus runs, or the room is suspended in one', async () => {
		const unmod = { gsl: GSL, motion: null };
		vi.mocked(readUnmodView).mockResolvedValue(unmod);

		expect(
			(await readLiveRoomViews(SUPABASE, frameIn('unmoderated_caucus'), URL_SHOWN)).unmod
		).toBe(unmod);

		const suspended = frameIn('suspended', 'unmoderated_caucus');
		expect((await readLiveRoomViews(SUPABASE, suspended, URL_SHOWN)).unmod).toBe(unmod);
	});

	it('reads the Vote view, with the address’s questions, while the room votes or is suspended in a vote', async () => {
		const voteView = {
			vote: null,
			closedVotes: [],
			isNewVoteShown: true,
			isCancelConfirming: false,
			focusedSeatId: null,
			subjects: []
		};
		vi.mocked(readVoteView).mockResolvedValue(voteView);
		const voting = frameIn('voting');

		expect((await readLiveRoomViews(SUPABASE, voting, URL_SHOWN)).voteView).toBe(voteView);
		expect(readVoteView).toHaveBeenCalledWith(SUPABASE, voting, URL_SHOWN);

		const suspended = frameIn('suspended', 'voting');
		expect((await readLiveRoomViews(SUPABASE, suspended, URL_SHOWN)).voteView).toBe(voteView);
	});

	it('leaves the vote alone while the room is suspended in another mode', async () => {
		const views = await readLiveRoomViews(
			SUPABASE,
			frameIn('suspended', 'formal_debate'),
			URL_SHOWN
		);

		expect(views.voteView).toBeNull();
		expect(readVoteView).not.toHaveBeenCalled();
	});
});

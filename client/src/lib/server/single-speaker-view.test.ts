import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommitteeStateView } from '$lib/chair-room';
import type { RoomSeat } from '$lib/committee-room';
import type { GslList } from '$lib/gsl-floor';
import { readSingleSpeakerView } from './single-speaker-view';

// The list is read by `./active-list.ts`, which has tests of its own, so it is
// stood in for here. What is tested is when the reader asks for it, for which
// list, and what it makes of the answer.
vi.mock('$lib/server/active-list', () => ({ readListWithEntries: vi.fn() }));

import { readListWithEntries } from '$lib/server/active-list';

/** The client is only handed on to the list's reader, which is stood in for. */
const SUPABASE = {} as SupabaseClient;

const GHANA: RoomSeat = { id: 'seat-gh', name: 'Ghana', countryCode: 'GH' };

const LIST: GslList = {
	speakersList: { id: 'single-1', name: 'Single speaker', speakingTimeSeconds: 60, isOpen: true },
	speakers: []
};

const SESSION = {
	id: 'session-1',
	name: 'Session 1',
	status: 'in_progress' as const,
	startedAt: null,
	endedAt: null
};

/** The room in `mode`, on the single speaker's list unless `changes` say otherwise. */
function frameIn(mode: CommitteeStateView['mode'], changes: Partial<CommitteeStateView> = {}) {
	const committeeState: CommitteeStateView = {
		currentSessionId: 'session-1',
		mode,
		currentMotionId: null,
		activeSpeakersListId: 'single-1',
		currentSpeakerEntryId: 'entry-gh',
		currentVoteId: null,
		agendaTopic: null,
		timer: { totalSeconds: 60, endsAt: null, pausedRemainingSeconds: 60 },
		...changes
	};

	return { committeeState, currentSession: SESSION, seats: [GHANA] };
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(readListWithEntries).mockResolvedValue({ ...LIST, purpose: 'Point of order' });
});

describe('readSingleSpeakerView', () => {
	it('reads the active list with the seats the layout read, and hands its purpose apart', async () => {
		const view = await readSingleSpeakerView(SUPABASE, frameIn('single_speaker'));

		expect(readListWithEntries).toHaveBeenCalledWith(SUPABASE, 'single-1', [GHANA]);
		expect(view).toEqual({ list: LIST, purpose: 'Point of order' });
	});

	it('reads it while the room is suspended from a single speaker too', async () => {
		const suspended = frameIn('suspended', { modeBeforeSuspension: 'single_speaker' });

		expect(await readSingleSpeakerView(SUPABASE, suspended)).toEqual({
			list: LIST,
			purpose: 'Point of order'
		});
	});

	it('reads nothing while the room is in another mode, or suspended from one', async () => {
		const suspendedInGsl = frameIn('suspended', { modeBeforeSuspension: 'formal_debate' });

		expect(await readSingleSpeakerView(SUPABASE, frameIn('formal_debate'))).toBeNull();
		expect(await readSingleSpeakerView(SUPABASE, suspendedInGsl)).toBeNull();
		expect(readListWithEntries).not.toHaveBeenCalled();
	});

	it('answers no list and no purpose before the list exists or once it is gone', async () => {
		const noListYet = frameIn('single_speaker', { activeSpeakersListId: null });

		expect(await readSingleSpeakerView(SUPABASE, noListYet)).toEqual({ list: null, purpose: null });
		expect(readListWithEntries).not.toHaveBeenCalled();

		vi.mocked(readListWithEntries).mockResolvedValue(null);
		expect(await readSingleSpeakerView(SUPABASE, frameIn('single_speaker'))).toEqual({
			list: null,
			purpose: null
		});
	});
});

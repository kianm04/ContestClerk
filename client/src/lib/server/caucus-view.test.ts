import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommitteeStateView } from '$lib/chair-room';
import type { GslList } from '$lib/gsl-floor';
import { readCaucusMotion, readModView, readUnmodView } from './caucus-view';
import { readSingleSpeakerView } from './single-speaker-view';

// The lists are read by `./active-list.ts` and `./gsl-view.ts`, which have
// tests of their own, so they are stood in for here. The motion is read
// through a stand-in client answering fixed rows.
vi.mock('$lib/server/active-list', () => ({ readListWithEntries: vi.fn() }));
vi.mock('$lib/server/gsl-view', () => ({ readGslList: vi.fn() }));

import { readListWithEntries } from '$lib/server/active-list';
import { readGslList } from '$lib/server/gsl-view';

/** A stand-in client answering every `motions` query with `row`. */
function motionsAnswering(row: unknown): SupabaseClient {
	const builder = {
		then: (resolve: (value: unknown) => void) => resolve({ data: row, error: null }),
		select: () => builder,
		eq: () => builder,
		maybeSingle: () => builder,
		overrideTypes: () => builder
	};

	return { from: () => builder } as unknown as SupabaseClient;
}

const MOTION_ROW = {
	id: 'motion-1',
	kind: 'moderated_caucus',
	topic: 'Corridors',
	total_time_seconds: 600,
	speaking_time_seconds: 60,
	started_without_vote: true,
	proposer: { name: 'Brazil' }
};

const LIST: GslList = {
	speakersList: { id: 'caucus-1', name: 'Corridors', speakingTimeSeconds: 60, isOpen: true },
	speakers: []
};

const SESSION = {
	id: 'session-1',
	name: 'Session 1',
	status: 'in_progress' as const,
	startedAt: null,
	endedAt: null
};

/** The room in `mode`, on the list `caucus-1`. */
function stateIn(mode: CommitteeStateView['mode'], changes: Partial<CommitteeStateView> = {}) {
	const committeeState: CommitteeStateView = {
		currentSessionId: 'session-1',
		mode,
		currentMotionId: 'motion-1',
		activeSpeakersListId: 'caucus-1',
		currentSpeakerEntryId: null,
		currentVoteId: null,
		agendaTopic: null,
		timer: { totalSeconds: null, endsAt: null, pausedRemainingSeconds: null },
		...changes
	};

	return { committeeState, currentSession: SESSION, seats: [] };
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(readListWithEntries).mockResolvedValue({ ...LIST, purpose: 'Right of reply' });
	vi.mocked(readGslList).mockResolvedValue({
		...LIST,
		speakersList: { ...LIST.speakersList, id: 'gsl-1' }
	});
});

describe('readCaucusMotion', () => {
	it('reads the caucus with who raised it and whether it was started without a vote', async () => {
		expect(await readCaucusMotion(motionsAnswering(MOTION_ROW), 'motion-1')).toEqual({
			id: 'motion-1',
			kind: 'moderated_caucus',
			topic: 'Corridors',
			totalTimeSeconds: 600,
			speakingTimeSeconds: 60,
			raisedByName: 'Brazil',
			startedWithoutVote: true
		});
	});

	it('is null for no motion, or one that is not a caucus', async () => {
		expect(await readCaucusMotion(motionsAnswering(MOTION_ROW), null)).toBeNull();
		expect(
			await readCaucusMotion(motionsAnswering({ ...MOTION_ROW, kind: 'other' }), 'motion-1')
		).toBeNull();
	});
});

describe('readModView', () => {
	it('reads the running caucus’s own list and its motion', async () => {
		const view = await readModView(motionsAnswering(MOTION_ROW), stateIn('moderated_caucus'));

		expect(readListWithEntries).toHaveBeenCalledWith(expect.anything(), 'caucus-1', []);
		expect(view?.list?.speakersList.id).toBe('caucus-1');
		expect(view?.motion?.raisedByName).toBe('Brazil');
	});

	it('reads it while the room is suspended in the caucus too', async () => {
		const suspended = stateIn('suspended', { modeBeforeSuspension: 'moderated_caucus' });

		expect(await readModView(motionsAnswering(MOTION_ROW), suspended)).not.toBeNull();
	});

	it('is null while no moderated caucus runs, when the view draws its start form', async () => {
		expect(await readModView(motionsAnswering(MOTION_ROW), stateIn('formal_debate'))).toBeNull();
		expect(readListWithEntries).not.toHaveBeenCalled();
	});
});

describe('readUnmodView', () => {
	it('reads the General Speakers’ List, and the caucus while one runs', async () => {
		const running = await readUnmodView(
			motionsAnswering({ ...MOTION_ROW, kind: 'unmoderated_caucus' }),
			stateIn('unmoderated_caucus')
		);

		expect(running?.gsl?.speakersList.id).toBe('gsl-1');
		expect(running?.motion?.kind).toBe('unmoderated_caucus');
	});

	it('reads the GSL with no motion before the caucus starts', async () => {
		const before = await readUnmodView(motionsAnswering(MOTION_ROW), stateIn('formal_debate'));

		expect(before?.gsl).not.toBeNull();
		expect(before?.motion).toBeNull();
	});

	it('is null with no session running', async () => {
		const noSession = { ...stateIn('formal_debate'), currentSession: null };

		expect(await readUnmodView(motionsAnswering(MOTION_ROW), noSession)).toBeNull();
	});
});

describe('readSingleSpeakerView', () => {
	it('reads the single speaker’s list and its purpose', async () => {
		const view = await readSingleSpeakerView(
			motionsAnswering(null),
			stateIn('single_speaker', { currentMotionId: null })
		);

		expect(view).toEqual({ list: LIST, purpose: 'Right of reply' });
	});

	it('is null while no single speaker has the floor', async () => {
		expect(await readSingleSpeakerView(motionsAnswering(null), stateIn('voting'))).toBeNull();
	});
});

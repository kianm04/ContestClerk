import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChairCommittee, ChairRoomFrame } from '$lib/chair-room';
import type { RoomSeat } from '$lib/committee-room';
import { CAUCUS_REFUSALS, caucusActions } from './caucus-actions';
import type { ChairRequestEvent } from './chair-floor-actions';

// The gate, the room and the rows are stood in for. These tests are about what
// the caucus's own actions promise the three pages that spread them (`chair`,
// `chair/mod`, `chair/unmod`): what each refuses with the sentences of
// `mod.md`, what each writes, and where each sends the chair. The whole view
// runs against a real database in `tests/e2e/chair-mod.spec.ts`.
vi.mock('$lib/server/access', () => ({ requireCommitteePermission: vi.fn() }));

vi.mock('$lib/server/committee-room', () => ({
	getActiveSpeakersList: vi.fn(),
	getChairRoomFrame: vi.fn(),
	setRoomMode: vi.fn(),
	timerColumns: vi.fn(),
	updateCommitteeState: vi.fn()
}));

vi.mock('$lib/server/speakers-list-edits', () => ({
	addSpeaker: vi.fn(),
	getSpeakersLists: vi.fn(),
	placeSpeakers: vi.fn(),
	removeSpeaker: vi.fn(),
	setListOpen: vi.fn(),
	setSpeakingTime: vi.fn(),
	swapSpeakers: vi.fn()
}));

vi.mock('$lib/server/speakers-lists', () => ({
	moveToNextSpeaker: vi.fn(),
	yieldToChair: vi.fn(),
	yieldToSeat: vi.fn()
}));

vi.mock('$lib/server/roll-calls', () => ({
	getOrCreateRollCall: vi.fn(),
	setRollCallStatus: vi.fn()
}));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

import { requireCommitteePermission } from '$lib/server/access';
import {
	getActiveSpeakersList,
	getChairRoomFrame,
	setRoomMode,
	updateCommitteeState
} from '$lib/server/committee-room';
import { getOrCreateRollCall, setRollCallStatus } from '$lib/server/roll-calls';
import { addSpeaker, placeSpeakers } from '$lib/server/speakers-list-edits';
import { moveToNextSpeaker } from '$lib/server/speakers-lists';

const SUPABASE = {};
const ENTRY_ID = '6b0e5c4a-1f3d-4e2a-9b8c-7d6e5f4a3b2c';

const COMMITTEE: ChairCommittee = {
	id: 'committee-1',
	slug: 'unsc',
	name: 'Security Council',
	abbreviation: 'UNSC',
	room: null,
	defaultSpeakingTimeSeconds: 60,
	topics: []
};

const KENYA: RoomSeat = { id: 'seat-ke', name: 'Kenya', countryCode: 'KE' };
const FRANCE: RoomSeat = { id: 'seat-fr', name: 'France', countryCode: 'FR' };
const JAPAN: RoomSeat = { id: 'seat-jp', name: 'Japan', countryCode: 'JP' };

/** A moderated caucus on its own list, Kenya speaking, the caucus clock paused at 6:12. */
const MOD_FRAME: ChairRoomFrame = {
	committeeState: {
		currentSessionId: 'session-1',
		mode: 'moderated_caucus',
		currentMotionId: 'motion-1',
		activeSpeakersListId: 'caucus-1',
		currentSpeakerEntryId: 'entry-ke',
		currentVoteId: null,
		agendaTopic: null,
		timer: { totalSeconds: 60, endsAt: null, pausedRemainingSeconds: 60 },
		caucusClock: { totalSeconds: 600, endsAt: null, pausedRemainingSeconds: 372 }
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
	seats: [FRANCE, JAPAN, KENYA],
	attendance: {},
	latestRollCallId: null
};

/** The caucus list: Kenya speaking, France waiting. */
const CAUCUS_LIST = {
	speakersList: { id: 'caucus-1', name: 'Corridors', speakingTimeSeconds: 60, isOpen: true },
	speakers: [
		{ id: 'entry-ke', position: 1, status: 'speaking' as const, seat: KENYA },
		{ id: 'entry-fr', position: 2, status: 'waiting' as const, seat: FRANCE }
	]
};

/** A post to `chair/mod`, carrying `fields` as its form. */
function makeEvent(fields: Record<string, string> = {}): ChairRequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) formData.set(name, value);

	return {
		params: { slug: 'thimun-2027', committeeSlug: 'unsc' },
		url: new URL('http://localhost/conferences/thimun-2027/committees/unsc/chair/mod'),
		locals: { supabase: SUPABASE },
		cookies: {},
		request: { formData: async () => formData }
	} as unknown as ChairRequestEvent;
}

/** Run something expected to redirect, and give back where it was going. */
async function catchRedirect(run: () => unknown): Promise<{ status: number; location: string }> {
	try {
		await run();
	} catch (thrown) {
		return thrown as { status: number; location: string };
	}

	throw new Error('Nothing was thrown, so nothing redirected.');
}

/** What a refused action answers: 400, with the sentence as an error toast. */
type FailResult = { status: number; data: { flash: { tone: string; message: string } } };

const actions = caucusActions(() => '/the-mod-view');
const ROOM_URL = '/conferences/thimun-2027/committees/unsc/chair';

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(requireCommitteePermission).mockResolvedValue({
		user: { id: 'user-1', email: 'amira@example.com' },
		conference: {} as Awaited<ReturnType<typeof requireCommitteePermission>>['conference'],
		committee: COMMITTEE
	});
	vi.mocked(getChairRoomFrame).mockResolvedValue(MOD_FRAME);
	vi.mocked(getActiveSpeakersList).mockResolvedValue(CAUCUS_LIST);
});

describe('recognise', () => {
	it('adds the seat at the end of the caucus list while someone speaks', async () => {
		const event = makeEvent({ listId: 'caucus-1', seatId: 'seat-jp', newRowId: ENTRY_ID });
		const redirect = await catchRedirect(() => actions.recognise(event));

		expect(addSpeaker).toHaveBeenCalledWith(SUPABASE, 'caucus-1', 'seat-jp', 3, ENTRY_ID);
		expect(moveToNextSpeaker).not.toHaveBeenCalled();
		expect(redirect).toEqual(expect.objectContaining({ status: 303, location: '/the-mod-view' }));
	});

	it('gives the recognised seat the floor at once while nobody has it, not the first waiting', async () => {
		const empty = {
			...MOD_FRAME,
			committeeState: { ...MOD_FRAME.committeeState, currentSpeakerEntryId: null }
		};
		vi.mocked(getChairRoomFrame).mockResolvedValue(empty);
		vi.mocked(getActiveSpeakersList).mockResolvedValue({
			...CAUCUS_LIST,
			speakers: [CAUCUS_LIST.speakers[1]]
		});
		const event = makeEvent({ listId: 'caucus-1', seatId: 'seat-jp', newRowId: ENTRY_ID });

		await catchRedirect(() => actions.recognise(event));

		// Japan goes to the top of the waiting entries, ahead of France, then "Next" calls it.
		expect(placeSpeakers).toHaveBeenCalledWith(SUPABASE, [
			{ id: ENTRY_ID, position: 2 },
			{ id: 'entry-fr', position: 3 }
		]);
		expect(moveToNextSpeaker).toHaveBeenCalledWith(
			SUPABASE,
			COMMITTEE.id,
			empty.committeeState,
			expect.objectContaining({ speakersList: CAUCUS_LIST.speakersList }),
			expect.any(Date)
		);
	});

	it('refuses a seat already on the list, a seat not present, and a list that is not the caucus’s', async () => {
		const listed = (await actions.recognise(
			makeEvent({ listId: 'caucus-1', seatId: 'seat-fr' })
		)) as FailResult;
		const elsewhere = (await actions.recognise(
			makeEvent({ listId: 'gsl-1', seatId: 'seat-jp' })
		)) as FailResult;
		const stranger = (await actions.recognise(
			makeEvent({ listId: 'caucus-1', seatId: 'seat-xx' })
		)) as FailResult;

		expect(listed.data.flash.message).toBe('That seat is already on the list.');
		expect(elsewhere.data.flash.message).toBe('No caucus is running.');
		expect(stranger.data.flash.message).toBe('That seat is not present.');
		expect(addSpeaker).not.toHaveBeenCalled();
	});

	it('marks an absent seat present first, but only through "absent · Mark present"', async () => {
		vi.mocked(getChairRoomFrame).mockResolvedValue({
			...MOD_FRAME,
			attendance: { 'seat-jp': 'absent' }
		});
		vi.mocked(getOrCreateRollCall).mockResolvedValue('roll-call-1');

		const refused = (await actions.recognise(
			makeEvent({ listId: 'caucus-1', seatId: 'seat-jp' })
		)) as FailResult;
		expect(refused.data.flash.message).toBe('That seat is not present.');

		await catchRedirect(() =>
			actions.recognise(makeEvent({ listId: 'caucus-1', seatId: 'seat-jp', markPresent: '1' }))
		);
		expect(setRollCallStatus).toHaveBeenCalledWith(SUPABASE, 'roll-call-1', 'seat-jp', 'present');
		expect(addSpeaker).toHaveBeenCalled();
	});

	it('refuses while no caucus runs', async () => {
		const gsl = {
			...MOD_FRAME,
			committeeState: { ...MOD_FRAME.committeeState, mode: 'formal_debate' as const }
		};
		vi.mocked(getChairRoomFrame).mockResolvedValue(gsl);

		const result = (await actions.recognise(
			makeEvent({ listId: 'caucus-1', seatId: 'seat-jp' })
		)) as FailResult;

		expect(result.status).toBe(400);
		expect(result.data.flash.message).toBe(CAUCUS_REFUSALS.noCaucus);
	});
});

describe('extendCaucus', () => {
	it('adds five minutes to the caucus clock, recording no motion', async () => {
		const redirect = await catchRedirect(() => actions.extendCaucus(makeEvent()));

		expect(updateCommitteeState).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id, {
			caucus_total_seconds: 900,
			caucus_ends_at: null,
			caucus_paused_remaining_seconds: 672
		});
		expect(redirect.location).toBe('/the-mod-view');
	});

	it('refuses outside a moderated caucus', async () => {
		const unmod = {
			...MOD_FRAME,
			committeeState: { ...MOD_FRAME.committeeState, mode: 'unmoderated_caucus' as const }
		};
		vi.mocked(getChairRoomFrame).mockResolvedValue(unmod);

		const result = (await actions.extendCaucus(makeEvent())) as FailResult;

		expect(result.data.flash.message).toBe('No caucus is running.');
		expect(updateCommitteeState).not.toHaveBeenCalled();
	});
});

describe('endCaucus', () => {
	it('returns the room to the General Speakers’ List and takes the chair to the live room', async () => {
		const redirect = await catchRedirect(() => actions.endCaucus(makeEvent()));

		expect(setRoomMode).toHaveBeenCalledWith(
			SUPABASE,
			COMMITTEE.id,
			MOD_FRAME.committeeState,
			'formal_debate'
		);
		expect(redirect).toEqual(expect.objectContaining({ status: 303, location: ROOM_URL }));
	});

	it('ends an unmoderated caucus too', async () => {
		const unmod = {
			...MOD_FRAME,
			committeeState: { ...MOD_FRAME.committeeState, mode: 'unmoderated_caucus' as const }
		};
		vi.mocked(getChairRoomFrame).mockResolvedValue(unmod);

		await catchRedirect(() => actions.endCaucus(makeEvent()));

		expect(setRoomMode).toHaveBeenCalledWith(
			SUPABASE,
			COMMITTEE.id,
			unmod.committeeState,
			'formal_debate'
		);
	});

	it('refuses while no caucus runs', async () => {
		const gsl = {
			...MOD_FRAME,
			committeeState: { ...MOD_FRAME.committeeState, mode: 'formal_debate' as const }
		};
		vi.mocked(getChairRoomFrame).mockResolvedValue(gsl);

		const result = (await actions.endCaucus(makeEvent())) as FailResult;

		expect(result.data.flash.message).toBe('No caucus is running.');
		expect(setRoomMode).not.toHaveBeenCalled();
	});
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChairCommittee, ChairRoomFrame } from '$lib/chair-room';
import type { SessionSpeakersList } from '$lib/speakers-lists';
import type { ChairRequestEvent } from './chair-floor-actions';
import { QUEUE_REFUSALS, markSeatPresent, openList, queueActions } from './speaker-queue-actions';

// The gate, the room, the roll call and the list's rows are stood in for.
// These tests are about what the queue column's actions promise both pages
// that draw the GSL view (`chair` and `chair/gsl`): which list and entry they
// find, what each refuses with the sentences of `gsl.md`, what each writes,
// and that each returns to the address the page asked for, given the list it
// changed.
vi.mock('$lib/server/access', () => ({ requireCommitteePermission: vi.fn() }));

vi.mock('$lib/server/committee-room', () => ({
	getActiveSpeakersList: vi.fn(),
	getChairRoomFrame: vi.fn(),
	timerColumns: vi.fn(),
	updateCommitteeState: vi.fn()
}));

vi.mock('$lib/server/speakers-lists', () => ({
	moveToNextSpeaker: vi.fn(),
	yieldToChair: vi.fn(),
	yieldToSeat: vi.fn()
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

vi.mock('$lib/server/roll-calls', () => ({
	getOrCreateRollCall: vi.fn(),
	setRollCallStatus: vi.fn()
}));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

import { requireCommitteePermission } from '$lib/server/access';
import { getChairRoomFrame } from '$lib/server/committee-room';
import { getOrCreateRollCall, setRollCallStatus } from '$lib/server/roll-calls';
import {
	addSpeaker,
	getSpeakersLists,
	placeSpeakers,
	removeSpeaker,
	setListOpen,
	setSpeakingTime,
	swapSpeakers
} from '$lib/server/speakers-list-edits';
import { moveToNextSpeaker } from '$lib/server/speakers-lists';

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

const FRANCE = { id: 'seat-fr', name: 'France', countryCode: 'FR' };
const KENYA = { id: 'seat-ke', name: 'Kenya', countryCode: 'KE' };
const PERU = { id: 'seat-pe', name: 'Peru', countryCode: 'PE' };
const CHINA = { id: 'seat-cn', name: 'China', countryCode: 'CN' };

/** A room in formal debate on the GSL, with four present seats and China on the floor. */
const FRAME: ChairRoomFrame = {
	committeeState: {
		currentSessionId: 'session-1',
		mode: 'formal_debate',
		currentMotionId: null,
		activeSpeakersListId: 'list-1',
		currentSpeakerEntryId: 'entry-cn',
		currentVoteId: null,
		agendaTopic: null,
		timer: { totalSeconds: 60, endsAt: null, pausedRemainingSeconds: 30 }
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
	seats: [CHINA, FRANCE, KENYA, PERU],
	attendance: {},
	latestRollCallId: null
};

/** The session's one open list: China speaking, then France and Kenya waiting. */
const LIST: SessionSpeakersList = {
	speakersList: { id: 'list-1', name: 'GSL', speakingTimeSeconds: 60, isOpen: true },
	speakers: [
		{ id: 'entry-cn', position: 1, status: 'speaking', seat: CHINA, spokeSeconds: null },
		{ id: 'entry-fr', position: 2, status: 'waiting', seat: FRANCE, spokeSeconds: null },
		{ id: 'entry-ke', position: 3, status: 'waiting', seat: KENYA, spokeSeconds: null }
	]
};

/** A post to a chair page, carrying `fields` as its form. */
function makeEvent(fields: Record<string, string> = {}): ChairRequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	return {
		params: { slug: 'thimun-2027', committeeSlug: 'unsc' },
		url: new URL('http://localhost/conferences/thimun-2027/committees/unsc/chair/gsl'),
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
function refusal(message: string) {
	return { status: 400, data: { flash: { tone: 'error', message } } };
}

/** The actions as a page spreads them, sending the chair back to `/the-gsl`. */
const actions = queueActions(() => '/the-gsl');

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(requireCommitteePermission).mockResolvedValue({
		user: { id: 'user-1', email: 'amira@example.com' },
		conference: {} as Awaited<ReturnType<typeof requireCommitteePermission>>['conference'],
		committee: COMMITTEE
	});
	vi.mocked(getChairRoomFrame).mockResolvedValue(FRAME);
	vi.mocked(getSpeakersLists).mockResolvedValue([LIST]);
	vi.mocked(getOrCreateRollCall).mockResolvedValue('roll-call-1');
	vi.mocked(moveToNextSpeaker).mockResolvedValue('moved');
});

describe('openList', () => {
	it('finds the list the form names among the running session’s', async () => {
		const formData = new FormData();
		formData.set('listId', 'list-1');

		expect(await openList(makeEvent(), formData)).toEqual({
			conference: {},
			committee: COMMITTEE,
			frame: FRAME,
			list: LIST
		});
		expect(getSpeakersLists).toHaveBeenCalledWith(SUPABASE, 'session-1', FRAME.seats);
	});

	it('refuses a list that is not one of the session’s', async () => {
		const formData = new FormData();
		formData.set('listId', 'list-elsewhere');

		expect(await openList(makeEvent(), formData)).toEqual({
			refusal: 'That list is not one of this session’s.'
		});
	});

	it('refuses when no session is running, without reading any list', async () => {
		vi.mocked(getChairRoomFrame).mockResolvedValue({ ...FRAME, currentSession: null });
		const formData = new FormData();
		formData.set('listId', 'list-1');

		expect(await openList(makeEvent(), formData)).toEqual({ refusal: 'No session is running.' });
		expect(getSpeakersLists).not.toHaveBeenCalled();
	});
});

describe('markSeatPresent', () => {
	it('marks the seat present at the session’s roll call, made for every seat if it has none', async () => {
		await markSeatPresent(makeEvent(), FRAME, 'seat-pe');

		expect(getOrCreateRollCall).toHaveBeenCalledWith(SUPABASE, 'session-1', [
			'seat-cn',
			'seat-fr',
			'seat-ke',
			'seat-pe'
		]);
		expect(setRollCallStatus).toHaveBeenCalledWith(SUPABASE, 'roll-call-1', 'seat-pe', 'present');
	});

	it('does nothing while no session runs, since there is no roll call to mark', async () => {
		await markSeatPresent(makeEvent(), { ...FRAME, currentSession: null }, 'seat-pe');

		expect(getOrCreateRollCall).not.toHaveBeenCalled();
		expect(setRollCallStatus).not.toHaveBeenCalled();
	});
});

describe('queueActions', () => {
	it('offers the same actions to every page that draws the queue column', () => {
		expect(Object.keys(actions).sort()).toEqual([
			'add',
			'closeList',
			'moveDown',
			'moveTo',
			'moveToTop',
			'moveUp',
			'openList',
			'remove',
			'setSpeakingTime',
			'speakNow'
		]);
	});

	it('rewords two of the Speakers page’s sentences for the GSL view', () => {
		expect(QUEUE_REFUSALS.noSession).toBe('No session is running.');
		expect(QUEUE_REFUSALS.removeSpeaking).toBe('Use End speech or Next to end the current speech.');
	});
});

describe('add', () => {
	it('adds a present seat last, then returns to the address given for that list', async () => {
		const returnAddress = vi.fn(() => '/the-room');
		const event = makeEvent({ listId: 'list-1', seatId: 'seat-pe' });

		const redirect = await catchRedirect(() => queueActions(returnAddress).add(event));

		expect(addSpeaker).toHaveBeenCalledWith(SUPABASE, 'list-1', 'seat-pe', 4, null);
		expect(redirect).toMatchObject({ status: 303, location: '/the-room' });
		expect(returnAddress).toHaveBeenCalledWith(event, 'list-1');
		expect(setRollCallStatus).not.toHaveBeenCalled();
	});

	it('saves the new entry under the id the chair’s browser chose (T141)', async () => {
		const newRowId = '5b2f8c1e-9d3a-4e7b-8c6f-1a2b3c4d5e6f';
		const event = makeEvent({ listId: 'list-1', seatId: 'seat-pe', newRowId });

		await catchRedirect(() => actions.add(event));

		expect(addSpeaker).toHaveBeenCalledWith(SUPABASE, 'list-1', 'seat-pe', 4, newRowId);
	});

	it('refuses a seat already waiting or speaking', async () => {
		const waiting = await actions.add(makeEvent({ listId: 'list-1', seatId: 'seat-fr' }));
		const speaking = await actions.add(makeEvent({ listId: 'list-1', seatId: 'seat-cn' }));

		expect(waiting).toMatchObject(refusal('That seat is already on the list.'));
		expect(speaking).toMatchObject(refusal('That seat is already on the list.'));
		expect(addSpeaker).not.toHaveBeenCalled();
	});

	it('refuses a seat marked absent, and a seat of another committee', async () => {
		vi.mocked(getChairRoomFrame).mockResolvedValue({
			...FRAME,
			attendance: { 'seat-pe': 'absent' },
			latestRollCallId: 'roll-call-1'
		});

		const absent = await actions.add(makeEvent({ listId: 'list-1', seatId: 'seat-pe' }));
		const elsewhere = await actions.add(makeEvent({ listId: 'list-1', seatId: 'seat-xx' }));

		expect(absent).toMatchObject(refusal('That seat is not present.'));
		expect(elsewhere).toMatchObject(refusal('That seat is not present.'));
		expect(addSpeaker).not.toHaveBeenCalled();
	});

	it('marks an absent seat present at the roll call and adds it, for "absent · Mark present"', async () => {
		vi.mocked(getChairRoomFrame).mockResolvedValue({
			...FRAME,
			attendance: { 'seat-pe': 'absent' },
			latestRollCallId: 'roll-call-1'
		});
		const event = makeEvent({ listId: 'list-1', seatId: 'seat-pe', markPresent: '1' });

		await catchRedirect(() => actions.add(event));

		expect(getOrCreateRollCall).toHaveBeenCalledWith(SUPABASE, 'session-1', [
			'seat-cn',
			'seat-fr',
			'seat-ke',
			'seat-pe'
		]);
		expect(setRollCallStatus).toHaveBeenCalledWith(SUPABASE, 'roll-call-1', 'seat-pe', 'present');
		expect(addSpeaker).toHaveBeenCalledWith(SUPABASE, 'list-1', 'seat-pe', 4, null);
	});

	it('leaves the roll call alone when a present seat is sent with "Mark present"', async () => {
		const event = makeEvent({ listId: 'list-1', seatId: 'seat-pe', markPresent: '1' });

		await catchRedirect(() => actions.add(event));

		expect(getOrCreateRollCall).not.toHaveBeenCalled();
		expect(addSpeaker).toHaveBeenCalled();
	});

	it('refuses to add to a closed list, even with "Mark present"', async () => {
		const closed = { ...LIST, speakersList: { ...LIST.speakersList, isOpen: false } };
		vi.mocked(getSpeakersLists).mockResolvedValue([closed]);
		const event = makeEvent({ listId: 'list-1', seatId: 'seat-pe', markPresent: '1' });

		expect(await actions.add(event)).toMatchObject(refusal('The list is closed.'));
		expect(setRollCallStatus).not.toHaveBeenCalled();
		expect(addSpeaker).not.toHaveBeenCalled();
	});

	it('refuses a list that is not one of the running session’s, and any list without a session', async () => {
		const elsewhere = await actions.add(makeEvent({ listId: 'list-9', seatId: 'seat-pe' }));

		vi.mocked(getChairRoomFrame).mockResolvedValue({ ...FRAME, currentSession: null });
		const noSession = await actions.add(makeEvent({ listId: 'list-1', seatId: 'seat-pe' }));

		expect(elsewhere).toMatchObject(refusal('That list is not one of this session’s.'));
		expect(noSession).toMatchObject(refusal('No session is running.'));
	});
});

describe('moveUp, moveDown, moveToTop and moveTo', () => {
	it('swaps an entry with the waiting one above it on "Move up"', async () => {
		await catchRedirect(() => actions.moveUp(makeEvent({ entryId: 'entry-ke' })));

		expect(swapSpeakers).toHaveBeenCalledWith(SUPABASE, LIST.speakers[2], LIST.speakers[1]);
	});

	it('moves nothing at either end, and never past the speaking entry', async () => {
		await catchRedirect(() => actions.moveUp(makeEvent({ entryId: 'entry-fr' })));
		await catchRedirect(() => actions.moveDown(makeEvent({ entryId: 'entry-ke' })));

		expect(swapSpeakers).not.toHaveBeenCalled();
	});

	it('puts a dragged entry at the place it was dropped (T129)', async () => {
		const event = makeEvent({ entryId: 'entry-fr', place: '2' });

		const redirect = await catchRedirect(() => actions.moveTo(event));

		expect(placeSpeakers).toHaveBeenCalledWith(SUPABASE, [
			{ id: 'entry-ke', position: 2 },
			{ id: 'entry-fr', position: 3 }
		]);
		expect(redirect).toMatchObject({ status: 303, location: '/the-gsl' });
	});

	it('moves an entry to the top on "Move to top"', async () => {
		await catchRedirect(() => actions.moveToTop(makeEvent({ entryId: 'entry-ke' })));

		expect(placeSpeakers).toHaveBeenCalledWith(SUPABASE, [
			{ id: 'entry-ke', position: 2 },
			{ id: 'entry-fr', position: 3 }
		]);
	});

	it('refuses a drop without a place, and an entry that is no longer waiting', async () => {
		const withoutPlace = await actions.moveTo(makeEvent({ entryId: 'entry-fr' }));
		const speaking = await actions.moveToTop(makeEvent({ entryId: 'entry-cn' }));

		expect(withoutPlace).toMatchObject(refusal('Choose a place in the queue.'));
		expect(speaking).toMatchObject(refusal('That speaker is no longer waiting.'));
		expect(placeSpeakers).not.toHaveBeenCalled();
	});

	it('refuses an entry that is not on one of the session’s lists', async () => {
		const result = await actions.moveUp(makeEvent({ entryId: 'entry-elsewhere' }));

		expect(result).toMatchObject(refusal('That speaker is not on one of this session’s lists.'));
	});
});

describe('remove', () => {
	it('takes a waiting entry off the list and returns to the page', async () => {
		const redirect = await catchRedirect(() => actions.remove(makeEvent({ entryId: 'entry-fr' })));

		expect(removeSpeaker).toHaveBeenCalledWith(SUPABASE, 'entry-fr');
		expect(redirect).toMatchObject({ status: 303, location: '/the-gsl' });
	});

	it('refuses the entry that has the floor, naming the buttons that end a speech', async () => {
		const result = await actions.remove(makeEvent({ entryId: 'entry-cn' }));

		expect(result).toMatchObject(refusal('Use End speech or Next to end the current speech.'));
		expect(removeSpeaker).not.toHaveBeenCalled();
	});

	it('refuses an entry that has already spoken', async () => {
		const spokenList = {
			...LIST,
			speakers: [{ ...LIST.speakers[0], status: 'spoken' as const }, ...LIST.speakers.slice(1)]
		};
		vi.mocked(getSpeakersLists).mockResolvedValue([spokenList]);

		const result = await actions.remove(makeEvent({ entryId: 'entry-cn' }));

		expect(result).toMatchObject(refusal('That speaker is no longer waiting.'));
	});
});

describe('speakNow', () => {
	it('moves the entry to the top, then gives it the floor through "Next" at the press', async () => {
		const pressedAt = new Date().toISOString();
		const event = makeEvent({ entryId: 'entry-ke', pressedAt });

		const redirect = await catchRedirect(() => actions.speakNow(event));

		expect(placeSpeakers).toHaveBeenCalledWith(SUPABASE, [
			{ id: 'entry-ke', position: 2 },
			{ id: 'entry-fr', position: 3 }
		]);
		expect(moveToNextSpeaker).toHaveBeenCalledWith(
			SUPABASE,
			'committee-1',
			FRAME.committeeState,
			{ speakersList: LIST.speakersList, speakers: LIST.speakers },
			new Date(pressedAt)
		);
		expect(redirect).toMatchObject({ status: 303, location: '/the-gsl' });
	});

	it('refuses an entry that is no longer waiting, or on no list of the session', async () => {
		const speaking = await actions.speakNow(makeEvent({ entryId: 'entry-cn' }));
		const elsewhere = await actions.speakNow(makeEvent({ entryId: 'entry-elsewhere' }));

		expect(speaking).toMatchObject(refusal('That speaker is no longer waiting.'));
		expect(elsewhere).toMatchObject(refusal('That speaker is not on one of this session’s lists.'));
		expect(moveToNextSpeaker).not.toHaveBeenCalled();
	});

	it('refuses a seat marked absent', async () => {
		vi.mocked(getChairRoomFrame).mockResolvedValue({
			...FRAME,
			attendance: { 'seat-ke': 'absent' }
		});

		const result = await actions.speakNow(makeEvent({ entryId: 'entry-ke' }));

		expect(result).toMatchObject(refusal('That seat is not present.'));
		expect(placeSpeakers).not.toHaveBeenCalled();
	});

	it('refuses while the list is not the one on the floor, as during a caucus', async () => {
		vi.mocked(getChairRoomFrame).mockResolvedValue({
			...FRAME,
			committeeState: { ...FRAME.committeeState, mode: 'unmoderated_caucus' }
		});

		const result = await actions.speakNow(makeEvent({ entryId: 'entry-ke' }));

		expect(result).toMatchObject(refusal('There is no speakers list open.'));
		expect(placeSpeakers).not.toHaveBeenCalled();
	});
});

describe('setSpeakingTime', () => {
	it('sets a time typed the MUN way, and leaves the running timer alone', async () => {
		const event = makeEvent({ listId: 'list-1', speakingTime: '1:30' });

		const redirect = await catchRedirect(() => actions.setSpeakingTime(event));

		expect(setSpeakingTime).toHaveBeenCalledWith(SUPABASE, 'list-1', 90);
		expect(redirect).toMatchObject({ status: 303, location: '/the-gsl' });
	});

	it('refuses a time outside 30 seconds to 5 minutes, and text that is not a time', async () => {
		const tooLong = await actions.setSpeakingTime(
			makeEvent({ listId: 'list-1', speakingTime: '6' })
		);
		const notATime = await actions.setSpeakingTime(
			makeEvent({ listId: 'list-1', speakingTime: 'soon' })
		);
		const message = 'Speaking time must be between 30 seconds and 5 minutes.';

		expect(tooLong).toMatchObject(refusal(message));
		expect(notATime).toMatchObject(refusal(message));
		expect(setSpeakingTime).not.toHaveBeenCalled();
	});

	it('refuses while no session is running', async () => {
		vi.mocked(getChairRoomFrame).mockResolvedValue({ ...FRAME, currentSession: null });
		const event = makeEvent({ listId: 'list-1', speakingTime: '1:30' });

		expect(await actions.setSpeakingTime(event)).toMatchObject(refusal('No session is running.'));
	});
});

describe('closeList and openList', () => {
	it('close and open the named list, and return to the page', async () => {
		const closed = await catchRedirect(() => actions.closeList(makeEvent({ listId: 'list-1' })));
		await catchRedirect(() => actions.openList(makeEvent({ listId: 'list-1' })));

		expect(setListOpen).toHaveBeenNthCalledWith(1, SUPABASE, 'list-1', false);
		expect(setListOpen).toHaveBeenNthCalledWith(2, SUPABASE, 'list-1', true);
		expect(closed).toMatchObject({ status: 303, location: '/the-gsl' });
	});

	it('refuse a list that is not the session’s', async () => {
		const result = await actions.closeList(makeEvent({ listId: 'list-9' }));

		expect(result).toMatchObject(refusal('That list is not one of this session’s.'));
		expect(setListOpen).not.toHaveBeenCalled();
	});
});

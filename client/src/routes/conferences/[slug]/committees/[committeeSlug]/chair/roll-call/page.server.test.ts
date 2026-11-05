import { error } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the actions are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
import type { ChairCommittee, ChairRoomFrame, CommitteeSession } from '$lib/chair-room';
import type { RoomSeat } from '$lib/committee-room';
import type { Conference } from '$lib/conferences';
import { FROM_VIEW_FIELD } from '$lib/live-mode';
import { ROLL_CALL_FROM_FIELD, ROLL_CALL_REFUSALS, type RollCallSummary } from '$lib/roll-calls';
import { chairGslUrl, chairRollCallDraftUrl, chairRoomUrl } from '$lib/urls';

// The gate, the room's frame and every roll call query are stood in for, so
// these tests are about what the page itself decides: which roll call it
// shows, which refusal each rule answers with, what it writes once a request
// passes, and where it sends the chair back to. The queries have their own
// tests in `src/lib/server/roll-calls.test.ts`, and the whole page runs
// against a real database in `tests/e2e/roll-call.spec.ts`.
vi.mock('$lib/server/access', () => ({ requireCommitteePermission: vi.fn() }));

vi.mock('$lib/server/committee-room', () => ({ getChairRoomFrame: vi.fn() }));

vi.mock('$lib/server/roll-calls', () => ({
	getOrCreateRollCall: vi.fn(),
	listRollCalls: vi.fn(),
	markAllPresent: vi.fn(),
	readRollCallAttendance: vi.fn(),
	readRollCallSessionId: vi.fn(),
	setRollCallStatus: vi.fn(),
	startRollCall: vi.fn()
}));

import { requireCommitteePermission } from '$lib/server/access';
import { getChairRoomFrame } from '$lib/server/committee-room';
import {
	getOrCreateRollCall,
	listRollCalls,
	markAllPresent,
	readRollCallAttendance,
	readRollCallSessionId,
	setRollCallStatus,
	startRollCall
} from '$lib/server/roll-calls';

/** The Supabase client. The page only hands it on to the server modules above. */
const SUPABASE = {};

/** The cookie jar, which none of the roll call's actions touch. */
const COOKIES = {};

const CONFERENCE_SLUG = 'thimun-2027';
const COMMITTEE_SLUG = 'unsc';
const ROLL_CALL_PATH = `/conferences/${CONFERENCE_SLUG}/committees/${COMMITTEE_SLUG}/chair/roll-call`;

const COMMITTEE: ChairCommittee = {
	id: 'committee-1',
	slug: COMMITTEE_SLUG,
	name: 'Security Council',
	abbreviation: 'UNSC',
	room: 'Room 1',
	defaultSpeakingTimeSeconds: 60,
	topics: ['Climate finance']
};

/**
 * `requireCommitteePermission` answers a whole `Conference`; nothing under test reads any of
 * it, so the stand-in only has the fields that name it.
 */
const CONFERENCE = { id: 'conference-1', slug: CONFERENCE_SLUG } as Conference;

const RUNNING_SESSION: CommitteeSession = {
	id: 'session-1',
	name: 'Session 1',
	status: 'in_progress',
	startedAt: '2026-01-01T09:00:00.000Z',
	endedAt: null
};

const SEAT_FR: RoomSeat = { id: 'seat-fr', name: 'France', countryCode: 'FR', delegateName: null };
const SEAT_DE: RoomSeat = { id: 'seat-de', name: 'Germany', countryCode: 'DE', delegateName: null };

/** The session's two roll calls, newest first, the way `listRollCalls` returns them. */
const ROLL_CALLS: RollCallSummary[] = [
	{ id: 'roll-2', takenAt: '2026-01-01T10:05:00Z', takenByName: 'Ada', presentCount: 2 },
	{ id: 'roll-1', takenAt: '2026-01-01T09:02:00Z', takenByName: 'Ada', presentCount: 1 }
];

/** The frame every action reads, with a running session and two seats. */
function makeFrame(overrides: Partial<ChairRoomFrame> = {}): ChairRoomFrame {
	return {
		committeeState: {
			currentSessionId: RUNNING_SESSION.id,
			mode: 'formal_debate',
			currentMotionId: null,
			activeSpeakersListId: null,
			currentSpeakerEntryId: null,
			currentVoteId: null,
			agendaTopic: null,
			timer: { totalSeconds: null, endsAt: null, pausedRemainingSeconds: null }
		},
		sessions: [RUNNING_SESSION],
		currentSession: RUNNING_SESSION,
		currentMotion: null,
		seats: [SEAT_FR, SEAT_DE],
		attendance: {},
		latestRollCallId: null,
		...overrides
	};
}

/** A post to one of the page's actions, with the form fields it sends. */
function makeActionEvent(actionName: string, fields: Record<string, string> = {}): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	return {
		params: { slug: CONFERENCE_SLUG, committeeSlug: COMMITTEE_SLUG },
		url: new URL(`http://localhost${ROLL_CALL_PATH}?/${actionName}`),
		locals: { supabase: SUPABASE },
		cookies: COOKIES,
		request: { formData: async () => formData }
	} as unknown as RequestEvent;
}

/**
 * The page `load`'s event. `parent()` is a promise for what the chair layout's
 * own `load` returned; the stand-in answers the two fields this `load` reads.
 */
function makeLoadEvent(
	search = '',
	currentSession: CommitteeSession | null = RUNNING_SESSION
): PageServerLoadEvent {
	return {
		params: { slug: CONFERENCE_SLUG, committeeSlug: COMMITTEE_SLUG },
		url: new URL(`http://localhost${ROLL_CALL_PATH}${search}`),
		locals: { supabase: SUPABASE },
		depends: vi.fn(),
		parent: async () => ({ committee: COMMITTEE, currentSession })
	} as unknown as PageServerLoadEvent;
}

/** Run something expected to redirect, and give back the redirect SvelteKit threw. */
async function catchRedirect(run: () => unknown): Promise<{ status: number; location: string }> {
	try {
		await run();
	} catch (thrown) {
		return thrown as { status: number; location: string };
	}

	throw new Error('Nothing was thrown, so nothing redirected.');
}

/** What `fail(400, ...)` gives back: a value the action returns, not throws. */
type FailResult = { status: number; data: { flash: { tone: string; message: string } } };

beforeEach(() => {
	vi.clearAllMocks();

	vi.mocked(requireCommitteePermission).mockResolvedValue({
		user: { id: 'user-1', email: 'amira@example.com' },
		conference: CONFERENCE,
		committee: COMMITTEE
	});
	vi.mocked(getChairRoomFrame).mockResolvedValue(makeFrame());
	vi.mocked(listRollCalls).mockResolvedValue(ROLL_CALLS);
	vi.mocked(readRollCallAttendance).mockResolvedValue({
		'seat-fr': 'present',
		'seat-de': 'present_and_voting'
	});
	vi.mocked(readRollCallSessionId).mockResolvedValue(RUNNING_SESSION.id);
	vi.mocked(startRollCall).mockResolvedValue('roll-3');
	vi.mocked(getOrCreateRollCall).mockResolvedValue('roll-2');
});

describe('load', () => {
	it('shows the latest roll call of the running session', async () => {
		const result = await load(makeLoadEvent());

		expect(listRollCalls).toHaveBeenCalledWith(SUPABASE, RUNNING_SESSION.id);
		expect(result).toMatchObject({ rollCalls: ROLL_CALLS, rollCall: { id: 'roll-2' } });
	});

	it('shows the roll call the address names, the row the marker starts on, and where it came from', async () => {
		const result = await load(makeLoadEvent('?rollCall=roll-1&seat=seat-de&from=gsl'));

		expect(readRollCallAttendance).toHaveBeenCalledWith(SUPABASE, 'roll-1');
		expect(result).toMatchObject({
			rollCall: { id: 'roll-1' },
			markedSeatId: 'seat-de',
			from: 'gsl'
		});
	});

	it('reads `from` as the live room when it names nothing, anything unknown or the roll call', async () => {
		for (const search of ['', '?from=nowhere', '?from=roll-call']) {
			expect(await load(makeLoadEvent(search))).toMatchObject({ from: 'chair' });
		}
	});

	it('reads nothing when no session is running', async () => {
		const result = await load(makeLoadEvent('', null));

		expect(listRollCalls).not.toHaveBeenCalled();
		expect(result).toEqual({ rollCalls: [], rollCall: null, markedSeatId: null, from: 'chair' });
	});

	it('shows no roll call before the session has one', async () => {
		vi.mocked(listRollCalls).mockResolvedValue([]);

		const result = await load(makeLoadEvent());

		expect(readRollCallAttendance).not.toHaveBeenCalled();
		expect(result).toMatchObject({ rollCall: null });
	});
});

describe('the chair gate', () => {
	it('lets the 404 requireCommitteePermission throws for a chair of another committee propagate', async () => {
		vi.mocked(requireCommitteePermission).mockImplementation(() => {
			error(404, 'This committee does not exist.');
		});

		await expect(actions.start(makeActionEvent('start'))).rejects.toMatchObject({ status: 404 });
		expect(startRollCall).not.toHaveBeenCalled();
	});
});

describe('start', () => {
	it('adds every available seat to a new roll call and opens it', async () => {
		const redirected = await catchRedirect(() => actions.start(makeActionEvent('start')));

		expect(startRollCall).toHaveBeenCalledWith(SUPABASE, RUNNING_SESSION.id, [
			'seat-fr',
			'seat-de'
		]);
		expect(redirected).toMatchObject({
			status: 303,
			location: chairRollCallDraftUrl(CONFERENCE_SLUG, COMMITTEE_SLUG, 'roll-3')
		});
	});

	it('makes a new roll call even when the session already has one', async () => {
		vi.mocked(getChairRoomFrame).mockResolvedValue(makeFrame({ latestRollCallId: 'roll-2' }));

		const redirected = await catchRedirect(() => actions.start(makeActionEvent('start')));

		expect(startRollCall).toHaveBeenCalledTimes(1);
		expect(getOrCreateRollCall).not.toHaveBeenCalled();
		expect(redirected.location).toBe(
			chairRollCallDraftUrl(CONFERENCE_SLUG, COMMITTEE_SLUG, 'roll-3')
		);
	});

	it('refuses without a running session', async () => {
		vi.mocked(getChairRoomFrame).mockResolvedValue(makeFrame({ currentSession: null }));

		const result = (await actions.start(makeActionEvent('start'))) as FailResult;

		expect(result.data.flash.message).toBe(ROLL_CALL_REFUSALS.noSession);
		expect(startRollCall).not.toHaveBeenCalled();
	});
});

describe('setStatus', () => {
	const FIELDS = { rollCallId: 'roll-2', seatId: 'seat-de', status: 'present' };

	it('marks the one seat and sends the focus back to its row', async () => {
		const redirected = await catchRedirect(() =>
			actions.setStatus(makeActionEvent('setStatus', FIELDS))
		);

		expect(setRollCallStatus).toHaveBeenCalledWith(SUPABASE, 'roll-2', 'seat-de', 'present');
		expect(redirected.location).toBe(
			chairRollCallDraftUrl(CONFERENCE_SLUG, COMMITTEE_SLUG, 'roll-2', 'seat-de')
		);
	});

	it('refuses a roll call of another session', async () => {
		vi.mocked(readRollCallSessionId).mockResolvedValue('session-0');

		const result = (await actions.setStatus(makeActionEvent('setStatus', FIELDS))) as FailResult;

		expect(result.data.flash.message).toBe(ROLL_CALL_REFUSALS.otherSession);
		expect(setRollCallStatus).not.toHaveBeenCalled();
	});

	it('refuses a roll call the reader cannot see', async () => {
		vi.mocked(readRollCallSessionId).mockResolvedValue(null);

		const result = (await actions.setStatus(makeActionEvent('setStatus', FIELDS))) as FailResult;

		expect(result.data.flash.message).toBe(ROLL_CALL_REFUSALS.otherSession);
	});

	it('refuses an answer that is not one of the three', async () => {
		const result = (await actions.setStatus(
			makeActionEvent('setStatus', { ...FIELDS, status: 'late' })
		)) as FailResult;

		expect(result.data.flash.message).toBe(ROLL_CALL_REFUSALS.status);
		expect(setRollCallStatus).not.toHaveBeenCalled();
	});

	it('refuses a seat that is not one of the committee’s available seats', async () => {
		const result = (await actions.setStatus(
			makeActionEvent('setStatus', { ...FIELDS, seatId: 'seat-us' })
		)) as FailResult;

		expect(result.data.flash.message).toBe(ROLL_CALL_REFUSALS.seat);
		expect(setRollCallStatus).not.toHaveBeenCalled();
	});

	it('refuses without a running session', async () => {
		vi.mocked(getChairRoomFrame).mockResolvedValue(makeFrame({ currentSession: null }));

		const result = (await actions.setStatus(makeActionEvent('setStatus', FIELDS))) as FailResult;

		expect(result.data.flash.message).toBe(ROLL_CALL_REFUSALS.noSession);
		expect(getOrCreateRollCall).not.toHaveBeenCalled();
	});

	describe('with no roll call named (T160, R2)', () => {
		const OPENING_FIELDS = { seatId: 'seat-de', status: 'present' };

		it('gets or makes the session’s roll call, then marks the seat', async () => {
			await catchRedirect(() => actions.setStatus(makeActionEvent('setStatus', OPENING_FIELDS)));

			expect(getOrCreateRollCall).toHaveBeenCalledWith(SUPABASE, RUNNING_SESSION.id, [
				'seat-fr',
				'seat-de'
			]);
			expect(readRollCallSessionId).not.toHaveBeenCalled();
			expect(setRollCallStatus).toHaveBeenCalledWith(SUPABASE, 'roll-2', 'seat-de', 'present');
		});

		it('makes no roll call for a press it refuses', async () => {
			const badStatus = await actions.setStatus(
				makeActionEvent('setStatus', { ...OPENING_FIELDS, status: 'late' })
			);
			const badSeat = await actions.setStatus(
				makeActionEvent('setStatus', { ...OPENING_FIELDS, seatId: 'seat-us' })
			);

			expect((badStatus as FailResult).data.flash.message).toBe(ROLL_CALL_REFUSALS.status);
			expect((badSeat as FailResult).data.flash.message).toBe(ROLL_CALL_REFUSALS.seat);
			expect(getOrCreateRollCall).not.toHaveBeenCalled();
		});

		it('comes back to the roll call view on the roll call it made, at the row pressed', async () => {
			const redirected = await catchRedirect(() =>
				actions.setStatus(makeActionEvent('setStatus', OPENING_FIELDS))
			);

			expect(redirected).toMatchObject({
				status: 303,
				location: chairRollCallDraftUrl(CONFERENCE_SLUG, COMMITTEE_SLUG, 'roll-2', 'seat-de')
			});
		});
	});
});

describe('markAllPresent', () => {
	it('marks the roll call’s absent seats present and stays on it', async () => {
		const redirected = await catchRedirect(() =>
			actions.markAllPresent(makeActionEvent('markAllPresent', { rollCallId: 'roll-2' }))
		);

		expect(markAllPresent).toHaveBeenCalledWith(SUPABASE, 'roll-2');
		expect(redirected.location).toBe(
			chairRollCallDraftUrl(CONFERENCE_SLUG, COMMITTEE_SLUG, 'roll-2')
		);
	});

	it('refuses a roll call of another session', async () => {
		vi.mocked(readRollCallSessionId).mockResolvedValue('session-0');

		const result = (await actions.markAllPresent(
			makeActionEvent('markAllPresent', { rollCallId: 'roll-2' })
		)) as FailResult;

		expect(result.data.flash.message).toBe(ROLL_CALL_REFUSALS.otherSession);
		expect(markAllPresent).not.toHaveBeenCalled();
	});

	it('from the opening band, gets or makes the session’s roll call and goes back to the band’s page', async () => {
		const fromRoom = await catchRedirect(() =>
			actions.markAllPresent(makeActionEvent('markAllPresent', { [FROM_VIEW_FIELD]: 'chair' }))
		);
		const fromGsl = await catchRedirect(() =>
			actions.markAllPresent(makeActionEvent('markAllPresent', { [FROM_VIEW_FIELD]: 'gsl' }))
		);

		expect(getOrCreateRollCall).toHaveBeenCalledWith(SUPABASE, RUNNING_SESSION.id, [
			'seat-fr',
			'seat-de'
		]);
		expect(markAllPresent).toHaveBeenCalledWith(SUPABASE, 'roll-2');
		expect(fromRoom.location).toBe(chairRoomUrl(CONFERENCE_SLUG, COMMITTEE_SLUG));
		expect(fromGsl.location).toBe(chairGslUrl(CONFERENCE_SLUG, COMMITTEE_SLUG));
	});
});

describe('the page the view was opened from', () => {
	it('is kept through every press of the view, so "Return to the floor" still leads there', async () => {
		const fields = { rollCallId: 'roll-2', seatId: 'seat-fr', status: 'absent' };
		const pressed = await catchRedirect(() =>
			actions.setStatus(
				makeActionEvent('setStatus', { ...fields, [ROLL_CALL_FROM_FIELD]: 'motions' })
			)
		);
		const started = await catchRedirect(() =>
			actions.start(makeActionEvent('start', { [ROLL_CALL_FROM_FIELD]: 'gsl' }))
		);

		expect(pressed.location).toBe(`${ROLL_CALL_PATH}?rollCall=roll-2&seat=seat-fr&from=motions`);
		expect(started.location).toBe(`${ROLL_CALL_PATH}?rollCall=roll-3&from=gsl`);
	});
});

describe('finish', () => {
	it('is gone: every answer is saved as it is pressed (S5)', () => {
		expect(actions).not.toHaveProperty('finish');
	});
});

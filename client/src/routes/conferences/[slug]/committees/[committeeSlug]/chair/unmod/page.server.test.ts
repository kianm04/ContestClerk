import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the actions are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
import type { ChairRoomFrame, CommitteeSession } from '$lib/chair-room';

// The readers and every server module behind the actions are stood in for, so
// these tests are about the page itself: what `load` reads, what "Start
// caucus" checks and writes, and that the floor's, the list's and the
// caucus's actions are all offered here. Their own rules are tested in
// `$lib/server/*.test.ts`, and the whole view runs against a real database in
// `tests/e2e/chair-unmod.spec.ts`.
vi.mock('$lib/server/caucus-view', () => ({ readUnmodView: vi.fn() }));

vi.mock('$lib/server/mode-starts', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/mode-starts')>()),
	checkStart: vi.fn(),
	hasOpenVote: vi.fn(),
	startCaucusDirectly: vi.fn()
}));

vi.mock('$lib/server/access', () => ({ requireCommitteePermission: vi.fn() }));

vi.mock('$lib/server/committee-room', () => ({
	getActiveSpeakersList: vi.fn(),
	getChairRoomFrame: vi.fn(),
	setRoomMode: vi.fn(),
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
import { readUnmodView } from '$lib/server/caucus-view';
import { getChairRoomFrame } from '$lib/server/committee-room';
import { checkStart, hasOpenVote, startCaucusDirectly } from '$lib/server/mode-starts';

const SUPABASE = {};
const SEATS = [{ id: 'seat-br', name: 'Brazil', countryCode: 'BR' }];
const MOTION_ID = '0d1e2f3a-4b5c-4d6e-8f90-a1b2c3d4e5f6';
const UNMOD_URL = '/conferences/thimun-2027/committees/unsc/chair/unmod';

const RUNNING_SESSION: CommitteeSession = {
	id: 'session-1',
	name: 'Session 1',
	status: 'in_progress',
	startedAt: '2026-10-01T09:00:00.000Z',
	endedAt: null
};

const FRAME = {
	committeeState: { mode: 'formal_debate' },
	currentSession: RUNNING_SESSION,
	seats: SEATS,
	attendance: {}
} as unknown as ChairRoomFrame;

/** The page `load`'s event, whose `parent()` answers what the chair layout returned. */
function makeLoadEvent(
	currentSession: CommitteeSession | null = RUNNING_SESSION,
	search = ''
): PageServerLoadEvent {
	return {
		url: new URL(`http://localhost${UNMOD_URL}${search}`),
		locals: { supabase: SUPABASE },
		depends: vi.fn(),
		parent: async () => ({
			committee: { id: 'committee-1' },
			committeeState: FRAME.committeeState,
			currentSession,
			seats: SEATS
		})
	} as unknown as PageServerLoadEvent;
}

/** A post to one of the page's actions, carrying `fields` as its form. */
function makeActionEvent(fields: Record<string, string>): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) formData.set(name, value);

	return {
		params: { slug: 'thimun-2027', committeeSlug: 'unsc' },
		url: new URL(`http://localhost${UNMOD_URL}`),
		locals: { supabase: SUPABASE },
		cookies: {},
		request: { formData: async () => formData }
	} as unknown as RequestEvent;
}

/** A refused start: 400, with what was typed and the toast or the field messages. */
type StartFailure = {
	status: number;
	data: {
		values: Record<string, string>;
		errors?: Record<string, string>;
		flash?: { message: string };
	};
};

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(readUnmodView).mockResolvedValue({ gsl: null, motion: null });
	vi.mocked(hasOpenVote).mockResolvedValue(false);
	vi.mocked(requireCommitteePermission).mockResolvedValue({
		user: { id: 'user-1', email: 'amira@example.com' },
		conference: {} as Awaited<ReturnType<typeof requireCommitteePermission>>['conference'],
		committee: { id: 'committee-1', defaultSpeakingTimeSeconds: 90 } as Awaited<
			ReturnType<typeof requireCommitteePermission>
		>['committee']
	});
	vi.mocked(getChairRoomFrame).mockResolvedValue(FRAME);
	vi.mocked(checkStart).mockResolvedValue({ sessionId: 'session-1' });
	vi.mocked(startCaucusDirectly).mockResolvedValue(null);
});

describe('load', () => {
	it('reads the GSL and the caucus, whether a vote is open, and the speaking time field', async () => {
		const event = makeLoadEvent();

		expect(await load(event)).toEqual({
			unmod: { gsl: null, motion: null },
			hasOpenVote: false,
			isTimeFieldOpen: false
		});
		expect(readUnmodView).toHaveBeenCalledWith(SUPABASE, {
			committeeState: FRAME.committeeState,
			currentSession: RUNNING_SESSION,
			seats: SEATS
		});
		expect(event.depends).toHaveBeenCalledWith('committee-room:committee-1');
		expect(await load(makeLoadEvent(RUNNING_SESSION, '?time=change'))).toMatchObject({
			isTimeFieldOpen: true
		});
	});

	it('asks nobody about a vote while no session runs', async () => {
		expect(await load(makeLoadEvent(null))).toMatchObject({ hasOpenVote: false });
		expect(hasOpenVote).not.toHaveBeenCalled();
	});
});

describe('actions', () => {
	it('offers the start, the clock, the list’s and the caucus’s actions', () => {
		expect(Object.keys(actions)).toEqual(
			expect.arrayContaining([
				'startUnmoderated',
				'timerPause',
				'timerResume',
				'timerAdd',
				'add',
				'moveTo',
				'setSpeakingTime',
				'endCaucus'
			])
		);
	});
});

describe('startUnmoderated', () => {
	it('records the caucus started without a vote, its clock running from the press', async () => {
		const pressedAt = new Date(Date.now() - 400).toISOString();
		const event = makeActionEvent({
			length: '10:00',
			lengthTyped: '12',
			topic: 'Drafting',
			proposedBySeatId: 'seat-br',
			newRowId: MOTION_ID,
			pressedAt
		});
		let thrown: unknown = null;

		try {
			await actions.startUnmoderated(event);
		} catch (redirect) {
			thrown = redirect;
		}

		expect(startCaucusDirectly).toHaveBeenCalledWith(
			SUPABASE,
			{ committeeId: 'committee-1', sessionId: 'session-1', pressedAt: new Date(pressedAt) },
			{
				kind: 'unmoderated_caucus',
				proposedBySeatId: 'seat-br',
				topic: 'Drafting',
				totalSeconds: 720,
				speakingSeconds: null
			},
			MOTION_ID
		);
		expect(thrown).toEqual(expect.objectContaining({ status: 303, location: UNMOD_URL }));
	});

	it('refuses a length outside 1 to 60 minutes, keeping what was typed', async () => {
		const result = (await actions.startUnmoderated(
			makeActionEvent({ lengthTyped: '90' })
		)) as StartFailure;

		expect(result.data.errors?.length).toBe('Total time must be between 1 and 60 minutes.');
		expect(result.data.values.lengthTyped).toBe('90');
		expect(startCaucusDirectly).not.toHaveBeenCalled();
	});

	it('refuses while a vote is open, with the button’s words', async () => {
		vi.mocked(checkStart).mockResolvedValue({ refusal: 'Close the open vote first.' });

		const result = (await actions.startUnmoderated(
			makeActionEvent({ length: '10:00' })
		)) as StartFailure;

		expect(result.data.flash?.message).toBe('Close the open vote first.');
	});
});

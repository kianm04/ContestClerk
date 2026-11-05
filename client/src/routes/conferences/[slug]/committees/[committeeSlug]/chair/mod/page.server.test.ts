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
// `tests/e2e/chair-mod.spec.ts`.
vi.mock('$lib/server/caucus-view', () => ({ readModView: vi.fn(), readUnmodView: vi.fn() }));

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
import { readModView } from '$lib/server/caucus-view';
import { getChairRoomFrame } from '$lib/server/committee-room';
import { checkStart, hasOpenVote, startCaucusDirectly } from '$lib/server/mode-starts';

const SUPABASE = {};
const SEATS = [{ id: 'seat-br', name: 'Brazil', countryCode: 'BR' }];
const MOTION_ID = '0d1e2f3a-4b5c-4d6e-8f90-a1b2c3d4e5f6';
const MOD_URL = '/conferences/thimun-2027/committees/unsc/chair/mod';

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
	currentSession: CommitteeSession | null = RUNNING_SESSION
): PageServerLoadEvent {
	return {
		url: new URL(`http://localhost${MOD_URL}`),
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
		url: new URL(`http://localhost${MOD_URL}`),
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
	vi.mocked(readModView).mockResolvedValue({ list: null, motion: null });
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
	it('reads the running caucus and whether a vote is open', async () => {
		const event = makeLoadEvent();

		expect(await load(event)).toEqual({ mod: { list: null, motion: null }, hasOpenVote: false });
		expect(readModView).toHaveBeenCalledWith(SUPABASE, {
			committeeState: FRAME.committeeState,
			currentSession: RUNNING_SESSION,
			seats: SEATS
		});
		expect(hasOpenVote).toHaveBeenCalledWith(SUPABASE, 'session-1');
		expect(event.depends).toHaveBeenCalledWith('committee-room:committee-1');
	});

	it('reads nothing while no session runs', async () => {
		expect(await load(makeLoadEvent(null))).toEqual({ mod: null, hasOpenVote: false });
		expect(readModView).not.toHaveBeenCalled();
	});
});

describe('actions', () => {
	it('offers the start, the floor’s, the list’s and the caucus’s actions', () => {
		expect(Object.keys(actions)).toEqual(
			expect.arrayContaining([
				'startModerated',
				'nextSpeaker',
				'timerResume',
				'endSpeech',
				'add',
				'moveTo',
				'speakNow',
				'recognise',
				'extendCaucus',
				'endCaucus'
			])
		);
	});
});

describe('startModerated', () => {
	it('records the caucus started without a vote, under the browser’s id, and stays on the view', async () => {
		const event = makeActionEvent({
			topic: 'Corridors',
			totalTime: '15',
			speakingTime: '1:00',
			proposedBySeatId: 'seat-br',
			newRowId: MOTION_ID
		});
		let thrown: unknown = null;

		try {
			await actions.startModerated(event);
		} catch (redirect) {
			thrown = redirect;
		}

		expect(startCaucusDirectly).toHaveBeenCalledWith(
			SUPABASE,
			expect.objectContaining({ committeeId: 'committee-1', sessionId: 'session-1' }),
			{
				kind: 'moderated_caucus',
				proposedBySeatId: 'seat-br',
				topic: 'Corridors',
				totalSeconds: 900,
				speakingSeconds: 60
			},
			MOTION_ID
		);
		expect(thrown).toEqual(expect.objectContaining({ status: 303, location: MOD_URL }));
	});

	it('refuses a form that needs fixing, keeping what was typed', async () => {
		const result = (await actions.startModerated(makeActionEvent({ topic: '' }))) as StartFailure;

		expect(result.status).toBe(400);
		expect(result.data.errors?.topic).toBe('A moderated caucus needs a topic.');
		expect(result.data.values.topic).toBe('');
		expect(startCaucusDirectly).not.toHaveBeenCalled();
	});

	it('refuses while a vote is open, with the button’s words', async () => {
		vi.mocked(checkStart).mockResolvedValue({ refusal: 'Close the open vote first.' });

		const result = (await actions.startModerated(
			makeActionEvent({ topic: 'Corridors' })
		)) as StartFailure;

		expect(result.data.flash?.message).toBe('Close the open vote first.');
		expect(result.data.values.topic).toBe('Corridors');
		expect(startCaucusDirectly).not.toHaveBeenCalled();
	});

	it('passes on the database’s refusal', async () => {
		vi.mocked(startCaucusDirectly).mockResolvedValue('Resume the session first.');

		const result = (await actions.startModerated(
			makeActionEvent({ topic: 'Corridors' })
		)) as StartFailure;

		expect(result.data.flash?.message).toBe('Resume the session first.');
	});
});

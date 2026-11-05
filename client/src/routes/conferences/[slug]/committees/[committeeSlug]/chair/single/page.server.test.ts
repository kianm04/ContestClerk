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
// `tests/e2e/chair-single-speaker.spec.ts`.
vi.mock('$lib/server/single-speaker-view', () => ({ readSingleSpeakerView: vi.fn() }));

vi.mock('$lib/server/mode-starts', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/mode-starts')>()),
	checkStart: vi.fn(),
	hasOpenVote: vi.fn(),
	startSingleSpeaker: vi.fn()
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
import { getChairRoomFrame } from '$lib/server/committee-room';
import { checkStart, hasOpenVote, startSingleSpeaker } from '$lib/server/mode-starts';
import { readSingleSpeakerView } from '$lib/server/single-speaker-view';

const SUPABASE = {};
const SEATS = [{ id: 'seat-br', name: 'Brazil', countryCode: 'BR' }];
const SINGLE_URL = '/conferences/thimun-2027/committees/unsc/chair/single';

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
		url: new URL(`http://localhost${SINGLE_URL}`),
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
		url: new URL(`http://localhost${SINGLE_URL}`),
		locals: { supabase: SUPABASE },
		cookies: {},
		request: { formData: async () => formData }
	} as unknown as RequestEvent;
}

/** A refused start: 400, with what was typed and the toast or the messages. */
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
	vi.mocked(readSingleSpeakerView).mockResolvedValue(null);
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
	vi.mocked(startSingleSpeaker).mockResolvedValue(null);
});

describe('load', () => {
	it('reads the single speaker and whether a vote is open', async () => {
		const event = makeLoadEvent();

		expect(await load(event)).toEqual({ single: null, hasOpenVote: false });
		expect(readSingleSpeakerView).toHaveBeenCalledWith(SUPABASE, {
			committeeState: FRAME.committeeState,
			currentSession: RUNNING_SESSION,
			seats: SEATS
		});
		expect(event.depends).toHaveBeenCalledWith('committee-room:committee-1');
	});

	it('reads nothing while no session runs', async () => {
		expect(await load(makeLoadEvent(null))).toEqual({ single: null, hasOpenVote: false });
		expect(readSingleSpeakerView).not.toHaveBeenCalled();
	});
});

describe('actions', () => {
	it('offers the start, the floor’s, the list’s actions and "Return to GSL"', () => {
		expect(Object.keys(actions)).toEqual(
			expect.arrayContaining([
				'startSingle',
				'nextSpeaker',
				'timerResume',
				'yieldToSeat',
				'endSpeech',
				'add',
				'remove',
				'returnToGsl'
			])
		);
	});
});

describe('startSingle', () => {
	it('gives a typed name the floor with its purpose and time, and stays on the view', async () => {
		const event = makeActionEvent({
			speakerName: 'Secretary-General',
			purpose: 'Right of reply',
			time: '1:00'
		});
		let thrown: unknown = null;

		try {
			await actions.startSingle(event);
		} catch (redirect) {
			thrown = redirect;
		}

		expect(startSingleSpeaker).toHaveBeenCalledWith(
			SUPABASE,
			expect.objectContaining({ committeeId: 'committee-1' }),
			{
				seatId: null,
				speakerName: 'Secretary-General',
				purpose: 'Right of reply',
				speakingSeconds: 60
			}
		);
		expect(thrown).toEqual(expect.objectContaining({ status: 303, location: SINGLE_URL }));
	});

	it('refuses with neither a seat nor a name, keeping what was typed', async () => {
		const result = (await actions.startSingle(
			makeActionEvent({ purpose: 'Presentation', time: '2:00' })
		)) as StartFailure;

		expect(result.data.errors?.who).toBe('Choose a delegation or type a name.');
		expect(result.data.values.purpose).toBe('Presentation');
		expect(startSingleSpeaker).not.toHaveBeenCalled();
	});

	it('refuses while the session is suspended, with the button’s words', async () => {
		vi.mocked(checkStart).mockResolvedValue({ refusal: 'Resume the session first.' });

		const result = (await actions.startSingle(
			makeActionEvent({ seatId: 'seat-br', time: '1:00' })
		)) as StartFailure;

		expect(result.data.flash?.message).toBe('Resume the session first.');
	});

	it('passes on the database’s refusal', async () => {
		vi.mocked(startSingleSpeaker).mockResolvedValue('Close the open vote first.');

		const result = (await actions.startSingle(
			makeActionEvent({ seatId: 'seat-br', time: '1:00' })
		)) as StartFailure;

		expect(result.data.flash?.message).toBe('Close the open vote first.');
	});
});

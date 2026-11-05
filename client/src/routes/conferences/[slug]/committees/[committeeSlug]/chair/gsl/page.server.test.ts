import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the actions are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
import type { CommitteeSession } from '$lib/chair-room';
import type { GslList } from '$lib/gsl-floor';

// The reader and every server module behind the actions are stood in for, so
// these tests are about the page itself: what `load` reads, and that the
// floor's and the queue column's actions are both offered here and send the
// chair back to the GSL view. The actions' own rules are tested in
// `$lib/server/chair-floor-actions.test.ts` and `speaker-queue-actions.test.ts`,
// and the whole view runs against a real database in `tests/e2e/chair-gsl.spec.ts`.
vi.mock('$lib/server/gsl-view', () => ({ readGslList: vi.fn() }));

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
import { readGslList } from '$lib/server/gsl-view';
import { getSpeakersLists, setListOpen } from '$lib/server/speakers-list-edits';

const SUPABASE = {};
const SEATS = [{ id: 'seat-fr', name: 'France', countryCode: 'FR' }];

const RUNNING_SESSION: CommitteeSession = {
	id: 'session-1',
	name: 'Session 1',
	status: 'in_progress',
	startedAt: '2026-10-01T09:00:00.000Z',
	endedAt: null
};

const GSL: GslList = {
	speakersList: {
		id: 'gsl-1',
		name: "General Speakers' List",
		speakingTimeSeconds: 90,
		isOpen: true
	},
	speakers: []
};

/** The page `load`'s event, whose `parent()` answers what the chair layout returned. */
function makeLoadEvent(
	search: string,
	currentSession: CommitteeSession | null = RUNNING_SESSION
): PageServerLoadEvent {
	return {
		url: new URL(`http://localhost/conferences/thimun-2027/committees/unsc/chair/gsl${search}`),
		locals: { supabase: SUPABASE },
		depends: vi.fn(),
		parent: async () => ({ committee: { id: 'committee-1' }, currentSession, seats: SEATS })
	} as unknown as PageServerLoadEvent;
}

/** A post to one of the page's actions, carrying `fields` as its form. */
function makeActionEvent(fields: Record<string, string>): RequestEvent {
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
	} as unknown as RequestEvent;
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(readGslList).mockResolvedValue(GSL);
});

describe('load', () => {
	it("reads the running session's General Speakers' List with the layout's seats", async () => {
		const event = makeLoadEvent('');

		expect(await load(event)).toEqual({ gsl: GSL, isTimeFieldOpen: false });
		expect(readGslList).toHaveBeenCalledWith(SUPABASE, 'session-1', SEATS);
		expect(event.depends).toHaveBeenCalledWith('committee-room:committee-1');
	});

	it('opens the speaking time field when the address asks for it', async () => {
		expect(await load(makeLoadEvent('?time=change'))).toMatchObject({ isTimeFieldOpen: true });
	});

	it('reads no list while no session is running', async () => {
		const ended = { ...RUNNING_SESSION, status: 'ended' as const };

		expect(await load(makeLoadEvent('', null))).toMatchObject({ gsl: null });
		expect(await load(makeLoadEvent('', ended))).toMatchObject({ gsl: null });
		expect(readGslList).not.toHaveBeenCalled();
	});
});

describe('actions', () => {
	it("offers the floor's and the queue column's actions", () => {
		expect(Object.keys(actions).sort()).toEqual([
			'add',
			'closeList',
			'endSpeech',
			'moveDown',
			'moveTo',
			'moveToTop',
			'moveUp',
			'nextSpeaker',
			'openList',
			'remove',
			'setSpeakingTime',
			'speakNow',
			'timerAdd',
			'timerPause',
			'timerReset',
			'timerResume',
			'timerStart',
			'yieldToChair',
			'yieldToSeat'
		]);
	});

	it('sends the chair back to the GSL view once an action has worked', async () => {
		vi.mocked(requireCommitteePermission).mockResolvedValue({
			user: { id: 'user-1', email: 'amira@example.com' },
			conference: {} as Awaited<ReturnType<typeof requireCommitteePermission>>['conference'],
			committee: {} as Awaited<ReturnType<typeof requireCommitteePermission>>['committee']
		});
		vi.mocked(getChairRoomFrame).mockResolvedValue({
			currentSession: RUNNING_SESSION,
			seats: SEATS
		} as Awaited<ReturnType<typeof getChairRoomFrame>>);
		vi.mocked(getSpeakersLists).mockResolvedValue([GSL]);

		let thrown: unknown = null;

		try {
			await actions.closeList(makeActionEvent({ listId: 'gsl-1' }));
		} catch (redirect) {
			thrown = redirect;
		}

		expect(setListOpen).toHaveBeenCalledWith(SUPABASE, 'gsl-1', false);
		expect(thrown).toMatchObject({
			status: 303,
			location: '/conferences/thimun-2027/committees/unsc/chair/gsl'
		});
	});
});
